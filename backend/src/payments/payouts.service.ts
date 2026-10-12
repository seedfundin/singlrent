import { ConflictException, ForbiddenException, Injectable, NotFoundException, PreconditionFailedException } from '@nestjs/common';
import { KycStatus, PayoutStatus } from '@prisma/client';
import { PrismaService } from '../common/database/prisma.service';
import { PayoutJobsService } from '../jobs/payout-jobs.service';
import { KycService } from '../users/kyc.service';
import { PayoutWithdrawRequest } from './dto/payment.schemas';

@Injectable()
export class PayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kycService: KycService,
    private readonly payoutJobs: PayoutJobsService,
  ) {}

  async listMine(userId: string) {
    return this.prisma.payout.findMany({
      where: { recipientUserId: userId },
      include: { payment: { select: { id: true, reference: true, listing: { select: { title: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async withdraw(userId: string, payoutId: string, input: PayoutWithdrawRequest) {
    const payout = await this.prisma.payout.findFirst({
      where: { id: payoutId, recipientUserId: userId },
      include: { recipient: { include: { kyc: true, payoutAccount: true, landlordProfile: true, agentProfile: true } } },
    });
    if (!payout) throw new NotFoundException('Payout not found');
    if (payout.status !== PayoutStatus.PENDING) {
      throw new ConflictException('This payout is not available to withdraw');
    }
    const legacyRecipientCode = payout.kind === 'LANDLORD' || payout.kind === 'CAUTION_DEDUCTION'
      ? payout.recipient.landlordProfile?.payoutRecipientCode
      : payout.kind === 'AGENT'
        ? payout.recipient.agentProfile?.payoutRecipientCode
        : undefined;
    if (!payout.recipient.payoutAccount && !legacyRecipientCode) {
      throw new PreconditionFailedException({
        code: 'PAYOUT_DESTINATION_REQUIRED',
        message: 'Add a bank account before requesting a payout.',
      });
    }

    if (payout.recipient.kyc?.status !== KycStatus.VERIFIED) {
      if (!input.nin) {
        throw new PreconditionFailedException({
          code: 'KYC_REQUIRED',
          message: 'Enter your NIN to complete the one-time Dojah verification. A ₦100 service fee will be deducted from this payout, even if verification is unsuccessful.',
          serviceFeeKobo: KycService.SERVICE_FEE_KOBO.toString(),
        });
      }
      const result = await this.kycService.verifyPayoutWithdrawal(userId, payoutId, { nin: input.nin });
      if (!result.verified) {
        throw new ForbiddenException('Dojah could not verify this NIN. The ₦100 service fee was deducted; you can try again with a different NIN.');
      }
    }

    const scheduled = await this.prisma.payout.updateMany({
      where: { id: payoutId, recipientUserId: userId, status: PayoutStatus.PENDING },
      data: { status: PayoutStatus.SCHEDULED, scheduledAt: new Date() },
    });
    if (scheduled.count !== 1) throw new ConflictException('This payout is no longer available to withdraw');
    await this.payoutJobs.enqueue(payoutId);
    return this.prisma.payout.findUniqueOrThrow({
      where: { id: payoutId },
      include: { payment: { select: { id: true, reference: true, listing: { select: { title: true } } } } },
    });
  }
}
