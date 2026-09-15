import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KycStatus } from '@prisma/client';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'crypto';
import { AuditService } from '../common/database/audit.service';
import { PrismaService } from '../common/database/prisma.service';
import {
  ConfirmPhoneVerificationRequest,
  SendPhoneVerificationRequest,
  SubmitNinRequest,
} from './dto/user.schemas';
import { DojahVerificationService, type DojahNinLookup } from './dojah-verification.service';

@Injectable()
export class KycService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly dojahVerificationService: DojahVerificationService,
    private readonly audit: AuditService,
  ) {}

  async sendPhoneChallenge(userId: string, input: SendPhoneVerificationRequest) {
    const code = String(Math.floor(100_000 + Math.random() * 900_000));
    const now = new Date();
    const challenge = await this.prisma.$transaction(async (transaction) => {
      await transaction.phoneVerificationChallenge.updateMany({
        where: { userId, consumedAt: null },
        data: { consumedAt: now },
      });
      await transaction.user.update({ where: { id: userId }, data: { phone: input.phone } });
      await transaction.kycProfile.upsert({
        where: { userId },
        create: { userId, phoneStatus: KycStatus.PENDING, status: KycStatus.PENDING },
        update: { phoneStatus: KycStatus.PENDING, status: KycStatus.PENDING },
      });
      return transaction.phoneVerificationChallenge.create({
        data: {
          userId,
          phone: input.phone,
          codeHash: this.hashCode(code),
          expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
        },
        select: { id: true, expiresAt: true },
      });
    });

    return {
      ...challenge,
      ...(this.configService.get<string>('NODE_ENV') === 'development' ? { developmentCode: code } : {}),
    };
  }

  async confirmPhoneChallenge(userId: string, input: ConfirmPhoneVerificationRequest) {
    const now = new Date();
    return this.prisma.$transaction(async (transaction) => {
      const challenge = await transaction.phoneVerificationChallenge.findFirst({
        where: { id: input.challengeId, userId },
      });
      if (!challenge || challenge.consumedAt || challenge.expiresAt <= now || challenge.attempts >= 5) {
        throw new BadRequestException('Phone verification challenge is invalid or expired');
      }
      if (this.hashCode(input.code) !== challenge.codeHash) {
        await transaction.phoneVerificationChallenge.update({
          where: { id: challenge.id },
          data: { attempts: { increment: 1 } },
        });
        throw new BadRequestException('Verification code is invalid');
      }
      await transaction.phoneVerificationChallenge.update({ where: { id: challenge.id }, data: { consumedAt: now } });
      await transaction.user.update({ where: { id: userId }, data: { phone: challenge.phone, phoneVerifiedAt: now } });
      return transaction.kycProfile.upsert({
        where: { userId },
        create: { userId, phoneStatus: KycStatus.VERIFIED, status: KycStatus.PENDING },
        update: { phoneStatus: KycStatus.VERIFIED },
      });
    });
  }

  async submitNin(userId: string, input: SubmitNinRequest) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { kyc: true } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (!user.phone || !user.phoneVerifiedAt || user.kyc?.phoneStatus !== KycStatus.VERIFIED) {
      throw new BadRequestException('Verify your phone number before submitting your NIN');
    }
    if (user.kyc?.status === KycStatus.VERIFIED) {
      throw new BadRequestException('Your identity has already been verified by Dojah');
    }

    const now = new Date();
    const providerReference = `dojah_${randomUUID()}`;
    await this.prisma.kycProfile.upsert({
      where: { userId },
      create: {
        userId,
        ninCiphertext: this.encrypt(input.nin),
        ninLast4: input.nin.slice(-4),
        ninStatus: KycStatus.PENDING,
        phoneStatus: KycStatus.VERIFIED,
        status: KycStatus.PENDING,
        providerReference,
        submittedAt: now,
      },
      update: {
        ninCiphertext: this.encrypt(input.nin),
        ninLast4: input.nin.slice(-4),
        ninStatus: KycStatus.PENDING,
        phoneStatus: KycStatus.VERIFIED,
        status: KycStatus.PENDING,
        providerReference,
        submittedAt: now,
        verifiedAt: null,
        rejectionReason: null,
      },
    });
    await this.audit.record({ actorUserId: userId, action: 'kyc.dojah_started', entityType: 'kyc_profile', entityId: userId });

    let verification: DojahNinLookup;
    try {
      verification = await this.dojahVerificationService.verifyNin(input.nin);
    } catch (error) {
      await this.audit.record({
        actorUserId: userId,
        action: 'kyc.dojah_confirmation_failed',
        entityType: 'kyc_profile',
        entityId: userId,
      });
      throw error;
    }

    const phoneMatchesNimcRecord = verification.verified && this.phoneNumbersMatch(user.phone, verification.phoneNumber);
    const verified = verification.verified && phoneMatchesNimcRecord;
    const status = verified ? KycStatus.VERIFIED : KycStatus.REJECTED;
    const rejectionReason = !verification.verified
      ? verification.reason
      : 'The phone number returned by Dojah did not match the verified phone number.';
    const result = await this.prisma.kycProfile.updateMany({
      where: {
        userId,
        providerReference,
        phoneStatus: KycStatus.VERIFIED,
        status: { in: [KycStatus.PENDING, KycStatus.UNDER_REVIEW] },
      },
      data: verified
        ? {
            status: KycStatus.VERIFIED,
            ninStatus: KycStatus.VERIFIED,
            verifiedAt: new Date(),
            rejectionReason: null,
          }
        : {
            status: KycStatus.REJECTED,
            ninStatus: KycStatus.REJECTED,
            verifiedAt: null,
            phoneStatus: verification.verified ? KycStatus.REJECTED : KycStatus.VERIFIED,
            rejectionReason,
          },
    });
    if (result.count === 0) {
      return { status: KycStatus.PENDING, verified: false, provider: 'DOJAH', superseded: true };
    }

    await this.audit.record({
      actorUserId: userId,
      action: verified ? 'kyc.verified_via_dojah' : 'kyc.dojah_verification_rejected',
      entityType: 'kyc_profile',
      entityId: userId,
    });
    return { status, verified, provider: 'DOJAH', providerReference };
  }

  async assertVerified(userId: string): Promise<void> {
    const kyc = await this.prisma.kycProfile.findUnique({ where: { userId } });
    if (kyc?.status !== KycStatus.VERIFIED) {
      throw new ForbiddenException('Complete KYC verification before performing this action');
    }
  }

  private hashCode(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private encrypt(value: string): string {
    const key = createHash('sha256')
      .update(this.configService.getOrThrow<string>('FIELD_ENCRYPTION_SECRET'))
      .digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64url');
  }

  decrypt(ciphertext: string): string {
    const buffer = Buffer.from(ciphertext, 'base64url');
    const key = createHash('sha256')
      .update(this.configService.getOrThrow<string>('FIELD_ENCRYPTION_SECRET'))
      .digest();
    const decipher = createDecipheriv('aes-256-gcm', key, buffer.subarray(0, 12));
    decipher.setAuthTag(buffer.subarray(12, 28));
    return Buffer.concat([decipher.update(buffer.subarray(28)), decipher.final()]).toString('utf8');
  }

  private phoneNumbersMatch(accountPhone: string, nimcPhone: string): boolean {
    const normalize = (phone: string): string | undefined => {
      const digits = phone.replace(/\D/g, '');
      if (/^0\d{10}$/.test(digits)) return digits;
      if (/^234\d{10}$/.test(digits)) return `0${digits.slice(3)}`;
      return undefined;
    };
    const account = normalize(accountPhone);
    const nimc = normalize(nimcPhone);
    return Boolean(account && nimc && account === nimc);
  }
}
