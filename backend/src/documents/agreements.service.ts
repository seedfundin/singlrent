import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AgreementSignatureMethod, AgreementSignerRole, AgreementStatus, ApplicationStatus, EscrowStatus, ListingAvailability, Prisma, TenancyStatus } from '@prisma/client';
import { createHash } from 'crypto';
import { Request } from 'express';
import { PrismaService } from '../common/database/prisma.service';
import { MediaService } from '../media/media.service';
import { ElectronicSignatureRequest, UploadedSignedCopyRequest } from './dto/document.schemas';
import { createTextPdf } from './pdf-document';
import { agreementPdfLines, createTenancyAgreementTerms, RenderedTenancyAgreement, TENANCY_AGREEMENT_VERSION } from './tenancy-agreement-template';

const agreementInclude = {
  tenancy: {
    include: {
      listing: { select: { title: true, address: true, area: true, state: true } },
      tenant: { select: { id: true, firstName: true, lastName: true, email: true } },
      landlord: { select: { id: true, firstName: true, lastName: true, email: true } },
      agent: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  },
  signatures: { orderBy: { signedAt: 'asc' as const }, select: { signerUserId: true, signerRole: true, method: true, signerName: true, signedAt: true, uploadedDocumentUrl: true } },
} satisfies Prisma.TenancyAgreementInclude;

type AgreementView = Prisma.TenancyAgreementGetPayload<{ include: typeof agreementInclude }>;

@Injectable()
export class AgreementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaService: MediaService,
  ) {}

  async createForTenancy(transaction: Prisma.TransactionClient, tenancyId: string): Promise<void> {
    const tenancy = await transaction.tenancy.findUnique({
      where: { id: tenancyId },
      include: {
        listing: { select: { title: true, address: true, area: true, state: true, propertyType: true, annualRentKobo: true, cautionFeeKobo: true, amenities: true } },
        application: { select: { occupantsCount: true } },
        tenant: { select: { firstName: true, lastName: true, email: true } },
        landlord: { select: { firstName: true, lastName: true, email: true } },
        agent: { select: { firstName: true, lastName: true, email: true } },
      },
    });
    if (!tenancy) throw new NotFoundException('Tenancy not found while creating agreement');
    const reference = `SRA-${tenancy.id.replace(/-/g, '').slice(0, 16).toUpperCase()}`;
    const terms = createTenancyAgreementTerms({
      reference,
      generatedAt: new Date(),
      premises: tenancy.listing,
      tenancy: { startsAt: tenancy.startsAt, endsAt: tenancy.endsAt },
      parties: {
        tenant: { name: fullName(tenancy.tenant), email: tenancy.tenant.email },
        landlord: { name: fullName(tenancy.landlord), email: tenancy.landlord.email },
        agent: tenancy.agent ? { name: fullName(tenancy.agent), email: tenancy.agent.email } : null,
      },
      occupantsCount: tenancy.application.occupantsCount,
    });
    const documentHash = hash(JSON.stringify(terms));
    const existing = await transaction.tenancyAgreement.findUnique({ where: { tenancyId }, select: { id: true, status: true, termsVersion: true } });
    if (!existing) {
      await transaction.tenancyAgreement.create({
        data: { tenancyId, reference, termsVersion: TENANCY_AGREEMENT_VERSION, renderedTerms: terms as unknown as Prisma.InputJsonValue, documentHash },
      });
      return;
    }
    // A generated but unsigned v1 summary can safely be upgraded to the
    // supplied agreement. Never replace a record that someone has signed.
    if (existing.status === AgreementStatus.PENDING_SIGNATURES && existing.termsVersion !== TENANCY_AGREEMENT_VERSION) {
      await transaction.tenancyAgreement.update({
        where: { id: existing.id },
        data: { termsVersion: TENANCY_AGREEMENT_VERSION, renderedTerms: terms as unknown as Prisma.InputJsonValue, documentHash, generatedAt: new Date() },
      });
    }
  }

  async getForViewer(userId: string, tenancyId: string): Promise<AgreementView> {
    let agreement = await this.prisma.tenancyAgreement.findUnique({ where: { tenancyId }, include: agreementInclude });
    if (!agreement) throw new NotFoundException('Tenancy agreement is not ready yet');
    if (agreement.status === AgreementStatus.PENDING_SIGNATURES && agreement.termsVersion !== TENANCY_AGREEMENT_VERSION && agreement.signatures.length === 0) {
      await this.prisma.$transaction((transaction) => this.createForTenancy(transaction, tenancyId));
      agreement = await this.prisma.tenancyAgreement.findUniqueOrThrow({ where: { tenancyId }, include: agreementInclude });
    }
    this.assertParticipant(agreement, userId);
    const verification = await this.prisma.moveInVerification.findUnique({ where: { tenancyId }, select: { status: true, adminHold: true } });
    if (verification && agreement.status !== AgreementStatus.EXECUTED && (verification.status !== 'VERIFIED' || verification.adminHold)) throw new ConflictException('Move-in verification must be approved before the agreement is available');
    return agreement;
  }

  private async lockAndCheckVerification(transaction: Prisma.TransactionClient, tenancyId: string): Promise<void> {
    const initial = await transaction.moveInVerification.findUnique({ where: { tenancyId }, select: { paymentId: true } });
    if (!initial) return; // Existing transactions retain their original workflow.
    await transaction.$queryRaw`SELECT id FROM "escrow_records" WHERE "paymentId" = ${initial.paymentId}::uuid FOR UPDATE`;
    const verification = await transaction.moveInVerification.findUniqueOrThrow({ where: { tenancyId }, select: { status: true, adminHold: true } });
    if (verification.status !== 'VERIFIED' || verification.adminHold) throw new ConflictException('Move-in verification must be approved before signing');
  }

  async sign(userId: string, tenancyId: string, input: ElectronicSignatureRequest, request: Request): Promise<AgreementView> {
    const agreement = await this.getForViewer(userId, tenancyId);
    if (agreement.status === AgreementStatus.EXECUTED || agreement.status === AgreementStatus.VOID || agreement.status === AgreementStatus.SUPERSEDED) {
      throw new ConflictException('This agreement is no longer available for signature');
    }
    if (!input.acceptTerms) throw new ConflictException('You must accept the tenancy agreement before signing');
    const signerRole = this.signerRole(agreement, userId);
    if (signerRole !== AgreementSignerRole.TENANT) throw new ForbiddenException('Only the tenant may sign this tenancy agreement');
    const expectedName = this.fullNameFor(agreement, userId);
    if (input.signerName.trim().toLocaleLowerCase() !== expectedName.toLocaleLowerCase()) {
      throw new ConflictException('Enter your full account name exactly to sign this agreement');
    }
    const ipAddressHash = request.ip ? hash(request.ip) : null;
    const userAgent = request.headers['user-agent'];
    const userAgentHash = typeof userAgent === 'string' ? hash(userAgent) : null;
    await this.prisma.$transaction(async (transaction) => {
      await this.lockAndCheckVerification(transaction, tenancyId);
      await transaction.agreementSignature.create({
        data: { agreementId: agreement.id, signerUserId: userId, signerRole, method: AgreementSignatureMethod.ELECTRONIC_CONSENT, signerName: input.signerName.trim(), ipAddressHash, userAgentHash },
      }).catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('You have already signed this agreement');
        throw error;
      });
      await this.updateAgreementStatus(transaction, agreement.id, agreement.tenancyId);
    });
    return this.getForViewer(userId, tenancyId);
  }

  async attachUploadedSignedCopy(userId: string, tenancyId: string, input: UploadedSignedCopyRequest, request: Request): Promise<AgreementView> {
    const agreement = await this.getForViewer(userId, tenancyId);
    if (agreement.status === AgreementStatus.EXECUTED || agreement.status === AgreementStatus.VOID || agreement.status === AgreementStatus.SUPERSEDED) {
      throw new ConflictException('This agreement is no longer available for signature');
    }
    const signerRole = this.signerRole(agreement, userId);
    if (signerRole !== AgreementSignerRole.TENANT) throw new ForbiddenException('Only the tenant may attach a signed tenancy agreement');
    const expectedName = this.fullNameFor(agreement, userId);
    if (input.signerName.trim().toLocaleLowerCase() !== expectedName.toLocaleLowerCase()) {
      throw new ConflictException('Enter your full account name exactly before uploading a signed copy');
    }
    await this.mediaService.prepareAgreementDocument(userId, tenancyId, input.objectKey);
    const ipAddressHash = request.ip ? hash(request.ip) : null;
    const userAgent = request.headers['user-agent'];
    const userAgentHash = typeof userAgent === 'string' ? hash(userAgent) : null;
    await this.prisma.$transaction(async (transaction) => {
      await this.lockAndCheckVerification(transaction, tenancyId);
      await transaction.agreementSignature.create({
        data: {
          agreementId: agreement.id,
          signerUserId: userId,
          signerRole,
          method: AgreementSignatureMethod.UPLOADED_SIGNED_COPY,
          signerName: input.signerName.trim(),
          uploadedDocumentUrl: input.objectKey,
          ipAddressHash,
          userAgentHash,
        },
      }).catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('You have already signed this agreement');
        throw error;
      });
      await this.updateAgreementStatus(transaction, agreement.id, agreement.tenancyId);
    });
    return this.getForViewer(userId, tenancyId);
  }

  async signedCopiesForViewer(userId: string, tenancyId: string) {
    const agreement = await this.getForViewer(userId, tenancyId);
    const copies = await Promise.all(agreement.signatures
      .filter((signature) => Boolean(signature.uploadedDocumentUrl))
      .map(async (signature) => ({
        signerName: signature.signerName,
        signerRole: signature.signerRole,
        signedAt: signature.signedAt,
        ...(await this.mediaService.privateDownloadUrl(signature.uploadedDocumentUrl!)),
      })));
    return { copies };
  }

  async pdfForViewer(userId: string, tenancyId: string): Promise<{ filename: string; data: Buffer }> {
    const agreement = await this.getForViewer(userId, tenancyId);
    const terms = agreement.renderedTerms as unknown;
    const signatures = agreement.signatures.map((signature) => `${signature.signerRole}: ${signature.signerName}, ${signature.signedAt.toISOString()}`);
    const data = createTextPdf('SingleRent tenancy agreement', [
      `Agreement reference: ${agreement.reference}`,
      `Document integrity hash (SHA-256): ${agreement.documentHash}`,
      `Status: ${agreement.status.replaceAll('_', ' ')}`,
      ...(isCurrentAgreement(terms) ? agreementPdfLines(terms, signatures) : legacyAgreementPdfLines(terms, signatures)),
      `Generated by SingleRent on ${agreement.generatedAt.toISOString()}.`,
    ]);
    return { filename: `${agreement.reference}.pdf`, data };
  }

  private assertParticipant(agreement: AgreementView, userId: string): void {
    if (![agreement.tenancy.tenantId, agreement.tenancy.landlordId, agreement.tenancy.agentId].includes(userId)) {
      throw new ForbiddenException('Only tenancy participants can access this agreement');
    }
  }

  private signerRole(agreement: AgreementView, userId: string): AgreementSignerRole {
    if (agreement.tenancy.tenantId === userId) return AgreementSignerRole.TENANT;
    if (agreement.tenancy.landlordId === userId) return AgreementSignerRole.LANDLORD;
    if (agreement.tenancy.agentId === userId) return AgreementSignerRole.AGENT;
    throw new ForbiddenException('Only tenancy participants can sign this agreement');
  }

  private async updateAgreementStatus(transaction: Prisma.TransactionClient, agreementId: string, tenancyId: string): Promise<void> {
    const signatures = await transaction.agreementSignature.findMany({ where: { agreementId }, select: { signerRole: true } });
    // The tenant's signature is the final in-product acceptance step after a
    // satisfactory move-in checklist. A landlord/agent may still retain an
    // additional signed copy, but it is not required to start this tenancy.
    const required = [AgreementSignerRole.TENANT];
    const executed = required.every((role) => signatures.some((signature) => signature.signerRole === role));
    await transaction.tenancyAgreement.update({
      where: { id: agreementId },
      data: { status: executed ? AgreementStatus.EXECUTED : AgreementStatus.PARTIALLY_SIGNED, executedAt: executed ? new Date() : null },
    });
    if (executed) await this.tryActivateTenancyAfterDocumentSignatures(transaction, tenancyId);
  }

  async tryActivateTenancyAfterDocumentSignatures(transaction: Prisma.TransactionClient, tenancyId: string): Promise<void> {
    const [agreement, guarantorForm] = await Promise.all([
      transaction.tenancyAgreement.findUnique({ where: { tenancyId }, select: { status: true } }),
      transaction.guarantorForm.findUnique({ where: { tenancyId }, select: { status: true } }),
    ]);
    if (agreement?.status !== AgreementStatus.EXECUTED || guarantorForm?.status !== 'EXECUTED') return;
    const verification = await transaction.moveInVerification.findUnique({
      where: { tenancyId },
      include: {
        refundRequests: { where: { status: 'PENDING' } },
        payment: { include: { escrow: true, payouts: true } },
      },
    });
    // Legacy tenancies keep their existing manager-controlled activation path.
    if (!verification) return;
    if (verification.status !== 'VERIFIED' || verification.adminHold || verification.refundRequests.length > 0 || verification.payment.escrow?.status !== EscrowStatus.HELD || verification.payment.payouts.some((payout) => ['REFUND', 'CAUTION_REFUND'].includes(payout.kind) && !['FAILED', 'CANCELLED'].includes(payout.status))) {
      throw new ConflictException('The tenancy cannot start until move-in verification is approved, the payment remains protected, and no refund or dispute is open');
    }
    const tenancy = await transaction.tenancy.findUniqueOrThrow({ where: { id: tenancyId }, select: { status: true, applicationId: true, listingId: true } });
    if (tenancy.status === TenancyStatus.ACTIVE) return;
    if (tenancy.status !== TenancyStatus.PENDING_MOVE_IN) throw new ConflictException('Only a pending move-in tenancy can start after signature');
    const claimed = await transaction.tenancy.updateMany({ where: { id: tenancyId, status: TenancyStatus.PENDING_MOVE_IN }, data: { status: TenancyStatus.ACTIVE } });
    if (claimed.count !== 1) throw new ConflictException('The tenancy is no longer pending move-in');
    await transaction.rentalApplication.update({ where: { id: tenancy.applicationId }, data: { status: ApplicationStatus.ACTIVE } });
    await transaction.listing.updateMany({ where: { id: tenancy.listingId, status: { not: 'ARCHIVED' } }, data: { availability: ListingAvailability.RENTED } });
  }

  private fullNameFor(agreement: AgreementView, userId: string): string {
    const person = agreement.tenancy.tenant.id === userId ? agreement.tenancy.tenant : agreement.tenancy.landlord.id === userId ? agreement.tenancy.landlord : agreement.tenancy.agent;
    if (!person) throw new ForbiddenException('Only tenancy participants can sign this agreement');
    return `${person.firstName} ${person.lastName}`.trim();
  }
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`.trim();
}

function isCurrentAgreement(value: unknown): value is RenderedTenancyAgreement {
  return Boolean(value) && typeof value === 'object' && (value as { version?: unknown }).version === TENANCY_AGREEMENT_VERSION;
}

function legacyAgreementPdfLines(value: unknown, signatures: string[]): string[] {
  const terms = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const parties = terms.parties && typeof terms.parties === 'object' ? terms.parties as Record<string, unknown> : {};
  const premises = terms.premises && typeof terms.premises === 'object' ? terms.premises as Record<string, unknown> : {};
  const tenancy = terms.tenancy && typeof terms.tenancy === 'object' ? terms.tenancy as Record<string, unknown> : {};
  const acknowledgements = Array.isArray(terms.acknowledgements) ? terms.acknowledgements.filter((item): item is string => typeof item === 'string') : [];
  return [
    `Property: ${text(premises.title)} — ${text(premises.address)}, ${text(premises.area)}, ${text(premises.state)}`,
    `Tenant: ${text(parties.tenant)}`,
    `Landlord: ${text(parties.landlord)}`,
    `Managing agent: ${text(parties.agent, 'None')}`,
    `Tenancy period: ${text(tenancy.startsAt)} to ${text(tenancy.endsAt)}`,
    ...acknowledgements,
    'Recorded signatures:',
    ...(signatures.length ? signatures : ['No signatures recorded yet.']),
  ];
}

function text(value: unknown, fallback = 'Not recorded'): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}
