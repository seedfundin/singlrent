import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma, RoleCode } from '@prisma/client';
import { PrismaService } from '../common/database/prisma.service';
import { AgreementsService } from '../documents/agreements.service';
import { MediaService } from '../media/media.service';
import { NotificationsService } from '../notifications/notifications.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { MOVE_IN_DEADLINE_QUEUE } from './move-in-deadline.processor';
import { Answer, blocksVerification, checklistItems, issueTypes, validateSubmittedChecklist } from './move-in.rules';

type IssueKey = keyof typeof issueTypes;
type SubmissionAnswer = Answer & { issueType?: IssueKey };

@Injectable()
export class MoveInService {
  constructor(private readonly prisma: PrismaService, private readonly agreements: AgreementsService, private readonly media: MediaService, private readonly notifications: NotificationsService, @InjectQueue(MOVE_IN_DEADLINE_QUEUE) private readonly deadlines: Queue, private readonly config: ConfigService) {}

  private async notify(tenancyId: string, actorId: string, title: string, body: string, admins = false) {
    const tenancy = await this.prisma.tenancy.findUnique({ where: { id: tenancyId }, select: { tenantId: true, landlordId: true, agentId: true } });
    if (!tenancy) return;
    const adminUsers = admins ? await this.prisma.user.findMany({ where: { status: 'ACTIVE', userRoles: { some: { role: { code: { in: [RoleCode.ADMIN, RoleCode.SUPER_ADMIN] } } } } }, select: { id: true } }) : [];
    const recipients = [...new Set([tenancy.tenantId, tenancy.landlordId, tenancy.agentId, ...adminUsers.map((user) => user.id)].filter((id): id is string => Boolean(id) && id !== actorId))];
    await Promise.allSettled(recipients.map((userId) => this.notifications.create({ userId, type: NotificationType.VERIFICATION_UPDATED, title, body, data: { tenancyId } })));
  }

  private async notifyAgreementReady(tenancyId: string) {
    try {
      const tenancy = await this.prisma.tenancy.findUnique({ where: { id: tenancyId }, select: { tenantId: true } });
      if (tenancy) await this.notifications.create({ userId: tenancy.tenantId, type: NotificationType.TENANCY_UPDATED, title: 'Tenancy agreement ready', body: 'Your move-in verification is approved. Your agreement is available to review and sign.', data: { tenancyId } });
    } catch { /* The committed verification must not be undone by notification failures. */ }
  }

  async adminList() {
    return this.prisma.moveInVerification.findMany({ include: { tenancy: { include: { listing: { select: { id: true, title: true } }, tenant: { select: { id: true, firstName: true, lastName: true } } } }, issues: true, refundRequests: true, evidence: { select: { id: true, issueId: true, uploaderId: true, createdAt: true } }, events: { orderBy: { createdAt: 'asc' } } }, orderBy: { updatedAt: 'desc' }, take: 100 });
  }

  private async locked(transaction: Prisma.TransactionClient, tenancyId: string) {
    const initial = await transaction.moveInVerification.findUnique({ where: { tenancyId }, select: { paymentId: true } });
    if (!initial) throw new NotFoundException('Move-in verification is not available');
    await transaction.$queryRaw`SELECT id FROM "escrow_records" WHERE "paymentId" = ${initial.paymentId}::uuid FOR UPDATE`;
    return transaction.moveInVerification.findUniqueOrThrow({ where: { tenancyId }, include: { tenancy: true, issues: true } });
  }

  async get(userId: string, tenancyId: string) {
    const result = await this.prisma.moveInVerification.findUnique({ where: { tenancyId }, include: { tenancy: true, issues: true, refundRequests: true, evidence: { select: { id: true, issueId: true, uploaderId: true, createdAt: true } }, events: { orderBy: { createdAt: 'asc' } } } });
    if (!result) throw new NotFoundException('Move-in verification is not available');
    if (![result.tenancy.tenantId, result.tenancy.landlordId, result.tenancy.agentId].includes(userId)) throw new ForbiddenException();
    return result;
  }

