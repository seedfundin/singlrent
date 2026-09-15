import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { NOTIFICATIONS_QUEUE } from './queue.constants';

export interface NotificationJob {
  notificationId: string;
  userId: string;
  title: string;
  body: string;
  channel: 'EMAIL' | 'IN_APP';
}

@Injectable()
export class NotificationJobsService {
  constructor(@InjectQueue(NOTIFICATIONS_QUEUE) private readonly notificationsQueue: Queue<NotificationJob>) {}

  enqueue(data: NotificationJob): Promise<void> {
    return this.notificationsQueue
      .add('deliver-notification', data, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      })
      .then(() => undefined);
  }
}
