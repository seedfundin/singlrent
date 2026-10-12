import { KycService } from './kyc.service';

describe('KycService transactional verification', () => {
  it('does not start a Dojah lookup from the old direct NIN endpoint', async () => {
    const service = new KycService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.submitNin('user-id', { nin: '12345678901' }))
      .rejects
      .toThrow('Start NIN verification from a payment or payout');
  });
});