  async confirmHandover(tenantId: string, tenancyId: string) {
    const schedule = await this.prisma.$transaction(async (tx) => {
      const v = await this.locked(tx, tenancyId);
      if (v.tenancy.tenantId !== tenantId) throw new ForbiddenException();
      if (v.handoverAt && v.deadlineAt) return { id: v.id, deadlineAt: v.deadlineAt };
      if (v.tenancy.status !== 'PENDING_MOVE_IN' || v.status === 'CANCELLED') throw new ConflictException('Handover cannot be confirmed');
      const now = new Date();
      const deadlineAt = new Date(now.getTime() + (this.config.get<number>('MOVE_IN_WINDOW_HOURS') ?? 48) * 60 * 60 * 1000);
      await tx.moveInVerification.update({ where: { id: v.id }, data: { handoverAt: now, deadlineAt, status: v.adminHold ? 'UNDER_REVIEW' : v.issues.some((issue) => blocksVerification({ severity: issue.severity as 'MINOR' | 'MAJOR' | 'CRITICAL', resolved: issue.status === 'RESOLVED', classificationDisputed: issue.classificationDisputed })) ? 'ISSUE_REPORTED' : 'PENDING_VERIFICATION' } });
      await tx.moveInEvent.create({ data: { verificationId: v.id, actorId: tenantId, type: 'HANDOVER_CONFIRMED', details: {} } });
      return { id: v.id, deadlineAt };
    });
    await this.deadlines.add('reminder', { verificationId: schedule.id, overdue: false }, { delay: Math.max(0, schedule.deadlineAt.getTime() - Date.now() - 24 * 60 * 60 * 1000), jobId: `reminder-${schedule.id}`, attempts: 5, backoff: { type: 'exponential', delay: 10000 } });
    await this.deadlines.add('overdue', { verificationId: schedule.id, overdue: true }, { delay: Math.max(0, schedule.deadlineAt.getTime() - Date.now()), jobId: `overdue-${schedule.id}`, attempts: 5, backoff: { type: 'exponential', delay: 10000 } });
    return this.get(tenantId, tenancyId);
  }

  async saveDraft(tenantId: string, tenancyId: string, answers: SubmissionAnswer[]) {
    if (answers.length > checklistItems.length || new Set(answers.map((a) => a.item)).size !== answers.length) throw new ConflictException('Invalid checklist draft');
    await this.prisma.$transaction(async (tx) => {
      const v = await this.locked(tx, tenancyId);
      if (v.tenancy.tenantId !== tenantId) throw new ForbiddenException();
      if (!v.handoverAt || v.submittedAt) throw new ConflictException('The checklist is not editable');
      const hasBlockingIssue = v.issues.some((issue) => blocksVerification({ severity: issue.severity as 'MINOR' | 'MAJOR' | 'CRITICAL', resolved: issue.status === 'RESOLVED', classificationDisputed: issue.classificationDisputed }));
      await tx.moveInVerification.update({ where: { id: v.id }, data: { draft: answers as unknown as Prisma.InputJsonValue, status: v.adminHold ? 'UNDER_REVIEW' : hasBlockingIssue ? 'ISSUE_REPORTED' : 'IN_PROGRESS' } });
      await tx.moveInEvent.create({ data: { verificationId: v.id, actorId: tenantId, type: 'DRAFT_SAVED', details: { answers: answers as unknown as Prisma.InputJsonValue } } });
    });
    return this.get(tenantId, tenancyId);
  }

