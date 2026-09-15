import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApplicationStatus,
  CautionStatus,
  EscrowStatus,
  LedgerAccountCode,
  LedgerEntryType,
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
import { PaystackService } from '../integrations/paystack.service';
import { PayoutJobsService } from '../jobs/payout-jobs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../websocket/realtime.gateway';
import {
  CautionDeductionRequest,
  PaymentInitializationRequest,
  PaymentQuery,
  PaystackWebhookRequest,
  ResolveCautionDeductionRequest,
} from './dto/payment.schemas';

const paymentInclude = {
  listing: { select: { id: true, slug: true, title: true, source: true } },
  application: { select: { id: true, status: true, moveInDate: true, leaseMonths: true } },
  escrow: { include: { cautionDeductions: true } },
  payouts: { orderBy: { createdAt: 'asc' as const } },
  landlord: { select: { id: true, firstName: true, lastName: true } },
  agent: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.PaymentInclude;

type PaymentView = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;
const confirmableStatuses: PaymentStatus[] = [PaymentStatus.INITIALIZED, PaymentStatus.PENDING];

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
    private readonly paystack: PaystackService,
    private readonly configService: ConfigService,
    private readonly payoutJobs: PayoutJobsService,
    private readonly notificationsService: NotificationsService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly audit: AuditService,
  ) {}

  async initialize(tenantId: string, input: PaymentInitializationRequest) {
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
      throw new ConflictException('Paystack has not confirmed this payment');
    }
    return this.recordSuccessfulPayment(payment.reference, verification.amountKobo, verification.currency, jsonValue(verification.payload));
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
    return pageResult(items, total, query);
  }

  async get(userId: string, paymentId: string): Promise<PaymentView> {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, OR: [{ tenantId: userId }, { landlordId: userId }, { agentId: userId }] },
      include: paymentInclude,
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    return payment;
  }

  async authorizeRelease(managerId: string, paymentId: string): Promise<PaymentView> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { application: true, escrow: true },
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    if (![payment.landlordId, payment.agentId].includes(managerId)) {
      throw new ForbiddenException('Only the landlord or managing agent can authorize fund release');
    }
    const escrow = payment.escrow;
    if (payment.status !== PaymentStatus.SUCCESS || payment.application.status !== ApplicationStatus.PAYMENT_HELD || !escrow) {
      throw new ConflictException('This payment is not ready for escrow release');
    }

    const payoutIds = await this.prisma.$transaction(async (transaction) => {
      const released = await transaction.escrowRecord.updateMany({
        where: { id: escrow.id, status: EscrowStatus.HELD },
        data: { status: EscrowStatus.RELEASE_SCHEDULED, releaseAuthorizedAt: new Date() },
      });
      if (released.count !== 1) {
        throw new ConflictException('Escrow release has already been authorized');
      }
      await transaction.rentalApplication.update({
        where: { id: payment.applicationId },
        data: { status: ApplicationStatus.APPROVED, decidedAt: new Date() },
      });
      await transaction.listing.update({ where: { id: payment.listingId }, data: { availability: 'RENTED' } });
      const endsAt = this.addMonths(payment.application.moveInDate, payment.application.leaseMonths);
      await transaction.tenancy.upsert({
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
      const payouts = await Promise.all([
        transaction.payout.create({
          data: {
            paymentId: payment.id,
            recipientUserId: payment.landlordId,
            kind: PayoutKind.LANDLORD,
            amountKobo: payment.rentAmountKobo,
            status: PayoutStatus.SCHEDULED,
            scheduledAt: new Date(),
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
                  status: PayoutStatus.SCHEDULED,
                  scheduledAt: new Date(),
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
      return payouts.map((payout) => payout.id);
    });
    await Promise.all(payoutIds.map((payoutId) => this.payoutJobs.enqueue(payoutId).catch(() => undefined)));
    const updated = await this.get(managerId, paymentId);
    await this.notifyPaymentParticipants(updated, NotificationType.ESCROW_UPDATED, 'Escrow release authorized', 'The tenancy was approved and payout processing has started.');
    return updated;
  }

  async proposeCautionDeduction(managerId: string, paymentId: string, input: CautionDeductionRequest) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { escrow: true } });
    if (!payment || !payment.escrow) {
      throw new NotFoundException('Escrow payment not found');
    }
    if (![payment.landlordId, payment.agentId].includes(managerId)) {
      throw new ForbiddenException('Only the landlord or managing agent can propose a caution deduction');
    }
    const amountKobo = parseKobo(input.amountKobo, 'amountKobo');
    if (amountKobo <= 0n || amountKobo > payment.escrow.cautionHeldKobo) {
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
      await transaction.cautionDeduction.update({ where: { id: deduction.id }, data: { acceptedAt: new Date(), resolutionNote: input.note } });
      await transaction.escrowRecord.update({ where: { id: payment.escrow!.id }, data: { cautionStatus: CautionStatus.SETTLED } });
      await this.ledger.record(transaction, {
        paymentId: payment.id,
        entryType: LedgerEntryType.CAUTION_DEDUCTION_ALLOCATED,
        debitAccount: LedgerAccountCode.CAUTION_ESCROW,
        creditAccount: LedgerAccountCode.LANDLORD_PAYABLE,
        amountKobo: deduction.amountKobo,
        idempotencyKey: `deduction:${deduction.id}:accepted`,
        metadata: { note: input.note ?? null },
      });
    });
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
          throw new ConflictException('Paystack webhook is missing its transaction reference');
        }
        const verified = await this.paystack.verifyTransaction(reference);
        if (verified.status !== 'success') {
          throw new ConflictException('Paystack did not verify this payment as successful');
        }
        await this.recordSuccessfulPayment(reference, verified.amountKobo, verified.currency, jsonValue(verified.payload));
      }
      if (event.event === 'transfer.success' || event.event === 'transfer.failed') {
        const reference = typeof event.data.reference === 'string' ? event.data.reference : undefined;
        if (reference) {
          await this.payoutExecutionService.markProviderResult(
            reference,
            event.event === 'transfer.success',
            event.event === 'transfer.failed' ? 'Paystack transfer failed' : undefined,
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

  private async recordSuccessfulPayment(reference: string, amountKobo: bigint, currency: string, payload: Prisma.InputJsonValue): Promise<PaymentView> {
    const payment = await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.payment.findUnique({ where: { reference }, include: { application: true } });
      if (!current) {
        throw new NotFoundException('Payment reference not found');
      }
      if (current.currency !== currency || current.totalAmountKobo !== amountKobo) {
        throw new ConflictException('Paystack amount or currency does not match the server payment record');
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
      await transaction.escrowRecord.create({
        data: {
          paymentId: current.id,
          rentHeldKobo: current.rentAmountKobo,
          cautionHeldKobo: current.cautionFeeKobo,
          cautionStatus: current.cautionFeeKobo > 0n ? CautionStatus.HELD : CautionStatus.NOT_APPLICABLE,
        },
      });
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
        entryType: LedgerEntryType.AGENT_COMMISSION_ALLOCATED,
        debitAccount: LedgerAccountCode.PAYMENT_CLEARING,
        creditAccount: LedgerAccountCode.AGENT_PAYABLE,
        amountKobo: current.agentFeeKobo,
        idempotencyKey: `payment:${current.id}:agent-fee`,
      });
      return transaction.payment.findUniqueOrThrow({ where: { id: current.id } });
    });
    const detailed = await this.prisma.payment.findUniqueOrThrow({ where: { id: payment.id }, include: paymentInclude });
    await this.notifyPaymentParticipants(detailed, NotificationType.PAYMENT_SUCCESSFUL, 'Payment confirmed and held in escrow', 'Your rent payment was verified and is protected in escrow pending release authorization.');
    return detailed;
  }

  private async markFailed(paymentId: string, payload: Prisma.InputJsonValue): Promise<void> {
    await this.prisma.payment.updateMany({
      where: { id: paymentId, status: { in: [PaymentStatus.INITIALIZED, PaymentStatus.PENDING] } },
      data: { status: PaymentStatus.FAILED, failedAt: new Date(), providerPayload: payload },
    });
  }

  private async notifyPaymentParticipants(payment: PaymentView, type: NotificationType, title: string, body: string): Promise<void> {
    const recipients = [payment.tenantId, payment.landlordId, payment.agentId].filter((id): id is string => Boolean(id));
    await Promise.all(
      [...new Set(recipients)].map(async (userId) => {
        this.realtimeGateway.emitPaymentUpdate(userId, { paymentId: payment.id, status: payment.status, escrowStatus: payment.escrow?.status });
        return this.notificationsService.create({ userId, type, title, body, data: { paymentId: payment.id, applicationId: payment.applicationId } });
      }),
    );
  }

  private verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): void {
    if (!signature || !/^[a-f0-9]{128}$/i.test(signature)) {
      throw new UnauthorizedException('Invalid Paystack webhook signature');
    }
    const secret = this.paystackSecret();
    const expected = createHmac('sha512', secret).update(rawBody).digest('hex');
    const provided = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    if (provided.length !== expectedBuffer.length || !timingSafeEqual(provided, expectedBuffer)) {
      throw new UnauthorizedException('Invalid Paystack webhook signature');
    }
  }

  private paystackSecret(): string {
    // The Paystack client validates configuration during API calls; webhook verification needs the same secret before parsing the event.
    const secret = this.configService.get<string>('PAYSTACK_SECRET_KEY');
    if (!secret) {
      throw new UnauthorizedException('Paystack webhook endpoint is not configured');
    }
    return secret;
  }

  private addMonths(startsAt: Date, months: number): Date {
    const result = new Date(startsAt);
    result.setUTCMonth(result.getUTCMonth() + months);
    return result;
  }
}
