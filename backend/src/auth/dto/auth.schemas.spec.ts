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

  it('does not apply the agent age rule to a tenant', () => {
    expect(registerSchema.safeParse({ ...validRegistration, dateOfBirth: new Date().toISOString() }).success).toBe(true);
  });

  it('requires agents to provide a date of birth and be at least 18', () => {
    expect(registerSchema.safeParse({ ...validRegistration, role: RoleCode.AGENT }).success).toBe(false);
    expect(registerSchema.safeParse({ ...validRegistration, role: RoleCode.AGENT, dateOfBirth: new Date().toISOString() }).success).toBe(false);
    expect(registerSchema.safeParse({ ...validRegistration, role: RoleCode.AGENT, dateOfBirth: '1990-01-01' }).success).toBe(true);
  });
});