  async submit(tenantId: string, tenancyId: string, answers: SubmissionAnswer[]) {
    try { validateSubmittedChecklist(answers); } catch (error) { throw new ConflictException((error as Error).message); }
    for (const answer of answers.filter((a) => a.result === 'ISSUE_FOUND')) {
      const rule = answer.issueType && issueTypes[answer.issueType];
      if (!rule || rule.item !== answer.item) throw new ConflictException('Choose a valid issue type for each reported issue');
    }
    const ready = await this.prisma.$transaction(async (tx) => {
      const v = await this.locked(tx, tenancyId);
      if (v.tenancy.tenantId !== tenantId) throw new ForbiddenException();
      if (!v.handoverAt || v.submittedAt) throw new ConflictException('The checklist cannot be submitted');
      const issues = answers.filter((a) => a.result === 'ISSUE_FOUND').map((a) => ({ verificationId: v.id, item: a.item, issueType: a.issueType!, description: a.description!.trim(), severity: issueTypes[a.issueType!].severity }));
      if (issues.length) await tx.moveInIssue.createMany({ data: issues });
      const blocked = v.adminHold || issues.some((issue) => blocksVerification({ severity: issue.severity, resolved: false, classificationDisputed: false })) || v.issues.some((issue) => blocksVerification({ severity: issue.severity as 'MINOR' | 'MAJOR' | 'CRITICAL', resolved: issue.status === 'RESOLVED', classificationDisputed: issue.classificationDisputed }));
      const now = new Date();
      await tx.moveInVerification.update({ where: { id: v.id }, data: { draft: answers as unknown as Prisma.InputJsonValue, submittedAt: now, status: blocked ? 'ISSUE_REPORTED' : 'VERIFIED', verifiedAt: blocked ? null : now } });
      await tx.moveInEvent.create({ data: { verificationId: v.id, actorId: tenantId, type: 'CHECKLIST_SUBMITTED', details: { answers: answers as unknown as Prisma.InputJsonValue } } });
      if (!blocked) await this.agreements.createForTenancy(tx, tenancyId);
      return !blocked;
    });
    await this.notify(tenancyId, tenantId, 'Move-in checklist submitted', 'The property checklist has been submitted. Review the verification record.', true);
    if (ready) await this.notifyAgreementReady(tenancyId);
    return this.get(tenantId, tenancyId);
  }

  async updateIssue(actorId: string, tenancyId: string, issueId: string, action: 'REPAIR_REPORTED' | 'TENANT_CONFIRMED' | 'DISPUTE_CLASSIFICATION' | 'REQUEST_REVIEW', note: string) {
    if (!note.trim()) throw new ConflictException('A description is required');
    const ready = await this.prisma.$transaction(async (tx) => {
      const v = await this.locked(tx, tenancyId);
      const issue = v.issues.find((i) => i.id === issueId);
      if (!issue) throw new NotFoundException('Issue not found');
      if (issue.status === 'RESOLVED') throw new ConflictException('This issue has already been resolved');
      const manager = [v.tenancy.landlordId, v.tenancy.agentId].includes(actorId);
      const tenant = v.tenancy.tenantId === actorId;
      if ((action === 'REPAIR_REPORTED' && !manager) || (['TENANT_CONFIRMED', 'DISPUTE_CLASSIFICATION'].includes(action) && !tenant) || (action === 'REQUEST_REVIEW' && !tenant && !manager)) throw new ForbiddenException();
      if (action === 'TENANT_CONFIRMED' && issue.status !== 'REPAIR_REPORTED') throw new ConflictException('A repair must be reported before it can be confirmed');
      const data: Prisma.MoveInIssueUpdateInput = action === 'REPAIR_REPORTED' ? { status: 'REPAIR_REPORTED' } : action === 'TENANT_CONFIRMED' ? { status: 'RESOLVED', classificationDisputed: false } : action === 'DISPUTE_CLASSIFICATION' ? { classificationDisputed: true } : {};
      await tx.moveInIssue.update({ where: { id: issueId }, data });
      await tx.moveInEvent.create({ data: { verificationId: v.id, actorId, type: action, details: { issueId, note: note.trim() } } });
      if (action === 'DISPUTE_CLASSIFICATION' || action === 'REQUEST_REVIEW') {
        await tx.moveInVerification.update({ where: { id: v.id }, data: { status: 'UNDER_REVIEW', adminHold: true, verifiedAt: null } });
      } else if (action === 'TENANT_CONFIRMED') {
        const remaining = v.issues.filter((i) => i.id !== issueId).some((i) => blocksVerification({ severity: i.severity as 'MINOR' | 'MAJOR' | 'CRITICAL', resolved: i.status === 'RESOLVED', classificationDisputed: i.classificationDisputed }));
        if (!remaining && !v.adminHold && v.submittedAt) {
          await tx.moveInVerification.update({ where: { id: v.id }, data: { status: 'VERIFIED', verifiedAt: new Date() } });
          await this.agreements.createForTenancy(tx, tenancyId);
          return true;
        }
      }
    });
    await this.notify(tenancyId, actorId, 'Move-in issue updated', 'A move-in issue has an update. Review the verification record.', true);
    if (ready) await this.notifyAgreementReady(tenancyId);
    return this.get(actorId, tenancyId);
  }

