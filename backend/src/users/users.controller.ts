import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Request } from 'express';
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Public } from '../common/decorators/public.decorator';
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe";
import {
  ConfirmPhoneVerificationRequest,
  confirmPhoneVerificationSchema,
  DojahWidgetWebhookRequest,
  dojahWidgetWebhookSchema,
  SendPhoneVerificationRequest,
  sendPhoneVerificationSchema,
  SubmitNinRequest,
  StartPublisherVerificationRequest,
  startPublisherVerificationSchema,
  submitNinSchema,
  UpdateProfileRequest,
  updateProfileSchema,
} from "./dto/user.schemas";
import { KycService } from "./kyc.service";
import { PublisherVerificationService } from './publisher-verification.service';
import { UsersService } from "./users.service";

type RawBodyRequest = Request & { rawBody?: Buffer };

@ApiTags("Users")
@ApiBearerAuth()
@Controller({ path: "users", version: "1" })
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly kycService: KycService,
    private readonly publisherVerificationService: PublisherVerificationService,
  ) {}

  @Get("me/profile")
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getProfile(user.userId);
  }

  @Patch("me/profile")
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateProfileSchema))
    input: UpdateProfileRequest,
  ) {
    return this.usersService.updateProfile(user.userId, input);
  }

  @Post("me/phone-verification")
  sendPhoneVerification(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(sendPhoneVerificationSchema))
    input: SendPhoneVerificationRequest,
  ) {
    return this.kycService.sendPhoneChallenge(user.userId, input);
  }

  @Post("me/phone-verification/confirm")
  confirmPhoneVerification(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(confirmPhoneVerificationSchema))
    input: ConfirmPhoneVerificationRequest,
  ) {
    return this.kycService.confirmPhoneChallenge(user.userId, input);
  }

  @Post("me/kyc/nin")
  submitNin(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(submitNinSchema)) input: SubmitNinRequest,
  ) {
    return this.kycService.submitNin(user.userId, input);
  }

  @Get("me/kyc")
  getKycStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.kycService.getVerificationStatus(user.userId);
  }

  @Post("me/kyc/service-charge")
  initializeTransactionalKyc(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(submitNinSchema)) input: SubmitNinRequest,
  ) {
    return this.kycService.initializeTenantVerification(user.userId, input);
  }

  @Post("me/kyc/service-charge/:chargeId/verify")
  verifyTransactionalKycCharge(
    @CurrentUser() user: AuthenticatedUser,
    @Param("chargeId") chargeId: string,
  ) {
    return this.kycService.verifyTenantServiceChargeForUser(user.userId, chargeId);
  }

  @Get('me/publisher-verification')
  getPublisherVerification(@CurrentUser() user: AuthenticatedUser) {
    return this.publisherVerificationService.getStatus(user.userId);
  }

  @Post('me/publisher-verification/sessions')
  startPublisherVerification(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(startPublisherVerificationSchema)) input: StartPublisherVerificationRequest,
  ) {
    return this.publisherVerificationService.start(user.userId, input);
  }

  @Post('me/publisher-verification/sessions/:verificationId/reconcile')
  reconcilePublisherVerification(
    @CurrentUser() user: AuthenticatedUser,
    @Param('verificationId') verificationId: string,
  ) {
    return this.publisherVerificationService.reconcile(user.userId, verificationId);
  }

  @Public()
  @Post('webhooks/dojah')
  @HttpCode(200)
  dojahWebhook(
    @Req() request: RawBodyRequest,
    @Headers('x-dojah-signature') signature: string | undefined,
    @Headers('x-dojah-signature-v2') signatureV2: string | undefined,
    @Body(new ZodValidationPipe(dojahWidgetWebhookSchema)) event: DojahWidgetWebhookRequest,
  ) {
    const rawBody = request.rawBody ?? Buffer.from(JSON.stringify(event));
    return this.publisherVerificationService.handleWebhook(rawBody, signature, signatureV2, event);
  }
}
