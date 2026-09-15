import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { ApplicationQuery, applicationQuerySchema, CreateApplicationRequest, createApplicationSchema, RejectApplicationRequest, rejectApplicationSchema } from './dto/application.schemas';
import { ApplicationsService } from './applications.service';

@ApiTags('Applications')
@ApiBearerAuth()
@Controller({ path: 'applications', version: '1' })
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(createApplicationSchema)) input: CreateApplicationRequest) {
    return this.applicationsService.create(user.userId, input);
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(applicationQuerySchema)) query: ApplicationQuery) {
    return this.applicationsService.mine(user.userId, query);
  }

  @Get('received')
  received(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(applicationQuerySchema)) query: ApplicationQuery) {
    return this.applicationsService.received(user.userId, query);
  }

  @Post(':applicationId/approve')
  approve(@CurrentUser() user: AuthenticatedUser, @Param('applicationId') applicationId: string) {
    return this.applicationsService.approveForPayment(user.userId, applicationId);
  }

  @Post(':applicationId/reject')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('applicationId') applicationId: string,
    @Body(new ZodValidationPipe(rejectApplicationSchema)) input: RejectApplicationRequest,
  ) {
    return this.applicationsService.reject(user.userId, applicationId, input);
  }

  @Post(':applicationId/cancel')
  @HttpCode(204)
  async cancel(@CurrentUser() user: AuthenticatedUser, @Param('applicationId') applicationId: string): Promise<void> {
    await this.applicationsService.cancel(user.userId, applicationId);
  }
}
