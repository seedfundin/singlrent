import { Processor, WorkerHost } from '@nestjs/bullmq';
import { NotificationType, RoleCode } from '@prisma/client';
import { Job } from 'bullmq';
import { PrismaService } from '../common/database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

export const MOVE_IN_DEADLINE_QUEUE = 'move-in-deadlines';
@Processor(MOVE_IN_DEADLINE_QUEUE)
export class MoveInDeadlineProcessor extends WorkerHost {
  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService) { super(); }
  async process(job: Job<{ verificationId: string; overdue: boolean }>): Promise<void> {
    const v = await this.prisma.moveInVerification.findUnique({ where: { id: job.data.verificationId }, include: { tenancy: true } });
    if (!v || v.submittedAt || !v.deadlineAt || v.tenancy.status !== 'PENDING_MOVE_IN') return;
    if (job.data.overdue) {
      if (v.deadlineAt.getTime() > Date.now()) return;
      const changed = await this.prisma.moveInVerification.updateMany({ where: { id: v.id, submittedAt: null, status: { in: ['PENDING_VERIFICATION', 'IN_PROGRESS'] } }, data: { status: 'OVERDUE' } });
      if (!changed.count) {
        // A serious dispute keeps its own status; an overdue checklist must
        // still be brought to an administrator's attention without treating
        // the deadline as acceptance of the property.
        const current = await this.prisma.moveInVerification.findUnique({ where: { id: v.id }, select: { status: true, submittedAt: true } });
        if (!current || current.submittedAt || !['ISSUE_REPORTED', 'UNDER_REVIEW'].includes(current.status)) return;
      }
      const admins = await this.prisma.user.findMany({ where: { status: 'ACTIVE', userRoles: { some: { role: { code: { in: [RoleCode.ADMIN, RoleCode.SUPER_ADMIN] } } } } }, select: { id: true } });
      await Promise.allSettled(admins.map(({ id }) => this.notifications.create({ userId: id, type: NotificationType.VERIFICATION_UPDATED, title: 'Move-in verification overdue', body: 'A tenant has not completed the checklist. Review the case; payment is not released automatically.', data: { tenancyId: v.tenancyId } })));
    }
    await this.notifications.create({ userId: v.tenancy.tenantId, type: NotificationType.VERIFICATION_UPDATED, title: job.data.overdue ? 'Move-in verification overdue' : 'Move-in verification reminder', body: 'Please review and submit your property checklist. The deadline does not automatically release the payment.', data: { tenancyId: v.tenancyId } });
  }
}
