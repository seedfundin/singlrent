import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PublisherVerification,
  PublisherVerificationMethod,
  PublisherVerificationStatus,
  RoleCode,
} from '@prisma/client';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { AuditService } from '../common/database/audit.service';
import { PrismaService } from '../common/database/prisma.service';
import { DojahHostedVerification, DojahVerificationService } from './dojah-verification.service';
import { DojahWidgetWebhookRequest, StartPublisherVerificationRequest } from './dto/user.schemas';

const publisherRoleCodes = new Set<RoleCode>([RoleCode.LANDLORD, RoleCode.AGENT]);

@Injectable()
export class PublisherVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly dojah: DojahVerificationService,
    private readonly audit: AuditService,
  ) {}

  async start(userId: string, input: StartPublisherVerificationRequest) {
    this.dojah.assertHostedPublisherVerificationConfigured();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        emailVerifiedAt: true,
        userRoles: { select: { role: { select: { code: true } } } },
        publisherVerification: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!user.userRoles.some(({ role }) => publisherRoleCodes.has(role.code))) {
      throw new ForbiddenException('Only landlord or agent accounts can complete publisher verification');
    }
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException('Verify your email address before verifying your publisher account');
    }
    if (user.publisherVerification?.status === PublisherVerificationStatus.VERIFIED) {
      throw new ConflictException('Your publisher identity is already verified');
    }

    const now = new Date();
    const providerReference = `sr-publisher-${randomUUID().replace(/-/g, '')}`;
    const verification = await this.prisma.publisherVerification.upsert({
      where: { userId },
      create: {
        userId,
        method: input.method,
        status: PublisherVerificationStatus.PENDING,
        providerReference,
        providerStatus: 'Ongoing',
        requestedAt: now,
      },
      update: {
        method: input.method,
        status: PublisherVerificationStatus.PENDING,
        providerReference,
        providerVerificationType: null,
        providerStatus: 'Ongoing',
        livenessVerified: false,
        failureReason: null,
        requestedAt: now,
        completedAt: null,
        verifiedAt: null,
      },
      select: this.statusSelect,
    });
    await this.audit.record({
      actorUserId: userId,
      action: 'publisher_verification.started',
      entityType: 'publisher_verification',
      entityId: verification.id,
      metadata: { method: input.method, provider: 'DOJAH' },
    });
    return this.serialize(verification);
  }

  async getStatus(userId: string) {
    const verification = await this.prisma.publisherVerification.findUnique({
      where: { userId },
      select: this.statusSelect,
    });
    return verification ? this.serialize(verification) : this.notStarted();
  }

  /**
   * The browser callback carries no decision. It only prompts this endpoint to
   * fetch the result using our server-only Dojah credentials.
   */
  async reconcile(userId: string, verificationId: string) {
    const verification = await this.prisma.publisherVerification.findFirst({
      where: { id: verificationId, userId },
      select: this.statusSelect,
    });
    if (!verification) throw new NotFoundException('Publisher verification session not found');
    if (!verification.providerReference) throw new ConflictException('Publisher verification has not been started');
    if (verification.status === PublisherVerificationStatus.VERIFIED) return this.serialize(verification);
    const providerResult = await this.dojah.getHostedVerification(verification.providerReference);
    return this.applyProviderResult(verification, providerResult, 'reconciled');
  }

  async handleWebhook(rawBody: Buffer, signature: string | undefined, signatureV2: string | undefined, event: DojahWidgetWebhookRequest) {
    this.assertWebhookSignature(rawBody, signature, signatureV2);
    const verification = await this.prisma.publisherVerification.findUnique({
      where: { providerReference: event.reference_id },
      select: this.statusSelect,
    });
    // A stale or unrelated Dojah delivery is acknowledged without leaking any
    // account information. It can never alter a publisher's access.
    if (!verification) return { received: true, matched: false };
    const providerResult = this.dojah.parseHostedVerification(event, verification.providerReference ?? undefined);
    await this.applyProviderResult(verification, providerResult, 'webhook');
    return { received: true, matched: true };
  }

  async assertVerifiedForListing(userId: string): Promise<void> {
    const verification = await this.prisma.publisherVerification.findUnique({
      where: { userId },
      select: { status: true, livenessVerified: true },
    });
    if (verification?.status !== PublisherVerificationStatus.VERIFIED || !verification.livenessVerified) {
      throw new ForbiddenException('Complete Dojah NIN or BVN verification with liveness before creating or submitting a listing');
    }
  }

  private async applyProviderResult(
    verification: PublisherVerification,
    provider: DojahHostedVerification,
    source: 'webhook' | 'reconciled',
  ) {
    const methodMatches = provider.method !== null && provider.method === verification.method;
    const verified = provider.passed && methodMatches;
    const completed = provider.completed || provider.terminal;
    const nextStatus = verified
      ? PublisherVerificationStatus.VERIFIED
      : completed
        ? (provider.providerStatus.toLowerCase() === 'failed' || provider.providerStatus.toLowerCase() === 'abandoned'
          ? PublisherVerificationStatus.FAILED
          : PublisherVerificationStatus.REJECTED)
        : PublisherVerificationStatus.PENDING;
    const mismatchReason = provider.method && !methodMatches
      ? `Complete the ${verification.method ?? 'selected'} method you chose before opening Dojah.`
      : null;
    const failureReason = verified ? null : mismatchReason ?? provider.reason;
    const now = new Date();
    const updated = await this.prisma.publisherVerification.update({
      where: { id: verification.id },
      data: {
        status: nextStatus,
        providerVerificationType: provider.method,
        providerStatus: provider.providerStatus,
        livenessVerified: provider.livenessVerified,
        failureReason,
        completedAt: completed ? now : null,
        verifiedAt: verified ? now : null,
      },
      select: this.statusSelect,
    });
    if (nextStatus !== PublisherVerificationStatus.PENDING) {
      await this.audit.record({
        actorUserId: verification.userId,
        action: verified ? 'publisher_verification.verified_via_dojah' : 'publisher_verification.finished_without_access',
        entityType: 'publisher_verification',
        entityId: verification.id,
        metadata: {
          source,
          method: verification.method,
          providerMethod: provider.method,
          providerStatus: provider.providerStatus,
          livenessVerified: provider.livenessVerified,
        },
      });
    }
    return this.serialize(updated);
  }

  private assertWebhookSignature(rawBody: Buffer, signature: string | undefined, signatureV2: string | undefined): void {
    const webhookSecret = this.configService.get<string>('DOJAH_WEBHOOK_SECRET');
    const apiSecret = this.configService.get<string>('DOJAH_SECRET_KEY');
    const v1Matches = webhookSecret && signature
      ? this.safeEqual(signature, createHmac('sha256', webhookSecret).update(rawBody).digest('hex'))
      : false;
    const v2Matches = apiSecret && signatureV2
      ? this.safeEqual(signatureV2, createHash('sha256').update(apiSecret).digest('hex'))
      : false;
    if (!v1Matches && !v2Matches) {
      throw new UnauthorizedException('Invalid Dojah webhook signature');
    }
  }

  private safeEqual(received: string, expected: string): boolean {
    if (!/^[a-f0-9]+$/i.test(received) || received.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(expected, 'hex'));
  }

  private serialize(verification: PublisherVerification) {
    return {
      id: verification.id,
      method: verification.method,
      status: verification.status,
      verified: verification.status === PublisherVerificationStatus.VERIFIED && verification.livenessVerified,
      provider: 'DOJAH' as const,
      providerReference: verification.providerReference,
      providerMethod: verification.providerVerificationType,
      providerStatus: verification.providerStatus,
      livenessVerified: verification.livenessVerified,
      failureReason: verification.failureReason,
      requestedAt: verification.requestedAt,
      completedAt: verification.completedAt,
      verifiedAt: verification.verifiedAt,
    };
  }

  private notStarted() {
    return {
      id: null,
      method: null,
      status: PublisherVerificationStatus.NOT_STARTED,
      verified: false,
      provider: 'DOJAH' as const,
      providerReference: null,
      providerMethod: null,
      providerStatus: null,
      livenessVerified: false,
      failureReason: null,
      requestedAt: null,
      completedAt: null,
      verifiedAt: null,
    };
  }

  private readonly statusSelect = {
    id: true,
    userId: true,
    method: true,
    status: true,
    providerReference: true,
    providerVerificationType: true,
    providerStatus: true,
    livenessVerified: true,
    failureReason: true,
    requestedAt: true,
    completedAt: true,
    verifiedAt: true,
    createdAt: true,
    updatedAt: true,
  } as const;
}
