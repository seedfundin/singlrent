import { createDecipheriv, createHash } from 'crypto';
import { isAllowedPushEndpoint, PushDevicesService } from './push-devices.service';

describe('push device registration', () => {
  const secret = 'test-encryption-secret-at-least-32-characters';
  const token = 'private-browser-token';
  const config = { get: (key: string) => key === 'PUSH_NOTIFICATIONS_ENABLED' ? true : secret };
  it('encrypts the credential and never returns it', async () => {
    let saved: { encryptedData: string; userId: string } | undefined;
    const prisma = { pushDevice: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn(async ({ data }: { data: { encryptedData: string; userId: string } }) => { saved = data; return { id: 'device', provider: 'FCM' }; }) } };
    const service = new PushDevicesService(prisma as never, config as never);
    const result = await service.register('user', { token });
    expect(JSON.stringify(result)).not.toContain(token);
    expect(saved?.userId).toBe('user');
    expect(saved?.encryptedData).not.toContain(token);
    const [iv, tag, ciphertext] = saved!.encryptedData.split('.');
    const decipher = createDecipheriv('aes-256-gcm', createHash('sha256').update(secret).digest(), Buffer.from(iv!, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag!, 'base64url'));
    expect(Buffer.concat([decipher.update(Buffer.from(ciphertext!, 'base64url')), decipher.final()]).toString()).toBe(token);
  });
  it('does not transfer a browser from another account', async () => {
    const prisma = { pushDevice: { findUnique: jest.fn().mockResolvedValue({ userId: 'other' }), create: jest.fn(), updateMany: jest.fn() } };
    const service = new PushDevicesService(prisma as never, config as never);
    await expect(service.register('user', { token })).rejects.toThrow('another account');
    expect(prisma.pushDevice.create).not.toHaveBeenCalled();
    expect(prisma.pushDevice.updateMany).not.toHaveBeenCalled();
  });
  it('leaves registration unavailable when push is disabled', async () => {
    const prisma = { pushDevice: { findUnique: jest.fn() } };
    const service = new PushDevicesService(prisma as never, { get: () => undefined } as never);
    await expect(service.register('user', { token })).rejects.toThrow('not configured');
    expect(prisma.pushDevice.findUnique).not.toHaveBeenCalled();
  });
  it('restricts device removal to the signed-in owner', async () => {
    const prisma = { pushDevice: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) } };
    const service = new PushDevicesService(prisma as never, config as never);
    await service.remove('user', 'device');
    expect(prisma.pushDevice.deleteMany).toHaveBeenCalledWith({ where: { id: 'device', userId: 'user' } });
  });
  it('only accepts trusted HTTPS push endpoints', () => {
    expect(isAllowedPushEndpoint('https://web.push.apple.com/3/device')).toBe(true);
    expect(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/device')).toBe(true);
    expect(isAllowedPushEndpoint('http://web.push.apple.com/3/device')).toBe(false);
    expect(isAllowedPushEndpoint('https://web.push.apple.com.attacker.example/')).toBe(false);
    expect(isAllowedPushEndpoint('https://127.0.0.1/private')).toBe(false);
    expect(isAllowedPushEndpoint('https://web.push.apple.com:8443/')).toBe(false);
  });
});
