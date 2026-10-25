import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { NOTIFICATIONS_QUEUE } from './queue.constants';

export interface NotificationJob {
  notificationId: string;
  userId: string;
  title: string;
  body: string;
  channel: 'EMAIL' | 'IN_APP' | 'PUSH';
  conversationId?: string;
}

@Injectable()
export class NotificationJobsService {
  constructor(@InjectQueue(NOTIFICATIONS_QUEUE) private readonly notificationsQueue: Queue<NotificationJob>) {}

  enqueue(data: NotificationJob): Promise<void> {
    return this.notificationsQueue
      .add('deliver-notification', data, {
        // Re-enqueueing the same notification must not submit the same channel twice.
        jobId: `notification-${data.notificationId}-${data.channel}`,
        // Coalesce only repeated conversation push alerts; transactional events remain independent.
        ...(data.channel === 'PUSH' && data.conversationId ? { deduplication: { id: `message-${data.userId}-${data.conversationId}`, ttl: 60_000 } } : {}),
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      })
      .then(() => undefined);
  }
}
