import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { GuarantorFormStatus, GuarantorSignatureMethod, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../common/database/prisma.service';
import { MediaService } from '../media/media.service';
import { ElectronicSignatureRequest, GuarantorFormRequest, UploadedSignedCopyRequest } from './dto/document.schemas';
import { createTextPdf } from './pdf-document';
import { AgreementsService } from './agreements.service';
import { createGuarantorFormTerms, guarantorFormPdfLines } from './guarantor-form-template';

const guarantorInclude = {
  tenancy: {
    select: {
      id: true,
      status: true,
      tenantId: true,
      landlordId: true,
      agentId: true,
      tenant: { select: { firstName: true, lastName: true } },
      listing: { select: { title: true, address: true, area: true, state: true } },
    },
  },
} satisfies Prisma.GuarantorFormInclude;

type GuarantorFormView = Prisma.GuarantorFormGetPayload<{ include: typeof guarantorInclude }>;

@Injectable()
export class GuarantorFormsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaService: MediaService,
    private readonly agreements: AgreementsService,
  ) {}

  async getForViewer(userId: string, tenancyId: string) {
    await this.assertViewer(userId, tenancyId);
    const form = await this.prisma.guarantorForm.findUnique({ where: { tenancyId }, include: guarantorInclude });
    return form ? this.toViewerForm(form) : null;
  }

  async save(userId: string, tenancyId: string, input: GuarantorFormRequest) {
    const tenancy = await this.assertTenantAndVerified(userId, tenancyId);
    const existing = await this.prisma.guarantorForm.findUnique({ where: { tenancyId }, select: { id: true, status: true, passportObjectKey: true } });
    if (existing?.status === GuarantorFormStatus.EXECUTED) {
      throw new ConflictException('The executed guarantor form cannot be changed');
    }
    const passportObjectKey = input.passportObjectKey ?? existing?.passportObjectKey;
    if (!passportObjectKey) throw new ConflictException('Upload the guarantor passport photograph before saving this form');
    if (input.passportObjectKey) await this.mediaService.prepareGuarantorPassport(userId, tenancyId, input.passportObjectKey);
    const reference = `SRG-${tenancyId.replace(/-/g, '').slice(0, 16).toUpperCase()}`;
    const terms = createGuarantorFormTerms({
      reference,
      generatedAt: new Date(),
      prospectiveTenantName: fullName(tenancy.tenant),
      propertyTitle: tenancy.listing.title,
      propertyAddress: propertyAddress(tenancy.listing),
      guarantorName: input.guarantorName,
      knownForYears: input.knownForYears,
      homeAddress: input.homeAddress,
      businessAddress: input.businessAddress,
      telephone: input.telephone,
      profession: input.profession,
      qualification: input.qualification,
    });
    const documentHash = hash(JSON.stringify(terms));
    const form = await this.prisma.guarantorForm.upsert({
      where: { tenancyId },
      create: {
        tenancyId,
        reference,
        prospectiveTenantName: fullName(tenancy.tenant),
        guarantorName: input.guarantorName,
        knownForYears: input.knownForYears,
        homeAddress: input.homeAddress,
        businessAddress: input.businessAddress,
        telephone: input.telephone,
        profession: input.profession,
        qualification: input.qualification,
        passportObjectKey,
        documentHash,
        submittedByUserId: userId,
      },
      update: {
        prospectiveTenantName: fullName(tenancy.tenant),
        guarantorName: input.guarantorName,
        knownForYears: input.knownForYears,
        homeAddress: input.homeAddress,
        businessAddress: input.businessAddress,
        telephone: input.telephone,
        profession: input.profession,
        qualification: input.qualification,
        passportObjectKey,
        documentHash,
        submittedByUserId: userId,
      },
      include: guarantorInclude,
    });
    return this.toViewerForm(form);
  }

  async sign(userId: string, tenancyId: string, input: ElectronicSignatureRequest) {
    const form = await this.formForTenant(userId, tenancyId);
    if (form.status === GuarantorFormStatus.EXECUTED) throw new ConflictException('This guarantor form has already been signed');
    if (input.signerName.trim().toLocaleLowerCase() !== form.guarantorName.toLocaleLowerCase()) {
      throw new ConflictException('Enter the guarantor’s full name exactly to sign this form');
    }
    return this.finalize(form, { method: GuarantorSignatureMethod.ELECTRONIC_CONSENT, signerName: input.signerName.trim() });
  }

  async attachUploadedSignedCopy(userId: string, tenancyId: string, input: UploadedSignedCopyRequest) {
    const form = await this.formForTenant(userId, tenancyId);
    if (form.status === GuarantorFormStatus.EXECUTED) throw new ConflictException('This guarantor form has already been signed');
    if (input.signerName.trim().toLocaleLowerCase() !== form.guarantorName.toLocaleLowerCase()) {
      throw new ConflictException('Enter the guarantor’s full name exactly before uploading a signed copy');
    }
    await this.mediaService.prepareGuarantorSignedCopy(userId, tenancyId, input.objectKey);
    return this.finalize(form, { method: GuarantorSignatureMethod.UPLOADED_SIGNED_COPY, signerName: input.signerName.trim(), objectKey: input.objectKey });
  }

  async pdfForViewer(userId: string, tenancyId: string): Promise<{ filename: string; data: Buffer }> {
    const form = await this.formForViewer(userId, tenancyId);
    const terms = createGuarantorFormTerms({
      reference: form.reference,
      generatedAt: form.createdAt,
      prospectiveTenantName: form.prospectiveTenantName,
      propertyTitle: form.tenancy.listing.title,
      propertyAddress: propertyAddress(form.tenancy.listing),
      guarantorName: form.guarantorName,
      knownForYears: form.knownForYears,
      homeAddress: form.homeAddress,
      businessAddress: form.businessAddress,
      telephone: form.telephone,
      profession: form.profession,
      qualification: form.qualification,
      signature: form.signedAt && form.signerName && form.signatureMethod
        ? { signerName: form.signerName, signedAt: form.signedAt, method: form.signatureMethod }
        : null,
    });
    return {
      filename: `${form.reference}.pdf`,
      data: createTextPdf('SingleRent guarantor form', guarantorFormPdfLines(terms)),
    };
  }

  private async finalize(
    form: GuarantorFormView,
    signature: { method: GuarantorSignatureMethod; signerName: string; objectKey?: string },
  ) {
    const signedAt = new Date();
    const updated = await this.prisma.$transaction(async (transaction) => {
      await this.lockAndCheckVerification(transaction, form.tenancyId);
      const claimed = await transaction.guarantorForm.updateMany({
        where: { id: form.id, status: GuarantorFormStatus.PENDING_SIGNATURE },
        data: {
          status: GuarantorFormStatus.EXECUTED,
          signatureMethod: signature.method,
          signerName: signature.signerName,
          signedAt,
          uploadedSignedCopyObjectKey: signature.objectKey,
        },
      });
      if (claimed.count !== 1) throw new ConflictException('This guarantor form is no longer available for signature');
      await this.agreements.tryActivateTenancyAfterDocumentSignatures(transaction, form.tenancyId);
      return transaction.guarantorForm.findUniqueOrThrow({ where: { id: form.id }, include: guarantorInclude });
    });
    return this.toViewerForm(updated);
  }

  private async formForTenant(userId: string, tenancyId: string): Promise<GuarantorFormView> {
    await this.assertTenantAndVerified(userId, tenancyId);
    return this.formForViewer(userId, tenancyId);
  }

  private async formForViewer(userId: string, tenancyId: string): Promise<GuarantorFormView> {
    await this.assertViewer(userId, tenancyId);
    const form = await this.prisma.guarantorForm.findUnique({ where: { tenancyId }, include: guarantorInclude });
    if (!form) throw new NotFoundException('Complete the guarantor details and passport photograph before signing');
    return form;
  }

  private async assertViewer(userId: string, tenancyId: string) {
    const tenancy = await this.prisma.tenancy.findFirst({
      where: { id: tenancyId, OR: [{ tenantId: userId }, { landlordId: userId }, { agentId: userId }] },
      select: { id: true },
    });
    if (!tenancy) throw new ForbiddenException('Only tenancy participants can access this guarantor form');
    return tenancy;
  }

  private async assertTenantAndVerified(userId: string, tenancyId: string) {
    const tenancy = await this.prisma.tenancy.findFirst({
      where: { id: tenancyId, tenantId: userId },
      select: {
        id: true,
        tenant: { select: { firstName: true, lastName: true } },
        listing: { select: { title: true, address: true, area: true, state: true } },
      },
    });
    if (!tenancy) throw new ForbiddenException('Only the tenant can complete or sign this guarantor form');
    const verification = await this.prisma.moveInVerification.findUnique({ where: { tenancyId }, select: { status: true, adminHold: true } });
    if (verification && (verification.status !== 'VERIFIED' || verification.adminHold)) {
      throw new ConflictException('Move-in verification must be approved before the guarantor form is available');
    }
    return tenancy;
  }

  private async lockAndCheckVerification(transaction: Prisma.TransactionClient, tenancyId: string): Promise<void> {
    const initial = await transaction.moveInVerification.findUnique({ where: { tenancyId }, select: { paymentId: true } });
    if (!initial) return;
    await transaction.$queryRaw`SELECT id FROM "escrow_records" WHERE "paymentId" = ${initial.paymentId}::uuid FOR UPDATE`;
    const verification = await transaction.moveInVerification.findUniqueOrThrow({ where: { tenancyId }, select: { status: true, adminHold: true } });
    if (verification.status !== 'VERIFIED' || verification.adminHold) throw new ConflictException('Move-in verification must be approved before signing');
  }

  private toViewerForm(form: GuarantorFormView) {
    const { passportObjectKey: _passportObjectKey, uploadedSignedCopyObjectKey: _uploadedSignedCopyObjectKey, ...safeForm } = form;
    return {
      ...safeForm,
      passportUploaded: true,
      signedCopyAttached: Boolean(_uploadedSignedCopyObjectKey),
    };
  }
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`.trim();
}

function propertyAddress(listing: { address: string | null; area: string | null; state: string | null }): string | null {
  const address = [listing.address, listing.area, listing.state].filter((value): value is string => Boolean(value?.trim())).join(', ');
  return address || null;
}
