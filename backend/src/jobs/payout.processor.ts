import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PayoutExecutionService } from '../financials/payout-execution.service';
import { PayoutJob } from './payout-jobs.service';
import { PAYOUTS_QUEUE } from './queue.constants';

@Processor(PAYOUTS_QUEUE)
export class PayoutProcessor extends WorkerHost {
  constructor(private readonly payoutExecutionService: PayoutExecutionService) {
    super();
  }

  process(job: Job<PayoutJob>): Promise<void> {
    return this.payoutExecutionService.execute(job.data.payoutId);
  }
}
