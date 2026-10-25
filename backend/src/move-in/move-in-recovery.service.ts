import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../common/database/prisma.service';
import { PayoutJobsService } from '../jobs/payout-jobs.service';
import { MOVE_IN_DEADLINE_QUEUE } from './move-in-deadline.processor';

/** Re-enqueue committed work if Redis was unavailable after the DB transaction. */
@Injectable()
export class MoveInRecoveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MoveInRecoveryService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  constructor(private readonly prisma: PrismaService, private readonly payouts: PayoutJobsService, @InjectQueue(MOVE_IN_DEADLINE_QUEUE) private readonly deadlines: Queue) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.recover(), 60_000);
    this.timer.unref();
    void this.recover();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  private async recover() {
    if (this.running) return;
    this.running = true;
    try {
      const reminders = await this.prisma.moveInVerification.findMany({ where: { submittedAt: null, deadlineAt: { not: null }, tenancy: { status: 'PENDING_MOVE_IN' }, status: { in: ['PENDING_VERIFICATION', 'IN_PROGRESS', 'ISSUE_REPORTED', 'UNDER_REVIEW'] } }, select: { id: true, deadlineAt: true }, take: 1000 });
      for (const item of reminders) {
        const deadline = item.deadlineAt!.getTime();
        await this.deadlines.add('reminder', { verificationId: item.id, overdue: false }, { delay: Math.max(0, deadline - Date.now() - 24 * 60 * 60 * 1000), jobId: `reminder-${item.id}`, attempts: 5, backoff: { type: 'exponential', delay: 10000 } });
        await this.deadlines.add('overdue', { verificationId: item.id, overdue: true }, { delay: Math.max(0, deadline - Date.now()), jobId: `overdue-${item.id}`, attempts: 5, backoff: { type: 'exponential', delay: 10000 } });
      }
      // A payout is committed before its background job is added. Requeue all
      // scheduled payouts so an interrupted queue connection cannot leave a
      // landlord, agent, or tenant payment stuck indefinitely.
      const scheduledPayouts = await this.prisma.payout.findMany({ where: { status: 'SCHEDULED' }, select: { id: true }, take: 1000 });
      for (const payout of scheduledPayouts) await this.payouts.enqueue(payout.id);
    } catch (error) {
      this.logger.warn(`Move-in queue recovery will retry: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally { this.running = false; }
  }
}