  async reportAdditionalIssue(tenantId: string, tenancyId: string, item: Answer['item'], issueType: IssueKey, description: string) {
    const rule = issueTypes[issueType];
    if (!rule || rule.item !== item || !description.trim()) throw new ConflictException('Choose a valid issue and describe the problem');
    await this.prisma.$transaction(async (tx) => {
      const v = await this.locked(tx, tenancyId);
      if (v.tenancy.tenantId !== tenantId) throw new ForbiddenException();
      if (v.status === 'CANCELLED' || !['PENDING_MOVE_IN', 'ACTIVE'].includes(v.tenancy.status)) throw new ConflictException('This tenancy cannot accept a move-in issue');
      if (!v.handoverAt && issueType !== 'INACCESSIBLE_PROPERTY') throw new ConflictException('Confirm access before reporting this issue');
      const issue = await tx.moveInIssue.create({ data: { verificationId: v.id, item, issueType, severity: rule.severity, description: description.trim() } });
      const escrow = await tx.escrowRecord.findUnique({ where: { paymentId: v.paymentId } });
      if (rule.severity !== 'MINOR' && escrow?.status === 'HELD') {
        await tx.moveInVerification.update({ where: { id: v.id }, data: { status: 'ISSUE_REPORTED', verifiedAt: null } });
      }
      await tx.moveInEvent.create({ data: { verificationId: v.id, actorId: tenantId, type: 'ISSUE_REPORTED', details: { issueId: issue.id, item, issueType, description: description.trim() } } });
    });
    await this.notify(tenancyId, tenantId, 'Move-in issue reported', 'A property issue has been reported for review.', true);
    return this.get(tenantId, tenancyId);
  }

  async requestRefund(tenantId: string, tenancyId: string, reason: string) {
    if (reason.trim().length < 3) throw new ConflictException('Explain why you are requesting a refund');
    await this.prisma.$transaction(async (tx) => {
      const v = await this.locked(tx, tenancyId);
      if (v.tenancy.tenantId !== tenantId) throw new ForbiddenException();
      if (v.tenancy.status !== 'PENDING_MOVE_IN') throw new ConflictException('Cancellation refunds are only available before tenancy activation');
      const escrow = await tx.escrowRecord.findUnique({ where: { paymentId: v.paymentId } });
      if (escrow?.status !== 'HELD') throw new ConflictException('The protected payment is no longer available for this step');
      if (await tx.moveInRefundRequest.findFirst({ where: { verificationId: v.id, status: 'PENDING' } })) throw new ConflictException('A cancellation request is already under review');
      const request = await tx.moveInRefundRequest.create({ data: { verificationId: v.id, reason: reason.trim() } });
      await tx.moveInEvent.create({ data: { verificationId: v.id, actorId: tenantId, type: 'REFUND_REQUESTED', details: { requestId: request.id, reason: reason.trim() } } });
    });
    await this.notify(tenancyId, tenantId, 'Cancellation refund requested', 'A cancellation request awaits admin review.', true);
    return this.get(tenantId, tenancyId);
  }

  async attachEvidence(actorId: string, tenancyId: string, objectKey: string, issueId?: string) {
    const view = await this.get(actorId, tenancyId);
    if (issueId && !view.issues.some((issue) => issue.id === issueId)) throw new NotFoundException('Issue not found');
    await this.media.prepareMoveInEvidence(actorId, objectKey);
    await this.prisma.$transaction(async (tx) => {
      const v = await this.locked(tx, tenancyId);
      await tx.moveInEvidence.create({ data: { verificationId: v.id, issueId, uploaderId: actorId, objectKey } });
      await tx.moveInEvent.create({ data: { verificationId: v.id, actorId, type: 'EVIDENCE_ADDED', details: { issueId: issueId ?? null } } });
    });
    return this.get(actorId, tenancyId);
  }

