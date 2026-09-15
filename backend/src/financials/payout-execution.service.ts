import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { LedgerAccountCode, LedgerEntryType, PayoutKind, PayoutStatus, Prisma } from '@prisma/client';
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
      include: { recipient: { include: { landlordProfile: true, agentProfile: true } }, payment: true },
    });
    if (!payout || payout.status !== PayoutStatus.SCHEDULED) {
      return;
    }
    const recipientCode = payout.kind === PayoutKind.LANDLORD
      ? payout.recipient.landlordProfile?.payoutRecipientCode
      : payout.recipient.agentProfile?.payoutRecipientCode;
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
    try {
      const transfer = await this.paystack.createTransfer({
        recipientCode,
        amountKobo: payout.amountKobo,
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
      const debitAccount = payout.kind === PayoutKind.LANDLORD
        ? LedgerAccountCode.LANDLORD_PAYABLE
        : payout.kind === PayoutKind.AGENT
          ? LedgerAccountCode.AGENT_PAYABLE
          : LedgerAccountCode.TENANT_REFUND_PAYABLE;
      await this.ledger.record(transaction, {
        paymentId: payout.paymentId,
        entryType: LedgerEntryType.PAYOUT_COMPLETED,
        debitAccount,
        creditAccount: LedgerAccountCode.PAYMENT_CLEARING,
        amountKobo: payout.amountKobo,
        idempotencyKey: `payout:${payout.id}:completed`,
        metadata: { payoutId: payout.id },
      });
      const outstanding = await transaction.payout.count({
        where: { paymentId: payout.paymentId, kind: { in: [PayoutKind.LANDLORD, PayoutKind.AGENT] }, status: { not: PayoutStatus.PAID } },
      });
      if (outstanding === 0) {
        await transaction.escrowRecord.updateMany({
          where: { paymentId: payout.paymentId, releasedAt: null },
          data: { status: 'RELEASED', releasedAt: new Date() },
        });
      }
    });
  }

  private isTerminal(status: PayoutStatus): boolean {
    return status === PayoutStatus.PAID || status === PayoutStatus.CANCELLED;
  }
}
