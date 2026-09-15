import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { TenancyQuery, tenancyQuerySchema } from './dto/tenancy.schemas';
import { TenanciesService } from './tenancies.service';

@ApiTags('Tenancies')
@ApiBearerAuth()
@Controller({ path: 'tenancies', version: '1' })
export class TenanciesController {
  constructor(private readonly tenanciesService: TenanciesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(tenancyQuerySchema)) query: TenancyQuery) {
    return this.tenanciesService.list(user.userId, query);
  }

  @Post(':tenancyId/activate')
  activate(@CurrentUser() user: AuthenticatedUser, @Param('tenancyId') tenancyId: string) {
    return this.tenanciesService.activate(user.userId, tenancyId);
  }

  @Post(':tenancyId/complete')
  complete(@CurrentUser() user: AuthenticatedUser, @Param('tenancyId') tenancyId: string) {
    return this.tenanciesService.complete(user.userId, tenancyId);
  }
}
