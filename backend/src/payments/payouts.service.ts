import { ConflictException, ForbiddenException, Injectable, NotFoundException, PreconditionFailedException, ServiceUnavailableException } from '@nestjs/common';
import { KycStatus, PayoutKind, PayoutStatus, PublisherVerificationStatus } from '@prisma/client';
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
      include: {
        recipient: {
          include: {
            kyc: true,
            publisherVerification: { select: { status: true, livenessVerified: true } },
            payoutAccount: true,
            landlordProfile: true,
            agentProfile: true,
          },
        },
      },
    });
    if (!payout) throw new NotFoundException('Payout not found');
    const canRetry = payout.status === PayoutStatus.FAILED && !payout.providerReference;
    if (payout.status !== PayoutStatus.PENDING && !canRetry) {
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

    const isPublisherPayout = payout.kind === PayoutKind.LANDLORD
      || payout.kind === PayoutKind.AGENT
      || payout.kind === PayoutKind.CAUTION_DEDUCTION;

    // Landlords and agents are already identity-verified, including liveness,
    // before they can publish a listing. Requiring NIN/BVN again here would
    // charge and inconvenience a publisher for a check SingleRent has already
    // completed. The retained check protects legacy/direct API requests.
    if (isPublisherPayout) {
      const publisherVerification = payout.recipient.publisherVerification;
      if (publisherVerification?.status !== PublisherVerificationStatus.VERIFIED || !publisherVerification.livenessVerified) {
        throw new PreconditionFailedException({
          code: 'PUBLISHER_VERIFICATION_REQUIRED',
          message: 'Your publisher verification must be approved before this payout can be withdrawn.',
        });
      }
    } else {
      if (payout.recipient.kyc?.status === KycStatus.UNDER_REVIEW) {
        throw new PreconditionFailedException({
          code: 'KYC_UNDER_REVIEW',
          message: 'Your Dojah identity record is awaiting an administrator name review. Do not start another paid verification attempt.',
        });
      }

      if (payout.recipient.kyc?.status !== KycStatus.VERIFIED) {
        if (!input.method || !input.identifier) {
          throw new PreconditionFailedException({
            code: 'KYC_REQUIRED',
            message: 'Enter your NIN or BVN to complete the one-time Dojah verification. A ₦100 service fee will be deducted from this payout, even if verification is unsuccessful.',
            serviceFeeKobo: KycService.SERVICE_FEE_KOBO.toString(),
          });
        }
        const result = await this.kycService.verifyPayoutWithdrawal(userId, payoutId, { method: input.method, identifier: input.identifier });
        if (!result.verified) {
          if ('underReview' in result && result.underReview) {
            throw new ForbiddenException('Dojah confirmed the identity record, but its name does not match the SingleRent account. An administrator must review it before payout.');
          }
          throw new ForbiddenException('Dojah could not verify this identity number. The ₦100 service fee was deducted; you can try again with a correct NIN or BVN.');
        }
      }
    }

    const scheduled = await this.prisma.payout.updateMany({
      where: {
        id: payoutId,
        recipientUserId: userId,
        status: canRetry ? PayoutStatus.FAILED : PayoutStatus.PENDING,
      },
      data: { status: PayoutStatus.SCHEDULED, scheduledAt: new Date(), failureReason: null },
    });
    if (scheduled.count !== 1) throw new ConflictException('This payout is no longer available to withdraw');
    try {
      await this.payoutJobs.enqueue(payoutId);
    } catch {
      // The scheduled state is durable and the recovery service will enqueue
      // it again. Do not make a recipient retry a withdrawal that is already
      // safely recorded.
      throw new ServiceUnavailableException('Your payout request was saved and will be processed shortly. Please do not submit it again.');
    }
    return this.prisma.payout.findUniqueOrThrow({
      where: { id: payoutId },
      include: { payment: { select: { id: true, reference: true, listing: { select: { title: true } } } } },
    });
  }
}
