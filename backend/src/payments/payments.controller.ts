import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import {
  CautionDeductionRequest,
  cautionDeductionSchema,
  PaymentInitializationRequest,
  paymentInitializationSchema,
  PaymentQuery,
  paymentQuerySchema,
  PaystackWebhookRequest,
  paystackWebhookSchema,
  ResolveCautionDeductionRequest,
  resolveCautionDeductionSchema,
} from './dto/payment.schemas';
import { PaymentsService } from './payments.service';

type RawBodyRequest = Request & { rawBody?: Buffer };

@ApiTags('Payments')
@Controller({ path: 'payments', version: '1' })
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Public()
  @Post('webhooks/paystack')
  @HttpCode(200)
  webhook(
    @Req() request: RawBodyRequest,
    @Headers('x-paystack-signature') signature: string | undefined,
    @Body(new ZodValidationPipe(paystackWebhookSchema)) event: PaystackWebhookRequest,
  ) {
    const rawBody = request.rawBody ?? Buffer.from(JSON.stringify(event));
    return this.paymentsService.handlePaystackWebhook(rawBody, signature, event);
  }

  @ApiBearerAuth()
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(paymentQuerySchema)) query: PaymentQuery) {
    return this.paymentsService.list(user.userId, query);
  }

  @ApiBearerAuth()
  @Post('initialize')
  initialize(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(paymentInitializationSchema)) input: PaymentInitializationRequest,
  ) {
    return this.paymentsService.initialize(user.userId, input);
  }

  @ApiBearerAuth()
  @Get(':paymentId')
  get(@CurrentUser() user: AuthenticatedUser, @Param('paymentId') paymentId: string) {
    return this.paymentsService.get(user.userId, paymentId);
  }

  @ApiBearerAuth()
  @Post(':paymentId/verify')
  verify(@CurrentUser() user: AuthenticatedUser, @Param('paymentId') paymentId: string) {
    return this.paymentsService.verifyForUser(user.userId, paymentId);
  }

  @ApiBearerAuth()
  @Post(':paymentId/authorize-release')
  authorizeRelease(@CurrentUser() user: AuthenticatedUser, @Param('paymentId') paymentId: string) {
    return this.paymentsService.authorizeRelease(user.userId, paymentId);
  }

  @ApiBearerAuth()
  @Post(':paymentId/caution-deductions')
  proposeCautionDeduction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('paymentId') paymentId: string,
    @Body(new ZodValidationPipe(cautionDeductionSchema)) input: CautionDeductionRequest,
  ) {
    return this.paymentsService.proposeCautionDeduction(user.userId, paymentId, input);
  }

  @ApiBearerAuth()
  @Post(':paymentId/caution-deductions/:deductionId/accept')
  acceptCautionDeduction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('paymentId') paymentId: string,
    @Param('deductionId') deductionId: string,
    @Body(new ZodValidationPipe(resolveCautionDeductionSchema)) input: ResolveCautionDeductionRequest,
  ) {
    return this.paymentsService.acceptCautionDeduction(user.userId, paymentId, deductionId, input);
  }

  @ApiBearerAuth()
  @Post(':paymentId/caution-deductions/:deductionId/dispute')
  @HttpCode(204)
  async disputeCautionDeduction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('paymentId') paymentId: string,
    @Param('deductionId') deductionId: string,
    @Body(new ZodValidationPipe(resolveCautionDeductionSchema)) input: ResolveCautionDeductionRequest,
  ): Promise<void> {
    await this.paymentsService.disputeCautionDeduction(user.userId, paymentId, deductionId, input);
  }
}
