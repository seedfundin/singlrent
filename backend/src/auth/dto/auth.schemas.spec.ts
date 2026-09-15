import { RoleCode } from '@prisma/client';
import { registerSchema } from './auth.schemas';

describe('registerSchema', () => {
  const validRegistration = {
    email: 'tenant@example.com',
    firstName: 'Ayo',
    lastName: 'Okafor',
    password: 'a-strong-password',
    confirmPassword: 'a-strong-password',
    role: RoleCode.TENANT,
  };

  it('rejects mismatched passwords', () => {
    expect(
      registerSchema.safeParse({ ...validRegistration, confirmPassword: 'another-password' }).success,
    ).toBe(false);
  });

  it('does not permit creating an administrator through public registration', () => {
    expect(registerSchema.safeParse({ ...validRegistration, role: RoleCode.ADMIN }).success).toBe(false);
  });
});
