import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { SavePayoutAccountRequest, savePayoutAccountSchema } from './dto/payout-account.schemas';
import { PayoutAccountsService } from './payout-accounts.service';

@ApiTags('Payout accounts')
@ApiBearerAuth()
@Controller({ path: 'payout-accounts', version: '1' })
export class PayoutAccountsController {
  constructor(private readonly payoutAccounts: PayoutAccountsService) {}

  @Get('banks')
  banks() {
    return this.payoutAccounts.listBanks();
  }

  @Get('me')
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.payoutAccounts.getMine(user.userId);
  }

  @Put('me')
  save(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(savePayoutAccountSchema)) input: SavePayoutAccountRequest,
  ) {
    return this.payoutAccounts.saveMine(user.userId, input);
  }
}
