import { PayoutKind, PayoutStatus, PublisherVerificationStatus } from '@prisma/client';
import { PrismaService } from '../common/database/prisma.service';
import { PayoutJobsService } from '../jobs/payout-jobs.service';
import { KycService } from '../users/kyc.service';
import { PayoutsService } from './payouts.service';

describe('publisher payout withdrawals', () => {
  const createService = (kind: PayoutKind) => {
    const payout = {
      id: 'payout',
      kind,
      status: PayoutStatus.PENDING,
      recipient: {
        payoutAccount: { id: 'bank-account' },
        landlordProfile: null,
        agentProfile: null,
        kyc: null,
        publisherVerification: {
          status: PublisherVerificationStatus.VERIFIED,
          livenessVerified: true,
        },
      },
    };
    const prisma = {
      payout: {
        findFirst: jest.fn().mockResolvedValue(payout),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(payout),
      },
    } as unknown as PrismaService;
    const kyc = { verifyPayoutWithdrawal: jest.fn() } as unknown as KycService;
    const payoutJobs = { enqueue: jest.fn().mockResolvedValue(undefined) } as unknown as PayoutJobsService;
    return { service: new PayoutsService(prisma, kyc, payoutJobs), kyc, payoutJobs };
  };

  it.each([PayoutKind.LANDLORD, PayoutKind.AGENT, PayoutKind.CAUTION_DEDUCTION])(
    '%s uses the publisher verification already completed for listing access',
    async (kind) => {
      const { service, kyc, payoutJobs } = createService(kind);

      await expect(service.withdraw('publisher', 'payout', {})).resolves.toMatchObject({ id: 'payout' });

      expect(kyc.verifyPayoutWithdrawal as jest.Mock).not.toHaveBeenCalled();
      expect(payoutJobs.enqueue as jest.Mock).toHaveBeenCalledWith('payout');
    },
  );
});
