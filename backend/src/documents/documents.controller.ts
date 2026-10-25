import { Body, Controller, Get, Param, Post, Res, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { ModuleRef } from '@nestjs/core';
import { NotificationType } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { AgreementsService } from './agreements.service';
import { ElectronicSignatureRequest, electronicSignatureSchema, GuarantorFormRequest, guarantorFormSchema, UploadedSignedCopyRequest, uploadedSignedCopySchema } from './dto/document.schemas';
import { ReceiptsService } from './receipts.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GuarantorFormsService } from './guarantor-forms.service';

@ApiTags('Tenancy documents and receipts')
@ApiBearerAuth()
@Controller({ path: 'tenancies', version: '1' })
export class AgreementsController {
  constructor(
    private readonly agreements: AgreementsService,
    private readonly guarantorForms: GuarantorFormsService,
    private readonly moduleRef: ModuleRef,
  ) {}

  private async notifySignature(actorId: string, agreement: Awaited<ReturnType<AgreementsService['sign']>>) {
    // Resolve lazily to avoid a Documents -> Notifications -> Jobs -> Financials -> Documents module cycle.
    try {
      const notifications = this.moduleRef.get(NotificationsService, { strict: false });
      const recipients = [...new Set([agreement.tenancy.tenantId, agreement.tenancy.landlordId, agreement.tenancy.agentId].filter((id): id is string => Boolean(id)))];
      const tenancyStarted = agreement.tenancy.status === 'ACTIVE';
      await Promise.allSettled(recipients.map((userId) => notifications.create({
        userId,
        type: NotificationType.TENANCY_UPDATED,
        title: tenancyStarted ? (userId === actorId ? 'Tenancy is active' : 'Tenancy agreement completed') : (userId === actorId ? 'Agreement signature submitted' : 'Tenancy agreement updated'),
        body: tenancyStarted
          ? (userId === actorId ? 'Your signature was recorded and your tenancy is now active.' : 'The tenant signed the agreement and the tenancy is now active.')
          : (userId === actorId ? 'Your signature was recorded. Open your tenancy documents to check its status.' : 'A tenancy participant submitted a signature. Open your tenancy documents to check its status.'),
        data: { tenancyId: agreement.tenancyId },
      })));
    } catch { /* Signature has already committed; notification failures cannot undo it. */ }
  }

  @Get(':tenancyId/agreement')
  agreement(@CurrentUser() user: AuthenticatedUser, @Param('tenancyId') tenancyId: string) {
    return this.agreements.getForViewer(user.userId, tenancyId);
  }

  @Get(':tenancyId/agreement/pdf')
  async agreementPdf(@CurrentUser() user: AuthenticatedUser, @Param('tenancyId') tenancyId: string, @Res() response: Response) {
    const pdf = await this.agreements.pdfForViewer(user.userId, tenancyId);
    response.setHeader('content-type', 'application/pdf');
    response.setHeader('content-disposition', `inline; filename="${pdf.filename}"`);
    response.send(pdf.data);
  }

  @Post(':tenancyId/agreement/signatures')
  async sign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenancyId') tenancyId: string,
    @Body(new ZodValidationPipe(electronicSignatureSchema)) input: ElectronicSignatureRequest,
    @Req() request: Request,
  ) {
    const agreement = await this.agreements.sign(user.userId, tenancyId, input, request);
    await this.notifySignature(user.userId, agreement);
    return agreement;
  }

  @Post(':tenancyId/agreement/signed-copy')
  async uploadSignedCopy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenancyId') tenancyId: string,
    @Body(new ZodValidationPipe(uploadedSignedCopySchema)) input: UploadedSignedCopyRequest,
    @Req() request: Request,
  ) {
    const agreement = await this.agreements.attachUploadedSignedCopy(user.userId, tenancyId, input, request);
    await this.notifySignature(user.userId, agreement);
    return agreement;
  }

  @Get(':tenancyId/agreement/signed-copies')
  signedCopies(@CurrentUser() user: AuthenticatedUser, @Param('tenancyId') tenancyId: string) {
    return this.agreements.signedCopiesForViewer(user.userId, tenancyId);
  }

  @Get(':tenancyId/guarantor-form')
  guarantorForm(@CurrentUser() user: AuthenticatedUser, @Param('tenancyId') tenancyId: string) {
    return this.guarantorForms.getForViewer(user.userId, tenancyId);
  }

  @Post(':tenancyId/guarantor-form')
  saveGuarantorForm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenancyId') tenancyId: string,
    @Body(new ZodValidationPipe(guarantorFormSchema)) input: GuarantorFormRequest,
  ) {
    return this.guarantorForms.save(user.userId, tenancyId, input);
  }

  @Get(':tenancyId/guarantor-form/pdf')
  async guarantorFormPdf(@CurrentUser() user: AuthenticatedUser, @Param('tenancyId') tenancyId: string, @Res() response: Response) {
    const pdf = await this.guarantorForms.pdfForViewer(user.userId, tenancyId);
    response.setHeader('content-type', 'application/pdf');
    response.setHeader('content-disposition', `inline; filename="${pdf.filename}"`);
    response.send(pdf.data);
  }

  @Post(':tenancyId/guarantor-form/signature')
  async signGuarantorForm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenancyId') tenancyId: string,
    @Body(new ZodValidationPipe(electronicSignatureSchema)) input: ElectronicSignatureRequest,
  ) {
    return this.guarantorForms.sign(user.userId, tenancyId, input);
  }

  @Post(':tenancyId/guarantor-form/signed-copy')
  uploadGuarantorSignedCopy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenancyId') tenancyId: string,
    @Body(new ZodValidationPipe(uploadedSignedCopySchema)) input: UploadedSignedCopyRequest,
  ) {
    return this.guarantorForms.attachUploadedSignedCopy(user.userId, tenancyId, input);
  }
}

@ApiTags('Tenancy documents and receipts')
@ApiBearerAuth()
@Controller({ path: 'receipts', version: '1' })
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.receipts.listForViewer(user.userId);
  }

  @Get(':receiptId/pdf')
  async pdf(@CurrentUser() user: AuthenticatedUser, @Param('receiptId') receiptId: string, @Res() response: Response) {
    const pdf = await this.receipts.pdfForViewer(user.userId, receiptId);
    response.setHeader('content-type', 'application/pdf');
    response.setHeader('content-disposition', `inline; filename="${pdf.filename}"`);
    response.send(pdf.data);
  }
}
