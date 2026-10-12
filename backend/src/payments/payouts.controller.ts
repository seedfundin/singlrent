import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { PayoutWithdrawRequest, payoutWithdrawSchema } from './dto/payment.schemas';
import { PayoutsService } from './payouts.service';

@ApiTags('Payouts')
@ApiBearerAuth()
@Controller({ path: 'payouts', version: '1' })
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Get()
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.payoutsService.listMine(user.userId);
  }

  @Post(':payoutId/withdraw')
  withdraw(
    @CurrentUser() user: AuthenticatedUser,
    @Param('payoutId') payoutId: string,
    @Body(new ZodValidationPipe(payoutWithdrawSchema)) input: PayoutWithdrawRequest,
  ) {
    return this.payoutsService.withdraw(user.userId, payoutId, input);
  }
}
