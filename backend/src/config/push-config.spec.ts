import { validateEnvironment } from './env.validation';

describe('push configuration', () => {
  const base = { DATABASE_URL: 'postgresql://localhost:5432/test', REDIS_URL: 'redis://localhost:6379', JWT_ACCESS_SECRET: 'a'.repeat(32) };
  it('does not require push credentials while disabled', () => {
    expect(validateEnvironment(base).PUSH_NOTIFICATIONS_ENABLED).toBe(false);
  });
  it('rejects enabling push without an encryption key and provider', () => {
    expect(() => validateEnvironment({ ...base, PUSH_NOTIFICATIONS_ENABLED: 'true' })).toThrow('PUSH_DEVICE_ENCRYPTION_KEY');
  });
  it('accepts an independently configured Web Push provider', () => {
    expect(validateEnvironment({ ...base, PUSH_NOTIFICATIONS_ENABLED: 'true', PUSH_DEVICE_ENCRYPTION_KEY: 'b'.repeat(32), WEB_PUSH_VAPID_PUBLIC_KEY: 'public', WEB_PUSH_VAPID_PRIVATE_KEY: 'private', WEB_PUSH_VAPID_SUBJECT: 'mailto:push@example.com' }).PUSH_NOTIFICATIONS_ENABLED).toBe(true);
  });
});
