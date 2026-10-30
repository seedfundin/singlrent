import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  IdentityNameMatchStatus,
  KycStatus,
  LedgerAccountCode,
  LedgerEntryType,
  Prisma,
  PublisherVerificationMethod,
  VerificationServiceChargeSource,
  VerificationServiceChargeStatus,
} from "@prisma/client";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
} from "crypto";
import { AuditService } from "../common/database/audit.service";
import { PrismaService } from "../common/database/prisma.service";
import { PaystackService } from "../integrations/paystack.service";
import { SmsDeliveryService } from "../common/sms/sms-delivery.service";
import {
  ConfirmPhoneVerificationRequest,
  SendPhoneVerificationRequest,
  SubmitIdentityRequest,
  SubmitNinRequest,
} from "./dto/user.schemas";
import {
  DojahVerificationService,
  type DojahIdentityLookup,
} from "./dojah-verification.service";
import { compareIdentityName } from "./identity-name-match";

@Injectable()
export class KycService {
  static readonly SERVICE_FEE_KOBO = 10_000n;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly dojahVerificationService: DojahVerificationService,
    private readonly paystack: PaystackService,
    private readonly audit: AuditService,
    private readonly smsDelivery: SmsDeliveryService,
  ) {}

  async sendPhoneChallenge(
    userId: string,
    input: SendPhoneVerificationRequest,
    throttle = false,
  ) {
    const code = String(randomInt(100_000, 1_000_000));
    const now = new Date();
    const challenge = await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`phone-verification:${userId}`}))`;
      if (throttle) {
        const existing = await transaction.phoneVerificationChallenge.findFirst(
          {
            where: {
              userId,
              phone: input.phone,
              consumedAt: null,
              expiresAt: { gt: now },
              createdAt: { gte: new Date(now.getTime() - 60_000) },
            },
            select: { id: true, expiresAt: true },
          },
        );
        if (existing) return { ...existing, send: false };
      }
      await transaction.phoneVerificationChallenge.updateMany({
        where: { userId, consumedAt: null },
        data: { consumedAt: now },
      });
      await transaction.user.update({
        where: { id: userId },
        data: { phone: input.phone, phoneVerifiedAt: null },
      });
      await transaction.kycProfile.upsert({
        where: { userId },
        create: {
          userId,
          phoneStatus: KycStatus.PENDING,
          status: KycStatus.PENDING,
        },
        update: { phoneStatus: KycStatus.PENDING, status: KycStatus.PENDING },
      });
      const created = await transaction.phoneVerificationChallenge.create({
        data: {
          userId,
          phone: input.phone,
          codeHash: this.hashCode(code),
          expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
        },
        select: { id: true, expiresAt: true },
      });
      return { ...created, send: true };
    });

    if (challenge.send) {
      try {
        const delivery = await this.smsDelivery.sendOtp(
          input.phone,
          code,
          "phone verification",
        );
        if (
          !delivery.delivered &&
          this.configService.get<string>("NODE_ENV") !== "development"
        ) {
          throw new BadRequestException("SMS delivery is not configured");
        }
      } catch (error) {
        await this.prisma.phoneVerificationChallenge.updateMany({
          where: { id: challenge.id, consumedAt: null },
          data: { consumedAt: new Date() },
        });
        throw error;
      }
    }

    return {
      ...challenge,
      ...(challenge.send &&
      this.configService.get<string>("NODE_ENV") === "development"
        ? { developmentCode: code }
        : {}),
    };
  }

  async confirmPhoneChallenge(
    userId: string,
    input: ConfirmPhoneVerificationRequest,
  ) {
    const now = new Date();
    return this.prisma.$transaction(async (transaction) => {
      const challenge = await transaction.phoneVerificationChallenge.findFirst({
        where: { id: input.challengeId, userId },
      });
      if (
        !challenge ||
        challenge.consumedAt ||
        challenge.expiresAt <= now ||
        challenge.attempts >= 5
      ) {
        throw new BadRequestException(
          "Phone verification challenge is invalid or expired",
        );
      }
      if (this.hashCode(input.code) !== challenge.codeHash) {
        await transaction.phoneVerificationChallenge.update({
          where: { id: challenge.id },
          data: { attempts: { increment: 1 } },
        });
        throw new BadRequestException("Verification code is invalid");
      }
      await transaction.phoneVerificationChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: now },
      });
      await transaction.user.update({
        where: { id: userId },
        data: { phone: challenge.phone, phoneVerifiedAt: now },
      });
      return transaction.kycProfile.upsert({
        where: { userId },
        create: {
          userId,
          phoneStatus: KycStatus.VERIFIED,
          status: KycStatus.PENDING,
        },
        update: { phoneStatus: KycStatus.VERIFIED },
      });
    });
  }

  async submitNin(userId: string, input: SubmitNinRequest) {
    void userId;
    void input;
    throw new BadRequestException(
      "Start NIN verification from a payment or payout. Each Dojah check has a ₦100 service fee.",
    );
  }

  async initializeTenantVerification(
    userId: string,
    input: SubmitIdentityRequest,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { kyc: true },
    });
    if (!user) throw new NotFoundException("User not found");
    this.assertPhoneVerified(user.phoneVerifiedAt);
    if (!user.email) {
      throw new BadRequestException(
        "Add a contact email address in your profile before paying the Dojah verification service fee.",
      );
    }
    if (user.kyc?.status === KycStatus.VERIFIED) {
      throw new ConflictException(
        "Your identity is already verified; no service fee is required",
      );
    }
    if (user.kyc?.status === KycStatus.UNDER_REVIEW) {
      throw new ConflictException(
        "Your Dojah identity record is already awaiting an administrator name review. Do not start another paid attempt.",
      );
    }

    const reference = `srk_${randomUUID().replace(/-/g, "")}`;
    const charge = await this.prisma.verificationServiceCharge.create({
      data: {
        userId,
        source: VerificationServiceChargeSource.TENANT_PAYMENT,
        amountKobo: KycService.SERVICE_FEE_KOBO,
        paystackReference: reference,
        identityMethod: input.method as PublisherVerificationMethod,
        ninCiphertext: this.encrypt(input.identifier),
        ninLast4: input.identifier.slice(-4),
      },
      select: {
        id: true,
        amountKobo: true,
        currency: true,
        paystackReference: true,
        status: true,
      },
    });
    try {
      const initialized = await this.paystack.initializeTransaction({
        email: user.email,
        amountKobo: KycService.SERVICE_FEE_KOBO,
        reference,
      });
      await this.audit.record({
        actorUserId: userId,
        action: "kyc.service_fee_initialized",
        entityType: "verification_service_charge",
        entityId: charge.id,
        metadata: { source: VerificationServiceChargeSource.TENANT_PAYMENT },
      });
      return {
        chargeId: charge.id,
        amountKobo: charge.amountKobo,
        currency: charge.currency,
        reference,
        authorizationUrl: initialized.authorizationUrl,
        accessCode: initialized.accessCode,
        status: charge.status,
      };
    } catch (error) {
      await this.prisma.verificationServiceCharge.update({
        where: { id: charge.id },
        data: {
          status: VerificationServiceChargeStatus.FAILED,
          failureReason: "Unable to initialize service-fee payment",
        },
      });
      throw error;
    }
  }

  async processTenantVerificationCharge(
    reference: string,
    amountKobo: bigint,
    currency: string,
    payload: Prisma.InputJsonValue,
  ): Promise<boolean> {
    const charge = await this.prisma.verificationServiceCharge.findUnique({
      where: { paystackReference: reference },
    });
    if (!charge) return false;
    if (charge.currency !== currency || charge.amountKobo !== amountKobo) {
      await this.prisma.verificationServiceCharge.update({
        where: { id: charge.id },
        data: {
          status: VerificationServiceChargeStatus.FAILED,
          failureReason:
            "Payment amount or currency did not match the service-fee record",
        },
      });
      throw new ConflictException(
        "Payment amount or currency does not match the service-fee record",
      );
    }
    if (
      charge.status === VerificationServiceChargeStatus.VERIFIED ||
      charge.status === VerificationServiceChargeStatus.REJECTED
    ) {
      return true;
    }
    const claimed = await this.prisma.verificationServiceCharge.updateMany({
      where: {
        id: charge.id,
        status: VerificationServiceChargeStatus.PENDING_PAYMENT,
      },
      data: {
        status: VerificationServiceChargeStatus.PROCESSING,
        paidAt: new Date(),
        providerPayload: payload,
      },
    });
    if (claimed.count !== 1) return true;
    await this.verifyChargeWithDojah(charge.id);
    return true;
  }

  async verifyTenantServiceChargeForUser(userId: string, chargeId: string) {
    const charge = await this.prisma.verificationServiceCharge.findFirst({
      where: {
        id: chargeId,
        userId,
        source: VerificationServiceChargeSource.TENANT_PAYMENT,
      },
    });
    if (!charge?.paystackReference)
      throw new NotFoundException("Verification service charge not found");
    const verification = await this.paystack.verifyTransaction(
      charge.paystackReference,
    );
    if (verification.status !== "success") {
      throw new ConflictException(
        "We have not yet confirmed the ₦100 verification service fee",
      );
    }
    await this.processTenantVerificationCharge(
      charge.paystackReference,
      verification.amountKobo,
      verification.currency,
      verification.payload as Prisma.InputJsonValue,
    );
    return this.getVerificationStatus(userId);
  }

  async verifyPayoutWithdrawal(
    userId: string,
    payoutId: string,
    input: SubmitIdentityRequest,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { kyc: true },
    });
    if (!user) throw new NotFoundException("User not found");
    this.assertPhoneVerified(user.phoneVerifiedAt);
    if (user.kyc?.status === KycStatus.VERIFIED) {
      return { verified: true, alreadyVerified: true };
    }
    if (user.kyc?.status === KycStatus.UNDER_REVIEW) {
      return { verified: false, underReview: true };
    }

    const charge = await this.prisma.$transaction(async (transaction) => {
      const payout = await transaction.payout.findFirst({
        where: { id: payoutId, recipientUserId: userId, status: "PENDING" },
      });
      if (!payout)
        throw new NotFoundException("A pending payout was not found");
      if (
        payout.amountKobo - payout.serviceFeeKobo <
        KycService.SERVICE_FEE_KOBO
      ) {
        throw new ConflictException(
          "This payout is below the ₦100 verification service fee",
        );
      }
      await transaction.payout.update({
        where: { id: payout.id },
        data: { serviceFeeKobo: { increment: KycService.SERVICE_FEE_KOBO } },
      });
      const debitAccount =
        payout.kind === "LANDLORD"
          ? LedgerAccountCode.LANDLORD_PAYABLE
          : LedgerAccountCode.AGENT_PAYABLE;
      await transaction.ledgerEntry.create({
        data: {
          paymentId: payout.paymentId,
          entryType: LedgerEntryType.KYC_SERVICE_FEE_ALLOCATED,
          debitAccount,
          creditAccount: LedgerAccountCode.PLATFORM_REVENUE,
          amountKobo: KycService.SERVICE_FEE_KOBO,
          idempotencyKey: `verification-service-charge:${payout.id}:${randomUUID()}`,
          metadata: {
            payoutId: payout.id,
            source: VerificationServiceChargeSource.PAYOUT_DEDUCTION,
          },
        },
      });
      return transaction.verificationServiceCharge.create({
        data: {
          userId,
          payoutId: payout.id,
          source: VerificationServiceChargeSource.PAYOUT_DEDUCTION,
          status: VerificationServiceChargeStatus.PROCESSING,
          amountKobo: KycService.SERVICE_FEE_KOBO,
          providerReference: `dojah_${randomUUID()}`,
          identityMethod: input.method as PublisherVerificationMethod,
          ninCiphertext: this.encrypt(input.identifier),
          ninLast4: input.identifier.slice(-4),
          paidAt: new Date(),
        },
      });
    });
    return this.verifyChargeWithDojah(charge.id);
  }

  async getVerificationStatus(userId: string) {
    const [kyc, latestCharge] = await this.prisma.$transaction([
      this.prisma.kycProfile.findUnique({ where: { userId } }),
      this.prisma.verificationServiceCharge.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          source: true,
          status: true,
          amountKobo: true,
          currency: true,
          failureReason: true,
          createdAt: true,
          processedAt: true,
        },
      }),
    ]);
    return {
      status: kyc?.status ?? KycStatus.NOT_STARTED,
      verified: kyc?.status === KycStatus.VERIFIED,
      underReview: kyc?.status === KycStatus.UNDER_REVIEW,
      identityMethod: kyc?.identityMethod ?? null,
      nameMatchReason: kyc?.nameMatchReason ?? null,
      latestServiceCharge: latestCharge,
    };
  }

  async assertVerified(userId: string): Promise<void> {
    const kyc = await this.prisma.kycProfile.findUnique({ where: { userId } });
    if (kyc?.status !== KycStatus.VERIFIED) {
      throw new ForbiddenException(
        "Complete KYC verification before performing this action",
      );
    }
  }

  private async verifyChargeWithDojah(chargeId: string) {
    const charge = await this.prisma.verificationServiceCharge.findUnique({
      where: { id: chargeId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    if (!charge)
      throw new NotFoundException("Verification service charge not found");
    const providerReference =
      charge.providerReference ?? `dojah_${randomUUID()}`;
    const nin = this.decrypt(charge.ninCiphertext);
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.verificationServiceCharge.update({
        where: { id: charge.id },
        data: {
          providerReference,
          status: VerificationServiceChargeStatus.PROCESSING,
        },
      });
      await transaction.kycProfile.upsert({
        where: { userId: charge.userId },
        create: {
          userId: charge.userId,
          ninCiphertext: charge.ninCiphertext,
          ninLast4: charge.ninLast4,
          identityMethod: charge.identityMethod,
          ninStatus: KycStatus.PENDING,
          status: KycStatus.PENDING,
          nameMatchStatus: IdentityNameMatchStatus.NOT_CHECKED,
          nameMatchReason: null,
          providerReference,
          submittedAt: now,
        },
        update: {
          ninCiphertext: charge.ninCiphertext,
          ninLast4: charge.ninLast4,
          identityMethod: charge.identityMethod,
          ninStatus: KycStatus.PENDING,
          status: KycStatus.PENDING,
          nameMatchStatus: IdentityNameMatchStatus.NOT_CHECKED,
          nameMatchReason: null,
          providerReference,
          submittedAt: now,
          verifiedAt: null,
          rejectionReason: null,
        },
      });
    });
    await this.audit.record({
      actorUserId: charge.userId,
      action: "kyc.dojah_started",
      entityType: "verification_service_charge",
      entityId: charge.id,
    });

    let verification: DojahIdentityLookup;
    try {
      verification = await this.dojahVerificationService.verifyIdentity(
        charge.identityMethod,
        nin,
      );
    } catch (error) {
      await this.prisma.verificationServiceCharge.update({
        where: { id: charge.id },
        data: {
          status: VerificationServiceChargeStatus.FAILED,
          failureReason:
            error instanceof Error
              ? error.message.slice(0, 1000)
              : "Dojah verification failed",
          processedAt: new Date(),
        },
      });
      await this.audit.record({
        actorUserId: charge.userId,
        action: "kyc.dojah_confirmation_failed",
        entityType: "verification_service_charge",
        entityId: charge.id,
      });
      throw error;
    }

    const nameMatch = verification.verified
      ? compareIdentityName(charge.user, verification.identityName)
      : { status: IdentityNameMatchStatus.NOT_CHECKED, reason: null };
    const verified =
      verification.verified &&
      nameMatch.status === IdentityNameMatchStatus.MATCHED;
    const underReview = verification.verified && !verified;
    const status = verified
      ? KycStatus.VERIFIED
      : underReview
        ? KycStatus.UNDER_REVIEW
        : KycStatus.REJECTED;
    const providerFailureReason = verification.verified
      ? null
      : verification.reason;
    const rejectionReason = verified
      ? null
      : underReview
        ? nameMatch.reason
        : providerFailureReason;
    await this.prisma.$transaction(async (transaction) => {
      await transaction.verificationServiceCharge.update({
        where: { id: charge.id },
        data: {
          status:
            verified || underReview
              ? VerificationServiceChargeStatus.VERIFIED
              : VerificationServiceChargeStatus.REJECTED,
          failureReason: rejectionReason,
          processedAt: new Date(),
        },
      });
      await transaction.kycProfile.update({
        where: { userId: charge.userId },
        data: verified
          ? {
              status: KycStatus.VERIFIED,
              ninStatus: KycStatus.VERIFIED,
              nameMatchStatus: IdentityNameMatchStatus.MATCHED,
              nameMatchReason: null,
              verifiedAt: new Date(),
              rejectionReason: null,
            }
          : {
              status,
              ninStatus: status,
              nameMatchStatus: nameMatch.status,
              nameMatchReason: nameMatch.reason,
              verifiedAt: null,
              rejectionReason,
            },
      });
    });
    await this.audit.record({
      actorUserId: charge.userId,
      action: verified
        ? "kyc.verified_via_dojah"
        : underReview
          ? "kyc.name_mismatch_sent_for_review"
          : "kyc.dojah_verification_rejected",
      entityType: "verification_service_charge",
      entityId: charge.id,
      metadata: {
        method: charge.identityMethod,
        nameMatchStatus: nameMatch.status,
      },
    });
    return {
      status,
      verified,
      underReview,
      provider: "DOJAH" as const,
      providerReference,
      serviceFeeKobo: KycService.SERVICE_FEE_KOBO,
    };
  }

  private assertPhoneVerified(phoneVerifiedAt: Date | null): void {
    if (!phoneVerifiedAt)
      throw new ForbiddenException(
        "Verify your phone number before starting identity verification",
      );
  }

  private hashCode(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }

  private encrypt(value: string): string {
    const key = createHash("sha256")
      .update(this.configService.getOrThrow<string>("FIELD_ENCRYPTION_SECRET"))
      .digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString("base64url");
  }

  decrypt(ciphertext: string): string {
    const buffer = Buffer.from(ciphertext, "base64url");
    const key = createHash("sha256")
      .update(this.configService.getOrThrow<string>("FIELD_ENCRYPTION_SECRET"))
      .digest();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      buffer.subarray(0, 12),
    );
    decipher.setAuthTag(buffer.subarray(12, 28));
    return Buffer.concat([
      decipher.update(buffer.subarray(28)),
      decipher.final(),
    ]).toString("utf8");
  }
}
