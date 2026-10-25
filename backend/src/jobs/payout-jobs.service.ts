import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PAYOUTS_QUEUE } from './queue.constants';

export interface PayoutJob {
  payoutId: string;
}

@Injectable()
export class PayoutJobsService {
  constructor(@InjectQueue(PAYOUTS_QUEUE) private readonly payoutsQueue: Queue<PayoutJob>) {}

  async enqueue(payoutId: string): Promise<void> {
    const jobId = `payout-${payoutId}`;
    const existing = await this.payoutsQueue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'waiting' || state === 'active' || state === 'delayed') return;
      // A completed or failed job with this durable ID will otherwise make
      // BullMQ return the old job, leaving a newly scheduled payout stuck.
      await existing.remove();
    }
    await this.payoutsQueue
      .add('execute-payout', { payoutId }, {
        // BullMQ reserves colons in custom job IDs. A dash keeps this stable
        // for de-duplication without preventing a scheduled payout from
        // entering the queue.
        jobId,
        attempts: 5,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      });
  }
}
