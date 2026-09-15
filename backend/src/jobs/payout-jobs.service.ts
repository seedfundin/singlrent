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

  enqueue(payoutId: string): Promise<void> {
    return this.payoutsQueue
      .add('execute-payout', { payoutId }, {
        jobId: `payout:${payoutId}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      })
      .then(() => undefined);
  }
}
