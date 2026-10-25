import { ConflictException, ForbiddenException, Injectable, NotFoundException, PreconditionFailedException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApplicationStatus,
  CautionDeductionOutcome,
  CautionStatus,
  EscrowStatus,
  LedgerAccountCode,
  LedgerEntryType,
  ListingAvailability,
  ListingStatus,
  NotificationType,
  PaymentProvider,
  PaymentStatus,
  PayoutKind,
  PayoutStatus,
  Prisma,
} from '@prisma/client';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { AuditService } from '../common/database/audit.service';
import { parseKobo } from '../common/finance/money';
import { pageResult, Paginated } from '../common/http/pagination';
import { PrismaService } from '../common/database/prisma.service';
import { PricingService } from '../financials/pricing.service';
import { LedgerService } from '../financials/ledger.service';
import { PayoutExecutionService } from '../financials/payout-execution.service';
import { PayoutJobsService } from '../jobs/payout-jobs.service';
import { PaystackService } from '../integrations/paystack.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../websocket/realtime.gateway';
import { KycService } from '../users/kyc.service';
import { UsersService } from '../users/users.service';
import { AgreementsService } from '../documents/agreements.service';
import { ReceiptsService } from '../documents/receipts.service';
import {
  CancellationRefundOutcome,
  cancellationRefundAmounts,
  canReleaseVerifiedEscrow,
} from '../move-in/move-in.rules';
import {
  CautionDeductionRequest,
  PaymentInitializationRequest,
  PaymentQuery,
  PaystackWebhookRequest,
  ResolveCautionDeductionRequest,
  ResolveCautionDisputeRequest,
  RefundPaymentRequest,
} from './dto/payment.schemas';