  async evidenceDownload(actorId: string, tenancyId: string, evidenceId: string, isAdmin = false) {
    if (!isAdmin) await this.get(actorId, tenancyId);
    const evidence = await this.prisma.moveInEvidence.findFirst({ where: { id: evidenceId, verification: { tenancyId } } });
    if (!evidence) throw new NotFoundException('Evidence not found');
    return this.media.moveInEvidenceDownloadUrl(evidence.objectKey);
  }

  async rejectRefund(adminId: string, tenancyId: string, requestId: string, reason: string) {
    if (reason.trim().length < 3) throw new ConflictException('A decision reason is required');
    await this.prisma.$transaction(async (tx) => {
      const v = await this.locked(tx, tenancyId);
      const changed = await tx.moveInRefundRequest.updateMany({ where: { id: requestId, verificationId: v.id, status: 'PENDING' }, data: { status: 'REJECTED' } });
      if (changed.count !== 1) throw new ConflictException('This request is no longer pending');
      await tx.moveInEvent.create({ data: { verificationId: v.id, actorId: adminId, type: 'REFUND_REJECTED', details: { requestId, reason: reason.trim() } } });
    });
    await this.notify(tenancyId, adminId, 'Cancellation request reviewed', 'An administrator rejected the cancellation refund request.');
  }

  /** Called only by an admin-authorized route; every override requires a reason. */
  async resolveIssueByAdmin(adminId: string, tenancyId: string, issueId: string, note: string) {
    if (!note.trim()) throw new ConflictException('A decision reason is required');
    const ready = await this.prisma.$transaction(async (tx) => {
      const v = await this.locked(tx, tenancyId);
      const issue = v.issues.find((i) => i.id === issueId);
      if (!issue || issue.status === 'RESOLVED') throw new ConflictException('This issue is not open');
      await tx.moveInIssue.update({ where: { id: issueId }, data: { status: 'RESOLVED', classificationDisputed: false } });
      await tx.moveInEvent.create({ data: { verificationId: v.id, actorId: adminId, type: 'ADMIN_RESOLVED', details: { issueId, reason: note.trim() } } });
      const remaining = v.issues.filter((i) => i.id !== issueId).some((i) => blocksVerification({ severity: i.severity as 'MINOR' | 'MAJOR' | 'CRITICAL', resolved: i.status === 'RESOLVED', classificationDisputed: i.classificationDisputed }));
      const verified = !remaining && Boolean(v.submittedAt);
      await tx.moveInVerification.update({ where: { id: v.id }, data: { adminHold: remaining, status: remaining ? 'UNDER_REVIEW' : verified ? 'VERIFIED' : 'IN_PROGRESS', verifiedAt: verified ? new Date() : null } });
      if (!remaining && v.submittedAt) await this.agreements.createForTenancy(tx, tenancyId);
      return verified;
    });
    await this.notify(tenancyId, adminId, 'Move-in issue reviewed', 'An administrator recorded a decision about a move-in issue.');
    if (ready) await this.notifyAgreementReady(tenancyId);
  }

  async reclassifyIssue(adminId: string, tenancyId: string, issueId: string, severity: 'MINOR' | 'MAJOR' | 'CRITICAL', reason: string) {
    if (reason.trim().length < 3) throw new ConflictException('A decision reason is required');
    await this.prisma.$transaction(async (tx) => {
      const v = await this.locked(tx, tenancyId);
      const issue = v.issues.find((item) => item.id === issueId);
      if (!issue || issue.status === 'RESOLVED') throw new ConflictException('This issue is not open');
      await tx.moveInIssue.update({ where: { id: issueId }, data: { severity } });
      await tx.moveInEvent.create({ data: { verificationId: v.id, actorId: adminId, type: 'ADMIN_RECLASSIFIED', details: { issueId, previousSeverity: issue.severity, severity, reason: reason.trim() } } });
      if (severity !== 'MINOR') await tx.moveInVerification.update({ where: { id: v.id }, data: { status: 'UNDER_REVIEW', adminHold: true, verifiedAt: null } });
    });
    await this.notify(tenancyId, adminId, 'Move-in issue reviewed', 'An administrator changed the issue classification.');
  }
}
