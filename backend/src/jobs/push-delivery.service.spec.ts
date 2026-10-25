import { createCipheriv, createHash, randomBytes } from 'crypto';
import { PushDeliveryService } from './push-delivery.service';

const send = jest.fn();
const sendWeb = jest.fn();
jest.mock('firebase-admin/app', () => ({ getApps: () => [{ name: 'singlerent-push' }], initializeApp: jest.fn(), cert: jest.fn() }));
jest.mock('firebase-admin/messaging', () => ({ getMessaging: () => ({ send }) }));
jest.mock('web-push', () => ({ sendNotification: (...args: unknown[]) => sendWeb(...args) }));

describe('push delivery', () => {
  const key = 'test-key-that-has-at-least-32-characters';
  const encrypt = (value: string) => {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(key).digest(), iv);
    const encrypted = Buffer.concat([cipher.update(value), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
  };
  const config = { get: (name: string) => ({ PUSH_NOTIFICATIONS_ENABLED: true, PUSH_DEVICE_ENCRYPTION_KEY: key, FIREBASE_SERVER_PROJECT_ID: 'project', FIREBASE_CLIENT_EMAIL: 'test@example.com', FIREBASE_PRIVATE_KEY: 'key' })[name] };
  const database = () => ({
    notification: { findFirst: jest.fn().mockResolvedValue({ id: 'notification', type: 'NEW_MESSAGE' }) },
    notificationPreference: { findUnique: jest.fn().mockResolvedValue(null) },
    pushDevice: { findMany: jest.fn().mockResolvedValue([{ id: 'device', encryptedData: encrypt('device-token') }]), deleteMany: jest.fn() },
    pushDelivery: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
  });
  beforeEach(() => { send.mockReset(); sendWeb.mockReset(); });
  it('submits only a generic message and records provider acceptance', async () => {
    const db = database(); send.mockResolvedValue('provider-id');
    await new PushDeliveryService(db as never, config as never).deliver('notification', 'user');
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ token: 'device-token', data: expect.objectContaining({ notificationId: 'notification' }) }));
    expect(db.pushDelivery.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ status: 'ACCEPTED' }) }));
  });
  it('removes a token rejected as invalid', async () => {
    const db = database(); send.mockRejectedValue({ code: 'messaging/registration-token-not-registered' });
    await new PushDeliveryService(db as never, config as never).deliver('notification', 'user');
    expect(db.pushDevice.deleteMany).toHaveBeenCalledWith({ where: { id: 'device', userId: 'user' } });
  });
  it('does not send when the recipient disabled that type', async () => {
    const db = database(); db.notificationPreference.findUnique.mockResolvedValue({ enabled: false });
    await new PushDeliveryService(db as never, config as never).deliver('notification', 'user');
    expect(send).not.toHaveBeenCalled();
  });
  it('does not resend a provider-accepted notification during a retry', async () => {
    const db = database(); db.pushDelivery.findUnique.mockResolvedValue({ status: 'ACCEPTED' });
    await new PushDeliveryService(db as never, config as never).deliver('notification', 'user');
    expect(send).not.toHaveBeenCalled();
  });
  it('records a temporary provider failure so the queue can retry it', async () => {
    const db = database(); send.mockRejectedValue({ code: 'messaging/server-unavailable' });
    await expect(new PushDeliveryService(db as never, config as never).deliver('notification', 'user')).rejects.toThrow('push submissions failed');
    expect(db.pushDelivery.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ status: 'FAILED' }) }));
  });
  it('submits an allowed Web Push subscription without Firebase credentials', async () => {
    const db = database();
    db.pushDevice.findMany.mockResolvedValue([{ id: 'device', provider: 'WEB_PUSH', encryptedData: encrypt(JSON.stringify({ endpoint: 'https://web.push.apple.com/device', keys: { p256dh: 'key', auth: 'auth' } })) }] as never);
    const webConfig = { get: (name: string) => ({ PUSH_NOTIFICATIONS_ENABLED: true, PUSH_DEVICE_ENCRYPTION_KEY: key, WEB_PUSH_VAPID_PUBLIC_KEY: 'public', WEB_PUSH_VAPID_PRIVATE_KEY: 'private', WEB_PUSH_VAPID_SUBJECT: 'mailto:test@example.com' })[name] };
    sendWeb.mockResolvedValue({ statusCode: 201 });
    await new PushDeliveryService(db as never, webConfig as never).deliver('notification', 'user');
    expect(sendWeb).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });
});
