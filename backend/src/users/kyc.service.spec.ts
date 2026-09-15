import { KycStatus } from '@prisma/client';
import { KycService } from './kyc.service';

describe('KycService Dojah verification', () => {
  const submittedNin = '12345678901';

  function createService(verification: { verified: true; phoneNumber: string } | { verified: false; reason: string }) {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-id',
          phone: '+2348012345678',
          phoneVerifiedAt: new Date(),
          kyc: { status: KycStatus.PENDING, phoneStatus: KycStatus.VERIFIED },
        }),
      },
      kycProfile: {
        upsert: jest.fn().mockResolvedValue(undefined),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const provider = { verifyNin: jest.fn().mockResolvedValue(verification) };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const config = { getOrThrow: jest.fn().mockReturnValue('local-field-encryption-secret-at-least-32-chars') };

    return {
      service: new KycService(prisma as never, config as never, provider as never, audit as never),
      prisma,
      provider,
    };
  }

  it('marks KYC verified only after Dojah returns a matching NIMC phone record', async () => {
    const { service, prisma, provider } = createService({ verified: true, phoneNumber: '08012345678' });

    await expect(service.submitNin('user-id', { nin: submittedNin })).resolves.toMatchObject({
      status: KycStatus.VERIFIED,
      verified: true,
      provider: 'DOJAH',
    });

    expect(provider.verifyNin).toHaveBeenCalledWith(submittedNin);
    expect(prisma.kycProfile.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: KycStatus.VERIFIED, ninStatus: KycStatus.VERIFIED }) }),
    );
  });

  it('rejects KYC rather than verifying it when Dojah cannot validate the NIN', async () => {
    const { service, prisma } = createService({ verified: false, reason: 'Dojah could not find a valid NIN record.' });

    await expect(service.submitNin('user-id', { nin: submittedNin })).resolves.toMatchObject({
      status: KycStatus.REJECTED,
      verified: false,
    });

    expect(prisma.kycProfile.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: KycStatus.REJECTED, ninStatus: KycStatus.REJECTED }) }),
    );
  });
});
