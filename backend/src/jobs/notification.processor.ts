import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { NOTIFICATIONS_QUEUE } from './queue.constants';
import { NotificationJob } from './notification-jobs.service';

@Processor(NOTIFICATIONS_QUEUE)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  async process(job: Job<NotificationJob>): Promise<void> {
    // Delivery providers are deliberately not selected yet; jobs are durable from day one.
    this.logger.log(`Queued ${job.data.channel} notification for user ${job.data.userId}`);
  }
}
