import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { CautionStatus, EscrowStatus, LedgerAccountCode, LedgerEntryType, PayoutKind, PayoutStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/database/prisma.service';
import { PaystackService } from '../integrations/paystack.service';
import { LedgerService } from './ledger.service';

@Injectable()
export class PayoutExecutionService {
  private readonly logger = new Logger(PayoutExecutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paystack: PaystackService,
    private readonly ledger: LedgerService,
  ) {}

  async execute(payoutId: string): Promise<void> {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: { recipient: { include: { payoutAccount: true, landlordProfile: true, agentProfile: true } }, payment: true },
    });
    if (!payout || payout.status !== PayoutStatus.SCHEDULED) {
      return;
    }
    // Current destinations live in the reusable payout-account record so a
    // tenant can also receive a refund. Profile-level recipient codes remain a
    // compatibility fallback for accounts created before this migration.
    const recipientCode = payout.recipient.payoutAccount?.recipientCode
      ?? ((payout.kind === PayoutKind.LANDLORD || payout.kind === PayoutKind.CAUTION_DEDUCTION)
        ? payout.recipient.landlordProfile?.payoutRecipientCode
        : payout.kind === PayoutKind.AGENT
          ? payout.recipient.agentProfile?.payoutRecipientCode
          : undefined);
    if (!recipientCode) {
      throw new ServiceUnavailableException('Payout recipient bank account is not configured');
    }
    const claimed = await this.prisma.payout.updateMany({
      where: { id: payout.id, status: PayoutStatus.SCHEDULED },
      data: { status: PayoutStatus.PROCESSING },
    });
    if (claimed.count !== 1) {
      return;
    }
    const reference = `srp_${payout.id.replace(/-/g, '')}`;
    const transferAmountKobo = payout.amountKobo - payout.serviceFeeKobo;
    if (transferAmountKobo <= 0n) {
      throw new ServiceUnavailableException('Payout is below the outstanding service-fee amount');
    }
    try {
      const transfer = await this.paystack.createTransfer({
        recipientCode,
        amountKobo: transferAmountKobo,
        reference,
        reason: `${payout.kind.toLowerCase()} payout for ${payout.payment.reference}`,
      });
      await this.prisma.payout.update({
        where: { id: payout.id },
        data: { providerReference: transfer.reference },
      });
      if (transfer.status === 'success') {
        await this.markProviderResult(transfer.reference, true);
      }
    } catch (error: unknown) {
      await this.prisma.payout.update({
        where: { id: payout.id },
        data: { status: PayoutStatus.FAILED, failureReason: error instanceof Error ? error.message.slice(0, 1000) : 'Payout provider error' },
      });
      this.logger.error(`Payout ${payout.id} failed`);
      throw error;
    }
  }

  async markProviderResult(providerReference: string, successful: boolean, failureReason?: string): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const payout = await transaction.payout.findUnique({ where: { providerReference }, include: { payment: true } });
      if (!payout || this.isTerminal(payout.status)) {
        return;
      }
      if (!successful) {
        await transaction.payout.update({ where: { id: payout.id }, data: { status: PayoutStatus.FAILED, failureReason } });
        return;
      }
      await transaction.payout.update({ where: { id: payout.id }, data: { status: PayoutStatus.PAID, paidAt: new Date() } });
      const debitAccount = payout.kind === PayoutKind.LANDLORD || payout.kind === PayoutKind.CAUTION_DEDUCTION
        ? LedgerAccountCode.LANDLORD_PAYABLE
        : payout.kind === PayoutKind.AGENT
          ? LedgerAccountCode.AGENT_PAYABLE
          : LedgerAccountCode.TENANT_REFUND_PAYABLE;
      await this.ledger.record(transaction, {
        paymentId: payout.paymentId,
        entryType: LedgerEntryType.PAYOUT_COMPLETED,
        debitAccount,
        creditAccount: LedgerAccountCode.PAYMENT_CLEARING,
        amountKobo: payout.amountKobo - payout.serviceFeeKobo,
        idempotencyKey: `payout:${payout.id}:completed`,
        metadata: { payoutId: payout.id },
      });
      await this.updateEscrowSettlement(transaction, payout.paymentId);
    });
  }

  private async updateEscrowSettlement(transaction: Prisma.TransactionClient, paymentId: string): Promise<void> {
    const escrow = await transaction.escrowRecord.findUnique({ where: { paymentId } });
    if (!escrow) return;
    const payouts = await transaction.payout.findMany({
      where: { paymentId, status: PayoutStatus.PAID },
      select: { kind: true, amountKobo: true },
    });
    const sum = (kind: PayoutKind) => payouts
      .filter((payout) => payout.kind === kind)
      .reduce((total, payout) => total + payout.amountKobo, 0n);
    const rentPaidToLandlord = sum(PayoutKind.LANDLORD);
    const rentRefunded = sum(PayoutKind.REFUND);
    const cautionPaidToLandlord = sum(PayoutKind.CAUTION_DEDUCTION);
    const cautionRefunded = sum(PayoutKind.CAUTION_REFUND);
    const openRentPayouts = await transaction.payout.count({
      where: {
        paymentId,
        kind: { in: [PayoutKind.LANDLORD, PayoutKind.AGENT] },
        status: { notIn: [PayoutStatus.PAID, PayoutStatus.FAILED, PayoutStatus.CANCELLED] },
      },
    });
    const rentSettled = (rentPaidToLandlord >= escrow.rentHeldKobo || rentRefunded >= escrow.rentHeldKobo)
      && openRentPayouts === 0;
    const cautionSettled = escrow.cautionHeldKobo === 0n
      || cautionPaidToLandlord + cautionRefunded >= escrow.cautionHeldKobo;
    const finalised = rentSettled && cautionSettled;
    const fullyRefunded = rentRefunded >= escrow.rentHeldKobo
      && cautionRefunded >= escrow.cautionHeldKobo;
    const nextStatus = finalised
      ? fullyRefunded ? EscrowStatus.REFUNDED : EscrowStatus.RELEASED
      : escrow.status === EscrowStatus.DISPUTED ? EscrowStatus.DISPUTED : EscrowStatus.PARTIALLY_SETTLED;
    const nextCautionStatus = escrow.cautionHeldKobo === 0n
      ? CautionStatus.NOT_APPLICABLE
      : cautionSettled
        ? cautionRefunded >= escrow.cautionHeldKobo ? CautionStatus.REFUNDED : CautionStatus.SETTLED
        : escrow.cautionStatus;
    await transaction.escrowRecord.update({
      where: { id: escrow.id },
      data: {
        status: nextStatus,
        cautionStatus: nextCautionStatus,
        releasedAt: finalised && !escrow.releasedAt ? new Date() : undefined,
      },
    });
  }

  private isTerminal(status: PayoutStatus): boolean {
    return status === PayoutStatus.PAID || status === PayoutStatus.CANCELLED;
  }
}