const paymentInclude = {
  listing: { select: { id: true, slug: true, title: true, source: true } },
  application: { select: { id: true, status: true, moveInDate: true, leaseMonths: true } },
  escrow: { include: { cautionDeductions: true } },
  payouts: {
    select: {
      id: true,
      recipientUserId: true,
      kind: true,
      status: true,
      amountKobo: true,
      serviceFeeKobo: true,
      providerReference: true,
      scheduledAt: true,
      paidAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
  tenant: { select: { id: true, firstName: true, lastName: true } },
  landlord: { select: { id: true, firstName: true, lastName: true } },
  agent: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.PaymentInclude;

type PaymentRecord = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;
type PaymentView = Omit<PaymentRecord, 'payouts'> & {
  // `reference` is retained for backwards compatibility; this explicit alias
  // makes the shared transaction identifier unambiguous to every board.
  transactionReference: string;
  payouts: PaymentRecord['payouts'];
};
const confirmableStatuses: PaymentStatus[] = [PaymentStatus.INITIALIZED, PaymentStatus.PENDING];
const CANCELLATION_POLICY_VERSION = '2026-10-22';

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingService: PricingService,
    private readonly ledger: LedgerService,
    private readonly payoutExecutionService: PayoutExecutionService,
    private readonly payoutJobs: PayoutJobsService,
    private readonly paystack: PaystackService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly audit: AuditService,
    private readonly usersService: UsersService,
    private readonly kycService: KycService,
    private readonly agreementsService: AgreementsService,
    private readonly receiptsService: ReceiptsService,
  ) {}

  async initialize(tenantId: string, input: PaymentInitializationRequest) {
    if (!input.cancellationPolicyAccepted) {
      throw new ConflictException('Accept the cancellation and refund policy before payment');
    }
    await this.usersService.assertEmailVerified(tenantId);
    try {
      await this.kycService.assertVerified(tenantId);
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw new PreconditionFailedException({
          code: 'KYC_REQUIRED',
          message: 'Complete the one-time Dojah NIN verification before paying rent. A ₦100 service fee is paid before each Dojah attempt, including an unsuccessful verification.',
          serviceFeeKobo: KycService.SERVICE_FEE_KOBO.toString(),
        });
      }
      throw error;
    }
    const application = await this.prisma.rentalApplication.findFirst({
      where: { id: input.applicationId, tenantId, status: ApplicationStatus.AWAITING_PAYMENT },
      include: { listing: true, tenant: { select: { email: true } } },
    });
    if (!application) {
      throw new NotFoundException('No approved application is awaiting payment');
    }
    const pricing = this.pricingService.calculateRental({
      annualRentKobo: application.listing.annualRentKobo,
      cautionFeeKobo: application.listing.cautionFeeKobo,
      source: application.listing.source,
    });
    const reference = `sr_${randomUUID().replace(/-/g, '')}`;
    const payment = await this.prisma.payment.create({
      data: {
        reference,
        providerReference: reference,
        applicationId: application.id,
        listingId: application.listingId,
        tenantId,
        landlordId: application.landlordId,
        agentId: application.agentId,
        ...pricing,
        cancellationPolicyAcceptedAt: new Date(),
        cancellationPolicyVersion: CANCELLATION_POLICY_VERSION,
      },
    });
    try {
      const initialized = await this.paystack.initializeTransaction({
        email: application.tenant.email,
        amountKobo: pricing.totalAmountKobo,
        reference,
      });
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.PENDING, providerPayload: initialized },
      });
      return {
        paymentId: payment.id,
        reference,
        pricing,
        authorizationUrl: initialized.authorizationUrl,
        accessCode: initialized.accessCode,
        providerReference: initialized.reference,
      };
    } catch (error: unknown) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED, failedAt: new Date() },
      });
      throw error;
    }
  }

  async verifyForUser(userId: string, paymentId: string): Promise<PaymentView> {
    const payment = await this.prisma.payment.findFirst({ where: { id: paymentId, tenantId: userId } });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    const verification = await this.paystack.verifyTransaction(payment.reference);
    if (verification.status !== 'success') {
      await this.markFailed(payment.id, jsonValue(verification.payload));
      throw new ConflictException('We have not yet confirmed this payment');
    }
    const confirmed = await this.recordSuccessfulPayment(payment.reference, verification.amountKobo, verification.currency, jsonValue(verification.payload));
    return this.toViewerPayment(confirmed, userId);
  }

  async list(userId: string, query: PaymentQuery): Promise<Paginated<PaymentView>> {
    const where: Prisma.PaymentWhereInput = {
      OR: [{ tenantId: userId }, { landlordId: userId }, { agentId: userId }],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        include: paymentInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.payment.count({ where }),
    ]);
    return pageResult(items.map((item) => this.toViewerPayment(item, userId)), total, query);
  }

  async get(userId: string, paymentId: string): Promise<PaymentView> {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, OR: [{ tenantId: userId }, { landlordId: userId }, { agentId: userId }] },
      include: paymentInclude,
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    return this.toViewerPayment(payment, userId);
  }

  async authorizeRelease(managerId: string, paymentId: string): Promise<PaymentView> {
    const updated = await this.authorizeEscrowRelease(managerId, paymentId, false);
    await this.notifyPaymentParticipants(updated, NotificationType.ESCROW_UPDATED, 'Payment release authorized', 'The tenancy was approved. Landlord and agent payouts are now available to withdraw after one-time verification.');
    return this.toViewerPayment(updated, managerId);
  }

  async authorizeReleaseByAdmin(adminId: string, paymentId: string) {
    const updated = await this.authorizeEscrowRelease(adminId, paymentId, true);
    await this.audit.record({ actorUserId: adminId, action: 'escrow.release_authorized_by_admin', entityType: 'payment', entityId: paymentId });
    await this.notifyPaymentParticipants(updated, NotificationType.ESCROW_UPDATED, 'Payment release authorized', 'SingleRent operations authorized the release. Landlord and agent payouts are now available to withdraw after one-time verification.');
    return { ...updated, transactionReference: updated.reference };
  }

  private async authorizeEscrowRelease(actorId: string, paymentId: string, adminOverride: boolean): Promise<PaymentRecord> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { application: true, escrow: true },
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    if (!adminOverride && ![payment.landlordId, payment.agentId].includes(actorId)) {
      throw new ForbiddenException('Only the landlord or managing agent can authorize fund release');
    }
    const escrow = payment.escrow;
    if (payment.status !== PaymentStatus.SUCCESS || (payment.application.status !== ApplicationStatus.PAYMENT_HELD && payment.application.status !== ApplicationStatus.ACTIVE) || !escrow) {
      throw new ConflictException('This payment is not ready for release');
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "escrow_records" WHERE "paymentId" = ${paymentId}::uuid FOR UPDATE`;
      const verification = await transaction.moveInVerification.findUnique({ where: { paymentId }, include: { tenancy: { include: { agreement: true, guarantorForm: true } }, issues: true, refundRequests: { where: { status: 'PENDING' } } } });
      if (verification) {
        const refundAllocations = await transaction.payout.count({ where: { paymentId, kind: { in: [PayoutKind.REFUND, PayoutKind.CAUTION_REFUND] }, status: { notIn: [PayoutStatus.CANCELLED, PayoutStatus.FAILED] } } });
        const safe = canReleaseVerifiedEscrow({
          actorIsAdmin: adminOverride, escrowHeld: escrow.status === EscrowStatus.HELD,
          verificationApproved: verification.status === 'VERIFIED', agreementExecuted: verification.tenancy.agreement?.status === 'EXECUTED', guarantorFormExecuted: verification.tenancy.guarantorForm?.status === 'EXECUTED',
          tenancyActive: verification.tenancy.status === 'ACTIVE', openRefundRequest: refundAllocations > 0 || verification.refundRequests.length > 0, adminHold: verification.adminHold,
          issues: verification.issues.map((issue) => ({ severity: issue.severity as 'MINOR' | 'MAJOR' | 'CRITICAL', resolved: issue.status === 'RESOLVED', classificationDisputed: issue.classificationDisputed })),
        });
        if (!safe) throw new ConflictException('Payment release requires admin approval, completed verification, signed tenancy and guarantor documents, an active tenancy, and no open hold');
      } else if (payment.application.status !== ApplicationStatus.PAYMENT_HELD) {
        throw new ConflictException('This payment is not ready for release');
      }
      const released = await transaction.escrowRecord.updateMany({
        where: { id: escrow.id, status: EscrowStatus.HELD },
        data: { status: EscrowStatus.RELEASE_SCHEDULED, releaseAuthorizedAt: new Date() },
      });
      if (released.count !== 1) {
        throw new ConflictException('Payment release has already been authorized');
      }
      if (!verification) await transaction.rentalApplication.update({
        where: { id: payment.applicationId },
        data: { status: ApplicationStatus.APPROVED, decidedAt: new Date() },
      });
      await transaction.listing.update({ where: { id: payment.listingId }, data: { availability: 'RENTED' } });
      const endsAt = this.addMonths(payment.application.moveInDate, payment.application.leaseMonths);
      const tenancy = await transaction.tenancy.upsert({
        where: { applicationId: payment.applicationId },
        create: {
          applicationId: payment.applicationId,
          listingId: payment.listingId,
          tenantId: payment.tenantId,
          landlordId: payment.landlordId,
          agentId: payment.agentId,
          startsAt: payment.application.moveInDate,
          endsAt,
        },
        update: {},
      });
      await this.agreementsService.createForTenancy(transaction, tenancy.id);
      const payouts = await Promise.all([
        transaction.payout.create({
          data: {
            paymentId: payment.id,
            recipientUserId: payment.landlordId,
            kind: PayoutKind.LANDLORD,
            amountKobo: payment.rentAmountKobo,
            status: PayoutStatus.PENDING,
          },
        }),
        ...(payment.agentId && payment.agentFeeKobo > 0n
          ? [
              transaction.payout.create({
                data: {
                  paymentId: payment.id,
                  recipientUserId: payment.agentId,
                  kind: PayoutKind.AGENT,
                  amountKobo: payment.agentFeeKobo,
                  status: PayoutStatus.PENDING,
                },
              }),
            ]
          : []),
      ]);
      await this.ledger.record(transaction, {
        paymentId: payment.id,
        entryType: LedgerEntryType.LANDLORD_PAYOUT_ALLOCATED,
        debitAccount: LedgerAccountCode.RENT_ESCROW,
        creditAccount: LedgerAccountCode.LANDLORD_PAYABLE,
        amountKobo: payment.rentAmountKobo,
        idempotencyKey: `payment:${payment.id}:landlord-payout`,
      });
      return payouts;
    });
    return this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, include: paymentInclude });
  }

  async proposeCautionDeduction(managerId: string, paymentId: string, input: CautionDeductionRequest) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { escrow: { include: { cautionDeductions: true } }, application: { include: { tenancy: true } } } });
    if (!payment || !payment.escrow) {
      throw new NotFoundException('Protected payment not found');
    }
    if (![payment.landlordId, payment.agentId].includes(managerId)) {
      throw new ForbiddenException('Only the landlord or managing agent can propose a caution deduction');
    }
    if (payment.application.tenancy?.status !== 'ENDED') {
      throw new ConflictException('Caution deductions can be proposed only after the tenancy has ended');
    }
    if (payment.escrow.cautionStatus !== CautionStatus.HELD) {
      throw new ConflictException('The caution balance is not available for a new deduction');
    }
    if (payment.escrow.cautionDeductions.some((candidate) => !candidate.acceptedAt && !candidate.disputedAt && !candidate.resolvedAt)) {
      throw new ConflictException('Resolve the existing caution deduction before proposing another one');
    }
    const amountKobo = parseKobo(input.amountKobo, 'amountKobo');
    const alreadySettled = this.settledCautionDeductionAmount(payment.escrow.cautionDeductions);
    if (amountKobo <= 0n || amountKobo > payment.escrow.cautionHeldKobo - alreadySettled) {
      throw new ConflictException('Caution deduction must not exceed held caution funds');
    }
    const deduction = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.cautionDeduction.create({
        data: { escrowRecordId: payment.escrow!.id, amountKobo, reason: input.reason, evidence: input.evidence, proposedByUserId: managerId },
      });
      await transaction.escrowRecord.update({ where: { id: payment.escrow!.id }, data: { cautionStatus: CautionStatus.DEDUCTION_PROPOSED } });
      return created;
    });
    await this.notificationsService.create({
      userId: payment.tenantId,
      type: NotificationType.CAUTION_DISPUTE_UPDATED,
      title: 'Caution deduction proposed',
      body: 'Review the proposed caution-fund deduction for your tenancy.',
      data: { paymentId, deductionId: deduction.id },
    });
    return deduction;
  }

  async acceptCautionDeduction(tenantId: string, paymentId: string, deductionId: string, input: ResolveCautionDeductionRequest) {
    const payment = await this.prisma.payment.findFirst({ where: { id: paymentId, tenantId }, include: { escrow: { include: { cautionDeductions: true } } } });
    const deduction = payment?.escrow?.cautionDeductions.find((candidate) => candidate.id === deductionId);
    if (!payment || !payment.escrow || !deduction) {
      throw new NotFoundException('Caution deduction not found');
    }
    if (deduction.acceptedAt || deduction.disputedAt) {
      throw new ConflictException('This caution deduction has already been resolved');
    }
    await this.prisma.$transaction(async (transaction) => {
      await transaction.cautionDeduction.update({
        where: { id: deduction.id },
        data: {
          acceptedAt: new Date(),
          resolvedAt: new Date(),
          resolution: CautionDeductionOutcome.LANDLORD_PAID,
          resolutionNote: input.note,
        },
      });
      const settledDeductions = this.settledCautionDeductionAmount(payment.escrow!.cautionDeductions) + deduction.amountKobo;
      await transaction.escrowRecord.update({
        where: { id: payment.escrow!.id },
        data: { cautionStatus: settledDeductions >= payment.escrow!.cautionHeldKobo ? CautionStatus.SETTLED : CautionStatus.HELD },
      });
      await this.ledger.record(transaction, {
        paymentId: payment.id,
        entryType: LedgerEntryType.CAUTION_DEDUCTION_ALLOCATED,
        debitAccount: LedgerAccountCode.CAUTION_ESCROW,
        creditAccount: LedgerAccountCode.LANDLORD_PAYABLE,
        amountKobo: deduction.amountKobo,
        idempotencyKey: `deduction:${deduction.id}:accepted`,
        metadata: { note: input.note ?? null },
      });
      // An accepted deduction is money payable to the landlord, not merely a
      // ledger note. It becomes a normal, KYC-gated payout that the landlord
      // can withdraw to the configured Paystack destination.
      await transaction.payout.create({
        data: {
          paymentId: payment.id,
          recipientUserId: payment.landlordId,
          kind: PayoutKind.CAUTION_DEDUCTION,
          amountKobo: deduction.amountKobo,
          status: PayoutStatus.PENDING,
        },
      });
    });
  }

  async returnRemainingCaution(managerId: string, paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { application: { include: { tenancy: true } }, escrow: { include: { cautionDeductions: true } }, payouts: true },
    });
    if (!payment?.escrow) throw new NotFoundException('Protected payment not found');
    if (![payment.landlordId, payment.agentId].includes(managerId)) {
      throw new ForbiddenException('Only the landlord or managing agent can return caution funds');
    }
    if (payment.application.tenancy?.status !== 'ENDED') {
      throw new ConflictException('Caution can be returned only after the tenancy has ended');
    }
    if (payment.escrow.cautionStatus === CautionStatus.DISPUTED || payment.escrow.cautionStatus === CautionStatus.DEDUCTION_PROPOSED) {
      throw new ConflictException('Resolve the pending caution deduction before returning the balance');
    }
    const available = this.availableCautionRefundAmount(payment.escrow.cautionHeldKobo, payment.escrow.cautionDeductions, payment.payouts);
    if (available <= 0n) throw new ConflictException('No caution balance remains to return');
    return this.scheduleRefund(managerId, paymentId, {
      scope: 'CAUTION',
      amountKobo: available.toString(),
      reason: 'Remaining caution balance returned after tenancy completion',
    // Rent release may already be scheduled while the publisher has not yet
    // withdrawn it. Caution is a distinct balance, so ending the tenancy must
    // still be able to return it in that state.
    }, [EscrowStatus.HELD, EscrowStatus.RELEASE_SCHEDULED, EscrowStatus.PARTIALLY_SETTLED, EscrowStatus.RELEASED]);
  }

  async issueRefund(actorId: string, paymentId: string, input: RefundPaymentRequest) {
    // New move-in transactions require the reviewed cancellation workflow.
    // Do not let the legacy admin refund endpoint bypass it.
    const verification = await this.prisma.moveInVerification.findUnique({ where: { paymentId }, select: { id: true } });
    if (verification) throw new ConflictException('Use the reviewed move-in cancellation workflow for this payment');
    return this.scheduleRefund(actorId, paymentId, input, [EscrowStatus.HELD, EscrowStatus.PARTIALLY_SETTLED]);
  }

  async approveMoveInRefund(
    adminId: string,
    paymentId: string,
    requestId: string,
    reason: string,
    outcome: CancellationRefundOutcome = 'TENANT_CHANGED_MIND',
  ) {
    if (reason.trim().length < 3) throw new ConflictException('A decision reason is required');
    const payouts = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "escrow_records" WHERE "paymentId" = ${paymentId}::uuid FOR UPDATE`;
      const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: { escrow: { include: { cautionDeductions: true } }, tenant: { include: { payoutAccount: true } }, payouts: true, moveInVerification: { include: { tenancy: true, refundRequests: true } } } });
      const verification = payment?.moveInVerification;
      const request = verification?.refundRequests.find((item) => item.id === requestId);
      if (!payment?.escrow || !verification || !request) throw new NotFoundException('Cancellation request not found');
      if (payment.status !== PaymentStatus.SUCCESS || payment.escrow.status !== EscrowStatus.HELD || verification.tenancy.status !== 'PENDING_MOVE_IN' || request.status !== 'PENDING') throw new ConflictException('This cancellation request is no longer eligible for a refund');
      if (!payment.tenant.payoutAccount) throw new PreconditionFailedException({ code: 'REFUND_DESTINATION_REQUIRED', message: 'The tenant must add a bank account before this refund can be sent.' });
      const rent = this.availableRentRefundAmount(payment.escrow.rentHeldKobo, payment.payouts);
      const caution = this.availableCautionRefundAmount(payment.escrow.cautionHeldKobo, payment.escrow.cautionDeductions, payment.payouts);
      if (rent !== payment.escrow.rentHeldKobo || caution !== payment.escrow.cautionHeldKobo) throw new ConflictException('This payment has existing allocations and needs manual review');
      const calculation = cancellationRefundAmounts(outcome, rent, caution);
      const refundedFees = outcome === 'VALID_PROPERTY_FAILURE'
        ? payment.platformFeeKobo + payment.agentFeeKobo + payment.legalFeeKobo
        : 0n;
      const created = [];
      for (const part of [
        { amount: calculation.rentRefundKobo + refundedFees, kind: PayoutKind.REFUND },
        { amount: calculation.cautionRefundKobo, kind: PayoutKind.CAUTION_REFUND },
      ]) {
        if (part.amount <= 0n) continue;
        const payout = await tx.payout.create({ data: { paymentId, recipientUserId: payment.tenantId, kind: part.kind, amountKobo: part.amount, status: PayoutStatus.SCHEDULED, scheduledAt: new Date() } });
        created.push(payout);
      }
      const metadata = { actorId: adminId, reason: reason.trim(), outcome };
      await this.ledger.record(tx, { paymentId, entryType: LedgerEntryType.REFUND_ISSUED, debitAccount: LedgerAccountCode.RENT_ESCROW, creditAccount: LedgerAccountCode.TENANT_REFUND_PAYABLE, amountKobo: calculation.rentRefundKobo, idempotencyKey: `move-in-refund:${requestId}:rent`, metadata });
      await this.ledger.record(tx, { paymentId, entryType: LedgerEntryType.CAUTION_REFUND_ALLOCATED, debitAccount: LedgerAccountCode.CAUTION_ESCROW, creditAccount: LedgerAccountCode.TENANT_REFUND_PAYABLE, amountKobo: calculation.cautionRefundKobo, idempotencyKey: `move-in-refund:${requestId}:caution`, metadata });
      await this.ledger.record(tx, { paymentId, entryType: LedgerEntryType.CANCELLATION_FEE_ALLOCATED, debitAccount: LedgerAccountCode.RENT_ESCROW, creditAccount: LedgerAccountCode.PLATFORM_REVENUE, amountKobo: calculation.rentCancellationFeeKobo, idempotencyKey: `move-in-refund:${requestId}:rent-cancellation-fee`, metadata: { ...metadata, scope: 'RENT' } });
      await this.ledger.record(tx, { paymentId, entryType: LedgerEntryType.CANCELLATION_FEE_ALLOCATED, debitAccount: LedgerAccountCode.CAUTION_ESCROW, creditAccount: LedgerAccountCode.PLATFORM_REVENUE, amountKobo: calculation.cautionForfeitureKobo, idempotencyKey: `move-in-refund:${requestId}:caution-forfeiture`, metadata: { ...metadata, scope: 'CAUTION' } });
      await this.ledger.record(tx, { paymentId, entryType: LedgerEntryType.PLATFORM_FEE_REFUNDED, debitAccount: LedgerAccountCode.PLATFORM_REVENUE, creditAccount: LedgerAccountCode.TENANT_REFUND_PAYABLE, amountKobo: outcome === 'VALID_PROPERTY_FAILURE' ? payment.platformFeeKobo : 0n, idempotencyKey: `move-in-refund:${requestId}:platform-fee`, metadata });
      await this.ledger.record(tx, { paymentId, entryType: LedgerEntryType.LEGAL_FEE_REFUNDED, debitAccount: LedgerAccountCode.LEGAL_FEE_REVENUE, creditAccount: LedgerAccountCode.TENANT_REFUND_PAYABLE, amountKobo: outcome === 'VALID_PROPERTY_FAILURE' ? payment.legalFeeKobo : 0n, idempotencyKey: `move-in-refund:${requestId}:legal-fee`, metadata });
      await this.ledger.record(tx, { paymentId, entryType: LedgerEntryType.AGENT_FEE_REFUNDED, debitAccount: LedgerAccountCode.AGENT_PAYABLE, creditAccount: LedgerAccountCode.TENANT_REFUND_PAYABLE, amountKobo: outcome === 'VALID_PROPERTY_FAILURE' ? payment.agentFeeKobo : 0n, idempotencyKey: `move-in-refund:${requestId}:agent-fee`, metadata });
      if (!created.length) throw new ConflictException('There is no refundable rent or caution balance');
      await tx.moveInRefundRequest.update({ where: { id: requestId }, data: { status: 'APPROVED' } });
      await tx.moveInVerification.update({ where: { id: verification.id }, data: { status: 'CANCELLED', adminHold: true } });
      await tx.moveInEvent.create({ data: { verificationId: verification.id, actorId: adminId, type: 'REFUND_APPROVED', details: { requestId, reason: reason.trim(), outcome, rentRefundKobo: calculation.rentRefundKobo.toString(), cautionRefundKobo: calculation.cautionRefundKobo.toString(), platformFeeRefundKobo: outcome === 'VALID_PROPERTY_FAILURE' ? payment.platformFeeKobo.toString() : '0', legalFeeRefundKobo: outcome === 'VALID_PROPERTY_FAILURE' ? payment.legalFeeKobo.toString() : '0', agentFeeRefundKobo: outcome === 'VALID_PROPERTY_FAILURE' ? payment.agentFeeKobo.toString() : '0', rentCancellationFeeKobo: calculation.rentCancellationFeeKobo.toString(), cautionForfeitureKobo: calculation.cautionForfeitureKobo.toString() } } });
      await tx.tenancy.update({ where: { id: verification.tenancyId }, data: { status: 'CANCELLED' } });
      await tx.rentalApplication.update({ where: { id: payment.applicationId }, data: { status: 'CANCELLED' } });
      // An approved pre-tenancy cancellation releases the reservation so the
      // property may be rented by someone else again.
      await tx.listing.updateMany({
        where: { id: payment.listingId, status: { not: ListingStatus.ARCHIVED } },
        data: { availability: ListingAvailability.AVAILABLE },
      });
      await tx.escrowRecord.update({ where: { id: payment.escrow.id }, data: { status: EscrowStatus.PARTIALLY_SETTLED } });
      return created;
    });
    await this.audit.record({ actorUserId: adminId, action: 'move_in.refund_approved', entityType: 'payment', entityId: paymentId, metadata: { requestId, reason: reason.trim(), outcome } });
    for (const payout of payouts) await this.payoutJobs.enqueue(payout.id);
    const payment = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, include: paymentInclude });
    const message = outcome === 'VALID_PROPERTY_FAILURE'
      ? 'The full refund, including rent, caution, platform, legal and agent fees, has been scheduled. It is not complete until the payment provider confirms it.'
      : 'Your rent refund, less the 3% cancellation charge, has been scheduled. Caution, platform, legal and agent fees are not refunded. It is not complete until the payment provider confirms it.';
    await this.notifyPaymentParticipants(payment, NotificationType.ESCROW_UPDATED, 'Cancellation refund approved', message);
    return payouts;
  }

  private async scheduleRefund(actorId: string, paymentId: string, input: RefundPaymentRequest, allowedEscrowStatuses: EscrowStatus[]) {
    const amountKobo = parseKobo(input.amountKobo, 'amountKobo');
    if (amountKobo <= 0n) throw new ConflictException('Refund amount must be greater than zero');

    const payout = await this.prisma.$transaction(async (transaction) => {
      // Serialize balance checks with escrow release and other refund allocations.
      // Re-read payment and payouts after acquiring the row lock, not before it.
      await transaction.$queryRaw`SELECT id FROM "escrow_records" WHERE "paymentId" = ${paymentId}::uuid FOR UPDATE`;
      const payment = await transaction.payment.findUnique({
        where: { id: paymentId },
        include: {
          escrow: { include: { cautionDeductions: true } },
          tenant: { include: { payoutAccount: true } },
          payouts: { select: { kind: true, status: true, amountKobo: true } },
        },
      });
      if (!payment?.escrow || payment.status !== PaymentStatus.SUCCESS) {
        throw new ConflictException('Only a confirmed protected payment can be refunded');
      }
      if (!allowedEscrowStatuses.includes(payment.escrow.status)) {
        throw new ConflictException('This protected payment is not available for a refund');
      }
      if (!payment.tenant.payoutAccount) {
        throw new PreconditionFailedException({
          code: 'REFUND_DESTINATION_REQUIRED',
          message: 'The tenant must add a bank account before this refund can be sent.',
        });
      }

      const kind = input.scope === 'CAUTION' ? PayoutKind.CAUTION_REFUND : PayoutKind.REFUND;
      const availableAmount = input.scope === 'CAUTION'
        ? this.availableCautionRefundAmount(payment.escrow.cautionHeldKobo, payment.escrow.cautionDeductions, payment.payouts)
        : this.availableRentRefundAmount(payment.escrow.rentHeldKobo, payment.payouts);
      if (amountKobo > availableAmount) {
        throw new ConflictException(`Refund exceeds the available ${input.scope.toLowerCase()} balance`);
      }

      const created = await transaction.payout.create({
        data: {
          paymentId: payment.id,
          recipientUserId: payment.tenantId,
          kind,
          amountKobo,
          status: PayoutStatus.SCHEDULED,
          scheduledAt: new Date(),
        },
      });
      await this.ledger.record(transaction, {
        paymentId: payment.id,
        entryType: input.scope === 'CAUTION' ? LedgerEntryType.CAUTION_REFUND_ALLOCATED : LedgerEntryType.REFUND_ISSUED,
        debitAccount: input.scope === 'CAUTION' ? LedgerAccountCode.CAUTION_ESCROW : LedgerAccountCode.RENT_ESCROW,
        creditAccount: LedgerAccountCode.TENANT_REFUND_PAYABLE,
        amountKobo,
        idempotencyKey: `refund:${created.id}:allocated`,
        metadata: { reason: input.reason, scope: input.scope, actorId },
      });
      await transaction.escrowRecord.update({
        where: { id: payment.escrow.id },
        data: { status: EscrowStatus.PARTIALLY_SETTLED },
      });
      return created;
    });
    await this.audit.record({ actorUserId: actorId, action: 'payment.refund_scheduled', entityType: 'payment', entityId: paymentId, metadata: { payoutId: payout.id, amountKobo: amountKobo.toString(), scope: input.scope, reason: input.reason } });
    await this.payoutJobs.enqueue(payout.id);
    return payout;
  }

  async resolveCautionDispute(adminId: string, paymentId: string, deductionId: string, input: ResolveCautionDisputeRequest) {
    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "escrow_records" WHERE "paymentId" = ${paymentId}::uuid FOR UPDATE`;
      const payment = await transaction.payment.findUnique({
        where: { id: paymentId },
        include: {
          escrow: { include: { cautionDeductions: true } },
          tenant: { include: { payoutAccount: true } },
          payouts: { select: { kind: true, status: true, amountKobo: true } },
        },
      });
      const deduction = payment?.escrow?.cautionDeductions.find((candidate) => candidate.id === deductionId);
      if (!payment?.escrow || !deduction) throw new NotFoundException('Caution deduction not found');
      if (!deduction.disputedAt || deduction.resolvedAt) throw new ConflictException('This caution deduction is not awaiting an admin decision');

      if (input.outcome === 'PAY_LANDLORD') {
        await transaction.cautionDeduction.update({
          where: { id: deduction.id },
          data: { resolvedAt: new Date(), resolution: CautionDeductionOutcome.LANDLORD_PAID, resolutionNote: input.note },
        });
        await this.ledger.record(transaction, {
          paymentId,
          entryType: LedgerEntryType.CAUTION_DEDUCTION_ALLOCATED,
          debitAccount: LedgerAccountCode.CAUTION_ESCROW,
          creditAccount: LedgerAccountCode.LANDLORD_PAYABLE,
          amountKobo: deduction.amountKobo,
          idempotencyKey: `deduction:${deduction.id}:admin-landlord-payout`,
          metadata: { note: input.note, resolvedBy: adminId },
        });
        const payout = await transaction.payout.create({
          data: { paymentId, recipientUserId: payment.landlordId, kind: PayoutKind.CAUTION_DEDUCTION, amountKobo: deduction.amountKobo, status: PayoutStatus.PENDING },
        });
        const settled = this.settledCautionDeductionAmount(payment.escrow.cautionDeductions) + deduction.amountKobo;
        await transaction.escrowRecord.update({
          where: { id: payment.escrow.id },
          data: {
            status: EscrowStatus.PARTIALLY_SETTLED,
            cautionStatus: settled >= payment.escrow.cautionHeldKobo ? CautionStatus.SETTLED : CautionStatus.HELD,
          },
        });
        return { payout, queued: false };
      }

      if (!payment.tenant.payoutAccount) {
        throw new PreconditionFailedException({ code: 'REFUND_DESTINATION_REQUIRED', message: 'The tenant must add a bank account before this refund can be sent.' });
      }
      const available = this.availableCautionRefundAmount(payment.escrow.cautionHeldKobo, payment.escrow.cautionDeductions, payment.payouts);
      if (deduction.amountKobo > available) throw new ConflictException('The disputed amount is no longer available to refund');
      await transaction.cautionDeduction.update({
        where: { id: deduction.id },
        data: { resolvedAt: new Date(), resolution: CautionDeductionOutcome.TENANT_REFUND, resolutionNote: input.note },
      });
      const payout = await transaction.payout.create({
        data: { paymentId, recipientUserId: payment.tenantId, kind: PayoutKind.CAUTION_REFUND, amountKobo: deduction.amountKobo, status: PayoutStatus.SCHEDULED, scheduledAt: new Date() },
      });
      await this.ledger.record(transaction, {
        paymentId,
        entryType: LedgerEntryType.CAUTION_REFUND_ALLOCATED,
        debitAccount: LedgerAccountCode.CAUTION_ESCROW,
        creditAccount: LedgerAccountCode.TENANT_REFUND_PAYABLE,
        amountKobo: deduction.amountKobo,
        idempotencyKey: `deduction:${deduction.id}:admin-tenant-refund`,
        metadata: { note: input.note, resolvedBy: adminId },
      });
      await transaction.escrowRecord.update({ where: { id: payment.escrow.id }, data: { status: EscrowStatus.PARTIALLY_SETTLED, cautionStatus: CautionStatus.HELD } });
      return { payout, queued: true };
    });
    await this.audit.record({ actorUserId: adminId, action: 'caution.dispute_resolved', entityType: 'caution_deduction', entityId: deductionId, metadata: { paymentId, outcome: input.outcome } });
    if (result.queued) await this.payoutJobs.enqueue(result.payout.id);
    return result.payout;
  }

  async disputeCautionDeduction(tenantId: string, paymentId: string, deductionId: string, input: ResolveCautionDeductionRequest): Promise<void> {
    const payment = await this.prisma.payment.findFirst({ where: { id: paymentId, tenantId }, include: { escrow: { include: { cautionDeductions: true } } } });
    const deduction = payment?.escrow?.cautionDeductions.find((candidate) => candidate.id === deductionId);
    if (!payment || !payment.escrow || !deduction) {
      throw new NotFoundException('Caution deduction not found');
    }
    if (deduction.acceptedAt || deduction.disputedAt) {
      throw new ConflictException('This caution deduction has already been resolved');
    }
    await this.prisma.$transaction([
      this.prisma.cautionDeduction.update({ where: { id: deduction.id }, data: { disputedAt: new Date(), resolutionNote: input.note } }),
      this.prisma.escrowRecord.update({ where: { id: payment.escrow.id }, data: { cautionStatus: CautionStatus.DISPUTED, status: EscrowStatus.DISPUTED } }),
    ]);
  }

  async handlePaystackWebhook(rawBody: Buffer, signature: string | undefined, event: PaystackWebhookRequest): Promise<{ duplicate: boolean }> {
    this.verifyWebhookSignature(rawBody, signature);
    const eventHash = createHash('sha256').update(rawBody).digest('hex');
    try {
      await this.prisma.webhookEvent.create({
        data: { provider: PaymentProvider.PAYSTACK, eventType: event.event, eventHash, payload: jsonValue(event) },
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { duplicate: true };
      }
      throw error;
    }
    try {
      if (event.event === 'charge.success') {
        const reference = typeof event.data.reference === 'string' ? event.data.reference : undefined;
        if (!reference) {
          throw new ConflictException('Payment webhook is missing its transaction reference');
        }
        const verified = await this.paystack.verifyTransaction(reference);
        if (verified.status !== 'success') {
          throw new ConflictException('The payment provider did not verify this payment as successful');
        }
        const serviceChargeHandled = await this.kycService.processTenantVerificationCharge(
          reference,
          verified.amountKobo,
          verified.currency,
          jsonValue(verified.payload),
        );
        if (!serviceChargeHandled) {
          await this.recordSuccessfulPayment(reference, verified.amountKobo, verified.currency, jsonValue(verified.payload));
        }
      }
      if (event.event === 'transfer.success' || event.event === 'transfer.failed') {
        const reference = typeof event.data.reference === 'string' ? event.data.reference : undefined;
        if (reference) {
          await this.payoutExecutionService.markProviderResult(
            reference,
            event.event === 'transfer.success',
            event.event === 'transfer.failed' ? 'Bank transfer failed' : undefined,
          );
        }
      }
      await this.prisma.webhookEvent.update({ where: { eventHash }, data: { processedAt: new Date() } });
      return { duplicate: false };
    } catch (error: unknown) {
      await this.prisma.webhookEvent.update({
        where: { eventHash },
        data: { processingError: error instanceof Error ? error.message.slice(0, 1000) : 'Webhook processing error' },
      });
      throw error;
    }
  }

  private async recordSuccessfulPayment(reference: string, amountKobo: bigint, currency: string, payload: Prisma.InputJsonValue): Promise<PaymentRecord> {
    const payment = await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.payment.findUnique({ where: { reference }, include: { application: true } });
      if (!current) {
        throw new NotFoundException('Payment reference not found');
      }
      if (current.currency !== currency || current.totalAmountKobo !== amountKobo) {
        throw new ConflictException('Payment amount or currency does not match the server payment record');
      }
      if (current.status === PaymentStatus.SUCCESS) {
        return current;
      }
      if (!confirmableStatuses.includes(current.status)) {
        throw new ConflictException('This payment cannot be confirmed');
      }
      if (current.application.status !== ApplicationStatus.AWAITING_PAYMENT) {
        throw new ConflictException('The application is no longer awaiting payment');
      }
      const claimed = await transaction.payment.updateMany({
        where: { id: current.id, status: { in: confirmableStatuses } },
        data: { status: PaymentStatus.SUCCESS, verifiedAt: new Date(), providerPayload: payload },
      });
      if (claimed.count !== 1) {
        const completed = await transaction.payment.findUniqueOrThrow({ where: { id: current.id } });
        return completed;
      }
      await transaction.rentalApplication.update({ where: { id: current.applicationId }, data: { status: ApplicationStatus.PAYMENT_HELD } });
      // A confirmed escrow payment reserves this home immediately. The paying
      // tenant can still access it through authenticated rental endpoints,
      // but it must not remain available to other prospective tenants.
      const reservation = await transaction.listing.updateMany({
        where: {
          id: current.listingId,
          status: { not: ListingStatus.ARCHIVED },
          availability: ListingAvailability.AVAILABLE,
        },
        data: { availability: ListingAvailability.UNAVAILABLE },
      });
      if (reservation.count !== 1) {
        throw new ConflictException('This property is no longer available for payment');
      }
      // New payments start the move-in workflow. Existing successful payments
      // return above and retain their legacy agreement and escrow handling.
      const endsAt = this.addMonths(current.application.moveInDate, current.application.leaseMonths);
      const tenancy = await transaction.tenancy.upsert({
        where: { applicationId: current.applicationId },
        create: {
          applicationId: current.applicationId,
          listingId: current.listingId,
          tenantId: current.tenantId,
          landlordId: current.landlordId,
          agentId: current.agentId,
          startsAt: current.application.moveInDate,
          endsAt,
        },
        update: {},
      });
      await transaction.escrowRecord.create({
        data: {
          paymentId: current.id,
          rentHeldKobo: current.rentAmountKobo,
          cautionHeldKobo: current.cautionFeeKobo,
          cautionStatus: current.cautionFeeKobo > 0n ? CautionStatus.HELD : CautionStatus.NOT_APPLICABLE,
        },
      });
      const verification = await transaction.moveInVerification.create({ data: { tenancyId: tenancy.id, paymentId: current.id } });
      await transaction.moveInEvent.create({ data: { verificationId: verification.id, actorId: current.tenantId, type: 'PAYMENT_HELD', details: {} } });
      await this.ledger.record(transaction, {
        paymentId: current.id,
        entryType: LedgerEntryType.RENT_ESCROW_HELD,
        debitAccount: LedgerAccountCode.PAYMENT_CLEARING,
        creditAccount: LedgerAccountCode.RENT_ESCROW,
        amountKobo: current.rentAmountKobo,
        idempotencyKey: `payment:${current.id}:rent-held`,
      });
      await this.ledger.record(transaction, {
        paymentId: current.id,
        entryType: LedgerEntryType.CAUTION_ESCROW_HELD,
        debitAccount: LedgerAccountCode.PAYMENT_CLEARING,
        creditAccount: LedgerAccountCode.CAUTION_ESCROW,
        amountKobo: current.cautionFeeKobo,
        idempotencyKey: `payment:${current.id}:caution-held`,
      });
      await this.ledger.record(transaction, {
        paymentId: current.id,
        entryType: LedgerEntryType.PLATFORM_FEE_ALLOCATED,
        debitAccount: LedgerAccountCode.PAYMENT_CLEARING,
        creditAccount: LedgerAccountCode.PLATFORM_REVENUE,
        amountKobo: current.platformFeeKobo,
        idempotencyKey: `payment:${current.id}:platform-fee`,
      });
      await this.ledger.record(transaction, {
        paymentId: current.id,
        entryType: LedgerEntryType.LEGAL_FEE_ALLOCATED,
        debitAccount: LedgerAccountCode.PAYMENT_CLEARING,
        creditAccount: LedgerAccountCode.LEGAL_FEE_REVENUE,
        amountKobo: current.legalFeeKobo,
        idempotencyKey: `payment:${current.id}:legal-fee`,
      });
      await this.ledger.record(transaction, {
        paymentId: current.id,
        entryType: LedgerEntryType.AGENT_COMMISSION_ALLOCATED,
        debitAccount: LedgerAccountCode.PAYMENT_CLEARING,
        creditAccount: LedgerAccountCode.AGENT_PAYABLE,
        amountKobo: current.agentFeeKobo,
        idempotencyKey: `payment:${current.id}:agent-fee`,
      });
      return transaction.payment.findUniqueOrThrow({ where: { id: current.id } });
    });
    const detailed = await this.prisma.payment.findUniqueOrThrow({ where: { id: payment.id }, include: paymentInclude });
    // The receipt upsert is keyed by payment and receipt kind, so webhook
    // delivery and manual verification retries cannot produce duplicates.
    await this.receiptsService.issueTenantPaymentReceipt(detailed.id);
    await this.notifyPaymentParticipants(detailed, NotificationType.PAYMENT_SUCCESSFUL, 'Payment confirmed and protected', 'Your rent payment was verified and is held securely while the required move-in steps are completed.');
    return detailed;
  }

  private async markFailed(paymentId: string, payload: Prisma.InputJsonValue): Promise<void> {
    await this.prisma.payment.updateMany({
      where: { id: paymentId, status: { in: [PaymentStatus.INITIALIZED, PaymentStatus.PENDING] } },
      data: { status: PaymentStatus.FAILED, failedAt: new Date(), providerPayload: payload },
    });
  }

  private settledCautionDeductionAmount(
    deductions: Array<{ amountKobo: bigint; acceptedAt: Date | null; resolution: CautionDeductionOutcome | null }>,
  ): bigint {
    return deductions
      .filter((deduction) => deduction.acceptedAt || deduction.resolution === CautionDeductionOutcome.LANDLORD_PAID)
      .reduce((total, deduction) => total + deduction.amountKobo, 0n);
  }

  private availableCautionRefundAmount(
    heldAmount: bigint,
    deductions: Array<{ amountKobo: bigint; acceptedAt: Date | null; resolution: CautionDeductionOutcome | null }>,
    payouts: Array<{ kind: PayoutKind; status: PayoutStatus; amountKobo: bigint }>,
  ): bigint {
    const allocatedRefunds = payouts
      .filter((payout) => payout.kind === PayoutKind.CAUTION_REFUND && payout.status !== PayoutStatus.CANCELLED && payout.status !== PayoutStatus.FAILED)
      .reduce((total, payout) => total + payout.amountKobo, 0n);
    return heldAmount - this.settledCautionDeductionAmount(deductions) - allocatedRefunds;
  }

  private availableRentRefundAmount(
    heldAmount: bigint,
    payouts: Array<{ kind: PayoutKind; status: PayoutStatus; amountKobo: bigint }>,
  ): bigint {
    // Rent refunds and landlord payouts both consume the same held-rent balance.
    // Count either allocation so a refund cannot be approved after rent is
    // already reserved for a landlord payout.
    const allocatedRefunds = payouts
      .filter((payout) => (payout.kind === PayoutKind.REFUND || payout.kind === PayoutKind.LANDLORD) && payout.status !== PayoutStatus.CANCELLED && payout.status !== PayoutStatus.FAILED)
      .reduce((total, payout) => total + payout.amountKobo, 0n);
    return heldAmount - allocatedRefunds;
  }

  private async notifyPaymentParticipants(payment: PaymentRecord, type: NotificationType, title: string, body: string): Promise<void> {
    const recipients = [payment.tenantId, payment.landlordId, payment.agentId].filter((id): id is string => Boolean(id));
    await Promise.all(
      [...new Set(recipients)].map(async (userId) => {
        this.realtimeGateway.emitPaymentUpdate(userId, { paymentId: payment.id, status: payment.status, escrowStatus: payment.escrow?.status });
        return this.notificationsService.create({ userId, type, title, body, data: { paymentId: payment.id, applicationId: payment.applicationId } });
      }),
    );
  }

  private toViewerPayment(payment: PaymentRecord, viewerId: string): PaymentView {
    // A tenant may follow the shared transaction through escrow, but should not
    // receive a landlord/agent's bank-transfer reference. A publisher only sees
    // their own payout audit details. Administrators use the dedicated endpoint.
    const canViewAllPayouts = payment.tenantId !== viewerId && payment.landlordId === viewerId && !payment.agentId;
    const payouts = canViewAllPayouts
      ? payment.payouts
      : payment.payouts.filter((payout) => payout.recipientUserId === viewerId);
    return { ...payment, transactionReference: payment.reference, payouts };
  }

  private verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): void {
    if (!signature || !/^[a-f0-9]{128}$/i.test(signature)) {
      throw new UnauthorizedException('Invalid payment webhook signature');
    }
    const secret = this.paystackSecret();
    const expected = createHmac('sha512', secret).update(rawBody).digest('hex');
    const provided = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    if (provided.length !== expectedBuffer.length || !timingSafeEqual(provided, expectedBuffer)) {
      throw new UnauthorizedException('Invalid payment webhook signature');
    }
  }

  private paystackSecret(): string {
    // The Paystack client validates configuration during API calls; webhook verification needs the same secret before parsing the event.
    const secret = this.configService.get<string>('PAYSTACK_SECRET_KEY');
    if (!secret) {
      throw new UnauthorizedException('Payment webhook endpoint is not configured');
    }
    return secret;
  }

  private addMonths(startsAt: Date, months: number): Date {
    const result = new Date(startsAt);
    result.setUTCMonth(result.getUTCMonth() + months);
    return result;
  }
}
