import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createHash, randomBytes } from 'crypto';
import { PrismaService } from '../common/database/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class PushDevicesService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  async register(userId: string, input: { token: string; label?: string } | { provider: 'WEB_PUSH'; subscription: { endpoint: string; keys: { p256dh: string; auth: string } }; label?: string }) {
    const secret = this.config.get<string>('PUSH_DEVICE_ENCRYPTION_KEY');
    if (!this.config.get<boolean>('PUSH_NOTIFICATIONS_ENABLED') || !secret) {
      throw new ServiceUnavailableException('Browser notifications are not configured yet');
    }
    const web = 'subscription' in input;
    if (web && !isAllowedPushEndpoint(input.subscription.endpoint)) throw new BadRequestException('Unsupported push subscription endpoint');
    const credential = web ? JSON.stringify(input.subscription) : input.token;
    const credentialHash = createHash('sha256').update(web ? input.subscription.endpoint : input.token).digest('hex');
    const existing = await this.prisma.pushDevice.findUnique({ where: { credentialHash } });
    if (existing && existing.userId !== userId) throw new ConflictException('This browser is registered to another account. Sign out of that account first.');
    const iv = randomBytes(12);
    const key = createHash('sha256').update(secret).digest();
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(credential, 'utf8'), cipher.final()]);
    const encryptedData = [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
    const select = { id: true, provider: true, label: true, createdAt: true, lastSeenAt: true } as const;
    if (existing) {
      await this.prisma.pushDevice.updateMany({ where: { id: existing.id, userId }, data: { encryptedData, label: input.label, lastSeenAt: new Date() } });
      return this.prisma.pushDevice.findFirst({ where: { id: existing.id, userId }, select });
    }
    try {
      return await this.prisma.pushDevice.create({ data: { userId, provider: web ? 'WEB_PUSH' : 'FCM', credentialHash, encryptedData, label: input.label }, select });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('This browser is already registered. Please retry.');
      throw error;
    }
  }

  list(userId: string) {
    return this.prisma.pushDevice.findMany({ where: { userId }, select: { id: true, provider: true, label: true, createdAt: true, lastSeenAt: true }, orderBy: { lastSeenAt: 'desc' } });
  }

  async remove(userId: string, id: string) {
    await this.prisma.pushDevice.deleteMany({ where: { id, userId } });
  }
}

// Never let a caller cause the worker to POST to arbitrary internal addresses.
export function isAllowedPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const allowed = host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com' || host.endsWith('.push.apple.com') || host.endsWith('.notify.windows.com');
    return allowed && url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443');
  } catch { return false; }
}
