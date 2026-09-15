import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KycStatus } from '@prisma/client';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { PrismaService } from '../common/database/prisma.service';
import { ConfirmPhoneVerificationRequest, SendPhoneVerificationRequest, SubmitNinRequest } from './dto/user.schemas';
import { NimcVerificationService } from './nimc-verification.service';

@Injectable()
export class KycService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly nimcVerificationService: NimcVerificationService,
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

    const provider = await this.nimcVerificationService.submit(input.nin, user.phone);
    const now = new Date();
    return this.prisma.kycProfile.upsert({
      where: { userId },
      create: {
        userId,
        ninCiphertext: this.encrypt(input.nin),
        ninLast4: input.nin.slice(-4),
        ninStatus: KycStatus.PENDING,
        phoneStatus: KycStatus.VERIFIED,
        status: KycStatus.PENDING,
        providerReference: provider.providerReference,
        submittedAt: now,
      },
      update: {
        ninCiphertext: this.encrypt(input.nin),
        ninLast4: input.nin.slice(-4),
        ninStatus: KycStatus.PENDING,
        status: KycStatus.PENDING,
        providerReference: provider.providerReference,
        submittedAt: now,
        rejectionReason: null,
      },
    });
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
}
