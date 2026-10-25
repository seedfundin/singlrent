import { DojahVerificationService } from './dojah-verification.service';
import { compareIdentityName } from './identity-name-match';

describe('identity name matching', () => {
  it('accepts only harmless legal-name formatting differences', () => {
    expect(compareIdentityName(
      { firstName: 'Àda-Máry', lastName: "O'Connor" },
      { firstName: 'ada mary', lastName: 'oconnor' },
    )).toEqual({ status: 'MATCHED', reason: null });
  });

  it('holds a material legal-name difference for review', () => {
    expect(compareIdentityName(
      { firstName: 'Ada', lastName: 'Okafor' },
      { firstName: 'Ada', lastName: 'Ibrahim' },
    )).toEqual({
      status: 'MISMATCHED',
      reason: 'The name on the SingleRent account does not match the name returned by Dojah.',
    });
  });

  it('extracts a NIN identity name from a hosted Dojah result without storing the payload', () => {
    const service = new DojahVerificationService({} as never);
    const result = service.parseHostedVerification({
      reference_id: 'sr-publisher-reference-123',
      status: true,
      verification_status: 'Completed',
      id_type: 'NIN',
      verification_mode: 'liveness',
      data: {
        government_data: {
          status: true,
          data: {
            nin: { first_name: 'Ada', last_name: 'Okafor', middle_name: 'Chiamaka' },
          },
        },
        selfie: { status: true, message: 'Liveness check passed' },
      },
    });

    expect(result.passed).toBe(true);
    expect(result.identityName).toEqual({ firstName: 'Ada', lastName: 'Okafor', middleName: 'Chiamaka' });
  });
});
