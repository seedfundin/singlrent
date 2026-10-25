import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationChannel, NotificationType, Prisma } from '@prisma/client';
import { pageResult, Paginated } from '../common/http/pagination';
import { PrismaService } from '../common/database/prisma.service';
import { NotificationJobsService } from '../jobs/notification-jobs.service';
import { RealtimeGateway } from '../websocket/realtime.gateway';
import { NotificationQuery, UpdatePreferencesRequest } from './dto/notification.schemas';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly notificationJobs: NotificationJobsService,
  ) {}

  async create(input: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    data?: Prisma.InputJsonValue;
  }) {
    const notification = await this.prisma.notification.create({ data: input });
    this.realtimeGateway.emitNotification(input.userId, notification);
    await this.enqueueEnabledDeliveries(notification.id, input.userId, input.title, input.body, input.type, input.data).catch(() => {
      this.logger.warn('Could not queue notification deliveries; the in-app record was preserved.');
    });
    return notification;
  }

  // Used after a transactional notification record has committed. The record is
  // still the source of truth, and delivery problems never undo the transaction.
  async dispatchExisting(notification: { id: string; userId: string; title: string; body: string; type: NotificationType; data?: unknown }): Promise<void> {
    await this.enqueueEnabledDeliveries(notification.id, notification.userId, notification.title, notification.body, notification.type, notification.data).catch(() => undefined);
  }

  async list(userId: string, query: NotificationQuery): Promise<Paginated<Awaited<ReturnType<PrismaService['notification']['findMany']>>[number]>> {
    const where = { userId, readAt: query.unreadOnly ? null : undefined };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return pageResult(items, total, query);
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    const result = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count === 0) {
      const exists = await this.prisma.notification.findFirst({ where: { id: notificationId, userId } });
      if (!exists) {
        throw new NotFoundException('Notification not found');
      }
    }
  }

  async getOne(userId: string, notificationId: string) {
    // Invalid IDs must not produce database errors, and records are always scoped to the current user.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(notificationId)) throw new NotFoundException('Notification not found');
    const notification = await this.prisma.notification.findFirst({ where: { id: notificationId, userId } });
    if (!notification) throw new NotFoundException('Notification not found');
    return notification;
  }

  markAllRead(userId: string): Promise<void> {
    return this.prisma.notification
      .updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } })
      .then(() => undefined);
  }

  async getPreferences(userId: string) {
    return this.prisma.notificationPreference.findMany({
      where: { userId },
      orderBy: [{ type: 'asc' }, { channel: 'asc' }],
    });
  }

  async updatePreferences(userId: string, input: UpdatePreferencesRequest) {
    await this.prisma.$transaction(
      input.preferences.map((preference) =>
        this.prisma.notificationPreference.upsert({
          where: {
            userId_type_channel: {
              userId,
              type: preference.type,
              channel: preference.channel,
            },
          },
          create: { userId, ...preference },
          update: { enabled: preference.enabled },
        }),
      ),
    );
    return this.getPreferences(userId);
  }

  private async enqueueEnabledDeliveries(
    notificationId: string,
    userId: string,
    title: string,
    body: string,
    type: NotificationType,
    data?: unknown,
  ): Promise<void> {
    const conversationId = type === NotificationType.NEW_MESSAGE && data && typeof data === 'object' && 'conversationId' in data && typeof data.conversationId === 'string' && /^[0-9a-f-]{36}$/i.test(data.conversationId) ? data.conversationId : undefined;
    const preferences = await this.prisma.notificationPreference.findMany({ where: { userId, type } });
    const disabled = new Set(preferences.filter((preference) => !preference.enabled).map((preference) => preference.channel));
    const channels: Array<'IN_APP' | 'EMAIL' | 'PUSH'> = [NotificationChannel.IN_APP, NotificationChannel.EMAIL];
    if (process.env.PUSH_NOTIFICATIONS_ENABLED === 'true') channels.push(NotificationChannel.PUSH);
    await Promise.all(
      channels
        .filter((channel) => !disabled.has(channel))
        .map((channel) =>
          this.notificationJobs.enqueue({ userId, title, body, channel, notificationId, conversationId }).catch(() => undefined),
        ),
    );
  }
}
