import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { CreateMaintenanceRequest, createMaintenanceSchema, MaintenanceQuery, maintenanceQuerySchema, UpdateMaintenanceRequest, updateMaintenanceSchema } from './dto/maintenance.schemas';
import { MaintenanceService } from './maintenance.service';

@ApiTags('Maintenance')
@ApiBearerAuth()
@Controller({ path: 'maintenance', version: '1' })
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(maintenanceQuerySchema)) query: MaintenanceQuery) {
    return this.maintenanceService.list(user.userId, query);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(createMaintenanceSchema)) input: CreateMaintenanceRequest) {
    return this.maintenanceService.create(user.userId, input);
  }

  @Get(':requestId')
  get(@CurrentUser() user: AuthenticatedUser, @Param('requestId') requestId: string) {
    return this.maintenanceService.get(user.userId, requestId);
  }

  @Patch(':requestId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
    @Body(new ZodValidationPipe(updateMaintenanceSchema)) input: UpdateMaintenanceRequest,
  ) {
    return this.maintenanceService.update(user.userId, requestId, input);
  }
}
