import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IdentityNameMatchStatus,
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
import { compareIdentityName } from './identity-name-match';

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
      },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!user.userRoles.some(({ role }) => publisherRoleCodes.has(role.code))) {
      throw new ForbiddenException('Only landlord or agent accounts can complete publisher verification');
    }
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException('Verify your email address before verifying your publisher account');
    }
    // EasyOnboard bills completed steps even when a person abandons the flow.
    // Serialising starts per user ensures a double-click, retrying browser, or
    // second device cannot replace a live Dojah reference with a billable new
    // session. PostgreSQL advisory locks are transaction-scoped and leave no
    // persistent lock behind if the request fails.
    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`publisher-verification:${userId}`}))`;
      const existing = await tx.publisherVerification.findUnique({
        where: { userId },
        select: this.statusSelect,
      });
      if (existing?.status === PublisherVerificationStatus.VERIFIED) {
        throw new ConflictException('Your publisher identity is already verified');
      }
      if (existing?.status === PublisherVerificationStatus.PENDING && existing.providerReference) {
        if (existing.method !== input.method) {
          throw new ConflictException(`Resume the pending ${existing.method} verification before choosing ${input.method}.`);
        }
        return { verification: existing, resumed: true };
      }

      const now = new Date();
      const providerReference = `sr-publisher-${randomUUID().replace(/-/g, '')}`;
      const verification = await tx.publisherVerification.upsert({
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
          nameMatchStatus: IdentityNameMatchStatus.NOT_CHECKED,
          nameMatchReason: null,
          failureReason: null,
          requestedAt: now,
          completedAt: null,
          verifiedAt: null,
        },
        select: this.statusSelect,
      });
      await tx.publisherVerificationAttempt.create({
        data: {
          verificationId: verification.id,
          userId,
          method: input.method,
          status: PublisherVerificationStatus.PENDING,
          providerReference,
          providerStatus: 'Ongoing',
          requestedAt: now,
        },
      });
      return { verification, resumed: false };
    });
    const verification = outcome.verification;
    await this.audit.record({
      actorUserId: userId,
      action: outcome.resumed ? 'publisher_verification.resume_requested' : 'publisher_verification.started',
      entityType: 'publisher_verification',
      entityId: verification.id,
      metadata: { method: verification.method, provider: 'DOJAH', reusedProviderReference: outcome.resumed },
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
    if (verification) {
      const providerResult = this.dojah.parseHostedVerification(event, verification.providerReference ?? undefined);
      await this.applyProviderResult(verification, providerResult, 'webhook');
      return { received: true, matched: true };
    }
    const historicalAttempt = await this.prisma.publisherVerificationAttempt.findUnique({
      where: { providerReference: event.reference_id },
      include: { verification: { select: this.statusSelect } },
    });
    if (!historicalAttempt) return { received: true, matched: false };
    const providerResult = this.dojah.parseHostedVerification(event, historicalAttempt.providerReference);
    await this.applyProviderResult(historicalAttempt.verification, providerResult, 'webhook');
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
    const providerPassed = provider.passed && methodMatches;
    const account = await this.prisma.user.findUnique({
      where: { id: verification.userId },
      select: { firstName: true, lastName: true },
    });
    if (!account) throw new NotFoundException('Publisher account not found');
    const nameMatch = providerPassed
      ? compareIdentityName(account, provider.identityName)
      : { status: IdentityNameMatchStatus.NOT_CHECKED, reason: null };
    const verified = providerPassed && nameMatch.status === IdentityNameMatchStatus.MATCHED;
    const underReview = providerPassed && !verified;
    const completed = provider.completed || provider.terminal;
    const nextStatus = verified
      ? PublisherVerificationStatus.VERIFIED
      : underReview
        ? PublisherVerificationStatus.UNDER_REVIEW
      : completed
        ? (provider.providerStatus.toLowerCase() === 'failed' || provider.providerStatus.toLowerCase() === 'abandoned'
          ? PublisherVerificationStatus.FAILED
          : PublisherVerificationStatus.REJECTED)
        : PublisherVerificationStatus.PENDING;
    const mismatchReason = provider.method && !methodMatches
      ? `Complete the ${verification.method ?? 'selected'} method you chose before opening Dojah.`
      : null;
    const failureReason = verified ? null : mismatchReason ?? nameMatch.reason ?? provider.reason;
    const now = new Date();
    await this.prisma.publisherVerificationAttempt.updateMany({
      where: { verificationId: verification.id, providerReference: provider.referenceId },
      data: {
        status: nextStatus,
        providerVerificationType: provider.method,
        providerStatus: provider.providerStatus,
        livenessVerified: provider.livenessVerified,
        nameMatchStatus: nameMatch.status,
        nameMatchReason: nameMatch.reason,
        failureReason,
        completedAt: completed ? now : null,
        verifiedAt: verified ? now : null,
      },
    });
    // A terminal retry may legitimately have started a newer reference. The
    // older provider callback is retained on its attempt, but cannot regain or
    // revoke access by changing the current verification aggregate.
    if (verification.providerReference !== provider.referenceId) {
      await this.audit.record({
        actorUserId: verification.userId,
        action: 'publisher_verification.stale_attempt_reconciled',
        entityType: 'publisher_verification',
        entityId: verification.id,
        metadata: { source, providerReference: provider.referenceId, status: nextStatus },
      });
      return this.serialize(verification);
    }
    const updated = await this.prisma.publisherVerification.update({
      where: { id: verification.id },
      data: {
        status: nextStatus,
        providerVerificationType: provider.method,
        providerStatus: provider.providerStatus,
        livenessVerified: provider.livenessVerified,
        nameMatchStatus: nameMatch.status,
        nameMatchReason: nameMatch.reason,
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
          nameMatchStatus: nameMatch.status,
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
      nameMatchStatus: verification.nameMatchStatus,
      nameMatchReason: verification.nameMatchReason,
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
      nameMatchStatus: IdentityNameMatchStatus.NOT_CHECKED,
      nameMatchReason: null,
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
    nameMatchStatus: true,
    nameMatchReason: true,
    failureReason: true,
    requestedAt: true,
    completedAt: true,
    verifiedAt: true,
    createdAt: true,
    updatedAt: true,
  } as const;
}
