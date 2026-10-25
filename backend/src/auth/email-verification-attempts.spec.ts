import { createHash } from 'crypto';
import { AuthService } from './auth.service';

describe('email verification attempt limits', () => {
  it('uses a keyed OTP hash while retaining short-lived legacy challenges', () => {
    const config = { getOrThrow: () => 'test-secret-at-least-thirty-two-characters' };
    const service = new AuthService({} as never, {} as never, {} as never, {} as never, {} as never, {} as never, config as never, {} as never);
    const stored = service['hashVerificationCode']('123456');
    const legacy = createHash('sha256').update('123456').digest('hex');
    expect(stored).toHaveLength(64);
    expect(stored).not.toEqual(legacy);
    expect(service['matchesVerificationCode']('123456', stored)).toBe(true);
    expect(service['matchesVerificationCode']('123456', legacy)).toBe(true);
    expect(service['matchesVerificationCode']('000000', stored)).toBe(false);
  });
  it('commits failed attempts and rejects the correct code after five failures', async () => {
    const challenge = { id: 'challenge', consumedAt: null as Date | null, expiresAt: new Date(Date.now() + 60_000), attempts: 0, codeHash: createHash('sha256').update('123456').digest('hex') };
    const tx = {
      emailVerificationChallenge: {
        findFirst: jest.fn(async () => ({ ...challenge })),
        updateMany: jest.fn(async ({ data }: { data: { attempts?: { increment: number }; consumedAt?: Date } }) => {
          if (data.attempts) challenge.attempts += data.attempts.increment;
          if (data.consumedAt) challenge.consumedAt = data.consumedAt;
          return { count: 1 };
        }),
      },
      user: { update: jest.fn() },
    };
    const prisma = { $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => {
      const before = { ...challenge };
      try { return await fn(tx); } catch (error) { Object.assign(challenge, before); throw error; }
    } };
    const service = new AuthService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, { getOrThrow: () => 'test-secret-at-least-thirty-two-characters' } as never, {} as never);
    const user = { userId: 'user' } as never;
    for (let i = 0; i < 5; i++) {
      await expect(service.confirmEmailVerification(user, { challengeId: 'challenge', code: '000000' })).rejects.toThrow('invalid');
    }
    expect(challenge.attempts).toBe(5);
    await expect(service.confirmEmailVerification(user, { challengeId: 'challenge', code: '123456' })).rejects.toThrow('invalid or expired');
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});
