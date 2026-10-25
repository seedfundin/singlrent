import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { createDecipheriv, createHash } from 'crypto';
import { PrismaService } from '../common/database/prisma.service';
import * as webPush from 'web-push';
import { isAllowedPushEndpoint } from '../notifications/push-devices.service';

@Injectable()
export class PushDeliveryService {
  private readonly logger = new Logger(PushDeliveryService.name);
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  async deliver(notificationId: string, userId: string): Promise<void> {
    if (!this.config.get<boolean>('PUSH_NOTIFICATIONS_ENABLED')) return;
    const key = this.config.get<string>('PUSH_DEVICE_ENCRYPTION_KEY');
    const projectId = this.config.get<string>('FIREBASE_SERVER_PROJECT_ID');
    const clientEmail = this.config.get<string>('FIREBASE_CLIENT_EMAIL');
    const privateKey = this.config.get<string>('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n');
    if (!key) throw new Error('Push encryption configuration is incomplete');
    const notification = await this.prisma.notification.findFirst({ where: { id: notificationId, userId }, select: { id: true, type: true } });
    if (!notification) return;
    const preference = await this.prisma.notificationPreference.findUnique({ where: { userId_type_channel: { userId, type: notification.type, channel: 'PUSH' } } });
    if (preference?.enabled === false) return;
    const devices = await this.prisma.pushDevice.findMany({ where: { userId } });
    let retry = false;
    for (const device of devices) {
      const where = { notificationId_deviceId: { notificationId, deviceId: device.id } };
      const prior = await this.prisma.pushDelivery.findUnique({ where });
      if (prior?.status === 'ACCEPTED') continue;
      try {
        const [iv, tag, encrypted] = device.encryptedData.split('.');
        if (!iv || !tag || !encrypted) throw new Error('Invalid encrypted credential');
        const decipher = createDecipheriv('aes-256-gcm', createHash('sha256').update(key).digest(), Buffer.from(iv, 'base64url'));
        decipher.setAuthTag(Buffer.from(tag, 'base64url'));
        const token = Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
        // The generic payload avoids leaking private information to shared devices.
        if (device.provider === 'WEB_PUSH') {
          const subscription = JSON.parse(token) as webPush.PushSubscription;
          if (!isAllowedPushEndpoint(subscription.endpoint)) throw new Error('Invalid push endpoint');
          const publicKey = this.config.get<string>('WEB_PUSH_VAPID_PUBLIC_KEY');
          const privateVapid = this.config.get<string>('WEB_PUSH_VAPID_PRIVATE_KEY');
          const subject = this.config.get<string>('WEB_PUSH_VAPID_SUBJECT');
          if (!publicKey || !privateVapid || !subject) throw new Error('Web Push configuration is incomplete');
          await webPush.sendNotification(subscription, JSON.stringify({ notificationId, type: notification.type }), { vapidDetails: { subject, publicKey, privateKey: privateVapid }, TTL: 3600, timeout: 10000 });
        } else if (device.provider === 'FCM' || !device.provider) {
          if (!projectId || !clientEmail || !privateKey) throw new Error('Firebase configuration is incomplete');
          const app = getApps().find((candidate) => candidate.name === 'singlerent-push') ?? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId }, 'singlerent-push');
          await getMessaging(app).send({ token, data: { type: notification.type, notificationId } });
        } else throw new Error('Unsupported push provider');
        await this.prisma.pushDelivery.upsert({ where, create: { notificationId, deviceId: device.id, status: 'ACCEPTED', attempts: 1 }, update: { status: 'ACCEPTED', attempts: { increment: 1 } } });
      } catch (error) {
        const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'unknown';
        const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error ? Number(error.statusCode) : 0;
        if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token' || statusCode === 404 || statusCode === 410) {
          await this.prisma.pushDelivery.upsert({ where, create: { notificationId, deviceId: device.id, status: 'INVALID', attempts: 1 }, update: { status: 'INVALID', attempts: { increment: 1 } } });
          await this.prisma.pushDevice.deleteMany({ where: { id: device.id, userId } });
          continue;
        }
        await this.prisma.pushDelivery.upsert({ where, create: { notificationId, deviceId: device.id, status: 'FAILED', attempts: 1 }, update: { status: 'FAILED', attempts: { increment: 1 } } });
        this.logger.warn(`Push submission failed (${code}).`);
        retry = true;
      }
    }
    if (retry) throw new Error('One or more push submissions failed');
  }
}
