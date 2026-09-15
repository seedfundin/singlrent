import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PermissionKey } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { CreateIncidentRequest, createIncidentSchema, IncidentQuery, incidentQuerySchema, InvestigateIncidentRequest, investigateIncidentSchema, ResolveIncidentRequest, resolveIncidentSchema } from './dto/incident.schemas';
import { IncidentsService } from './incidents.service';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller({ path: 'reports', version: '1' })
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(createIncidentSchema)) input: CreateIncidentRequest) {
    return this.incidentsService.create(user.userId, input);
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(incidentQuerySchema)) query: IncidentQuery) {
    return this.incidentsService.mine(user.userId, query);
  }

  @Get('admin')
  @RequirePermissions(PermissionKey.REPORTS_VIEW)
  adminList(@Query(new ZodValidationPipe(incidentQuerySchema)) query: IncidentQuery) {
    return this.incidentsService.adminList(query);
  }

  @Patch(':incidentId/investigate')
  @RequirePermissions(PermissionKey.REPORTS_INVESTIGATE)
  investigate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('incidentId') incidentId: string,
    @Body(new ZodValidationPipe(investigateIncidentSchema)) input: InvestigateIncidentRequest,
  ) {
    return this.incidentsService.investigate(user.userId, incidentId, input);
  }

  @Patch(':incidentId/resolve')
  @RequirePermissions(PermissionKey.REPORTS_RESOLVE)
  resolve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('incidentId') incidentId: string,
    @Body(new ZodValidationPipe(resolveIncidentSchema)) input: ResolveIncidentRequest,
  ) {
    return this.incidentsService.resolve(user.userId, incidentId, input);
  }
}
