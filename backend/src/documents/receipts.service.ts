import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PayoutKind, Prisma, ReceiptKind } from '@prisma/client';
import { PrismaService } from '../common/database/prisma.service';
import { createReceiptPdf } from './pdf-document';

const receiptInclude = {
  payment: { include: { listing: { select: { title: true, address: true } }, tenant: { select: { firstName: true, lastName: true, email: true } }, landlord: { select: { firstName: true, lastName: true, email: true } } } },
  payout: { select: { id: true, kind: true, amountKobo: true, serviceFeeKobo: true, providerReference: true, paidAt: true } },
  recipient: { select: { firstName: true, lastName: true, email: true } },
} satisfies Prisma.ReceiptInclude;

type ReceiptView = Prisma.ReceiptGetPayload<{ include: typeof receiptInclude }>;

@Injectable()
export class ReceiptsService {
  constructor(private readonly prisma: PrismaService) {}

  async issueTenantPaymentReceipt(paymentId: string): Promise<void> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { tenant: { select: { id: true } } },
    });
    if (!payment) throw new NotFoundException('Payment not found while issuing tenant receipt');
    await this.prisma.receipt.upsert({
      where: { paymentId_kind: { paymentId, kind: ReceiptKind.TENANT_PAYMENT_CONFIRMED } },
      create: {
        receiptNumber: `SR-TP-${payment.reference}`,
        kind: ReceiptKind.TENANT_PAYMENT_CONFIRMED,
        paymentId,
        recipientUserId: payment.tenantId,
        metadata: {
          paymentReference: payment.reference,
          verifiedAt: payment.verifiedAt?.toISOString() ?? null,
          rentAmountKobo: payment.rentAmountKobo.toString(),
          platformFeeKobo: payment.platformFeeKobo.toString(),
          agentFeeKobo: payment.agentFeeKobo.toString(),
          legalFeeKobo: payment.legalFeeKobo.toString(),
          cautionFeeKobo: payment.cautionFeeKobo.toString(),
          totalAmountKobo: payment.totalAmountKobo.toString(),
          currency: payment.currency,
          protectionStatement: 'Payment has been confirmed and recorded in SingleRent’s protected-payment process.',
        },
      },
      update: {},
    });
  }

  async issuePayoutProofOfPayment(transaction: Prisma.TransactionClient, payout: { id: string; paymentId: string; recipientUserId: string; kind: PayoutKind; amountKobo: bigint; serviceFeeKobo: bigint; providerReference: string | null; paidAt: Date | null; payment: { reference: string; currency: string } }): Promise<void> {
    if (payout.kind !== PayoutKind.LANDLORD && payout.kind !== PayoutKind.AGENT && payout.kind !== PayoutKind.CAUTION_DEDUCTION) return;
    await transaction.receipt.upsert({
      where: { payoutId_kind: { payoutId: payout.id, kind: ReceiptKind.LANDLORD_PAYOUT_DISBURSED } },
      create: {
        receiptNumber: `SR-POP-${payout.id.replace(/-/g, '').slice(0, 20).toUpperCase()}`,
        kind: ReceiptKind.LANDLORD_PAYOUT_DISBURSED,
        paymentId: payout.paymentId,
        payoutId: payout.id,
        recipientUserId: payout.recipientUserId,
        metadata: {
          paymentReference: payout.payment.reference,
          payoutReference: payout.providerReference,
          payoutKind: payout.kind,
          amountKobo: payout.amountKobo.toString(),
          serviceFeeKobo: payout.serviceFeeKobo.toString(),
          grossAmountKobo: payout.amountKobo.toString(),
          netAmountKobo: (payout.amountKobo - payout.serviceFeeKobo).toString(),
          currency: payout.payment.currency,
          paidAt: payout.paidAt?.toISOString() ?? null,
        },
      },
      update: {},
    });
  }

  async listForViewer(userId: string): Promise<ReceiptView[]> {
    return this.prisma.receipt.findMany({ where: { recipientUserId: userId }, include: receiptInclude, orderBy: { issuedAt: 'desc' } });
  }

  async pdfForViewer(userId: string, receiptId: string): Promise<{ filename: string; data: Buffer }> {
    const receipt = await this.prisma.receipt.findFirst({ where: { id: receiptId, recipientUserId: userId }, include: receiptInclude });
    if (!receipt) throw new ForbiddenException('This receipt is not available to your account');
    const metadata = receipt.metadata as Record<string, unknown>;
    const currency = typeof metadata.currency === 'string' && metadata.currency.trim() ? metadata.currency.trim().toUpperCase() : receipt.payment.currency;
    const amountInKobo = (value: unknown) => Number(typeof value === 'string' || typeof value === 'number' ? value : 0) / 100;
    const money = (value: unknown) => `${currency} ${amountInKobo(value).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const issuedAt = new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' }).format(receipt.issuedAt);
    const payoutProof = receipt.kind === ReceiptKind.LANDLORD_PAYOUT_DISBURSED;
    const amountKobo = payoutProof ? (metadata.netAmountKobo ?? metadata.amountKobo) : metadata.totalAmountKobo;
    const payoutKind = receipt.payout?.kind ?? metadata.payoutKind;
    const proofLabel = payoutKind === PayoutKind.AGENT ? 'Agent proof of payment' : payoutKind === PayoutKind.CAUTION_DEDUCTION ? 'Landlord caution proof of payment' : 'Landlord proof of payment';
    const tenantLineItems = [
      { label: 'Annual rent', value: money(metadata.rentAmountKobo) },
      { label: 'SingleRent service fee', value: money(metadata.platformFeeKobo) },
      { label: 'Legal documentation fee', value: money(metadata.legalFeeKobo) },
      ...(amountInKobo(metadata.agentFeeKobo) > 0 ? [{ label: 'Agent service fee', value: money(metadata.agentFeeKobo) }] : []),
      { label: 'Caution deposit', value: money(metadata.cautionFeeKobo) },
    ];
    const payoutLineItems = [
      { label: 'Gross disbursement', value: money(metadata.grossAmountKobo ?? metadata.amountKobo) },
      { label: 'SingleRent transfer fee', value: money(metadata.serviceFeeKobo) },
      { label: 'Net amount paid', value: money(metadata.netAmountKobo ?? metadata.amountKobo) },
    ];
    const data = createReceiptPdf({
      title: payoutProof ? proofLabel : 'Payment receipt',
      receiptNumber: receipt.receiptNumber,
      issuedAt,
      recipientName: `${receipt.recipient.firstName} ${receipt.recipient.lastName}`.trim(),
      recipientEmail: receipt.recipient.email,
      propertyTitle: receipt.payment.listing.title,
      propertyAddress: receipt.payment.listing.address,
      paymentReference: receipt.payment.reference,
      total: money(amountKobo),
      lineItems: payoutProof ? payoutLineItems : tenantLineItems,
      note: payoutProof
        ? 'This payment has been sent to the recipient account. The transfer reference is recorded below for support and reconciliation.'
        : typeof metadata.protectionStatement === 'string' && metadata.protectionStatement.trim()
          ? metadata.protectionStatement
          : 'Your payment has been confirmed and recorded while the required move-in steps are completed.',
      payoutReference: receipt.payout?.providerReference ?? (typeof metadata.payoutReference === 'string' ? metadata.payoutReference : null),
    });
    return { filename: `${receipt.receiptNumber}.pdf`, data };
  }
}
