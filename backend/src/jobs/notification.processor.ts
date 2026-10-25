import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { NOTIFICATIONS_QUEUE } from './queue.constants';
import { NotificationJob } from './notification-jobs.service';
import { EmailDeliveryService } from '../common/email/email-delivery.service';
import { PrismaService } from '../common/database/prisma.service';
import { PushDeliveryService } from './push-delivery.service';

@Processor(NOTIFICATIONS_QUEUE)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailDelivery: EmailDeliveryService,
    private readonly pushDelivery: PushDeliveryService,
  ) {
    super();
  }

  async process(job: Job<NotificationJob>): Promise<void> {
    if (job.data.channel === 'IN_APP') return;
    if (job.data.channel === 'PUSH') return this.pushDelivery.deliver(job.data.notificationId, job.data.userId);
    const user = await this.prisma.user.findUnique({ where: { id: job.data.userId }, select: { email: true } });
    if (!user) return;
    const result = await this.emailDelivery.notification(user.email, job.data.title, job.data.body);
    if (!result.delivered) this.logger.warn(`Email notification remains undelivered while EMAIL_PROVIDER is disabled (notification: ${job.data.notificationId}).`);
  }
}
