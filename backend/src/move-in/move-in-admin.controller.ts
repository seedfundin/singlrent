import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PermissionKey } from '@prisma/client';
import { z } from 'zod';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { MoveInService } from './move-in.service';

const decisionSchema = z.object({ reason: z.string().trim().min(3).max(4000) }).strict();
const classificationSchema = decisionSchema.extend({ severity: z.enum(['MINOR', 'MAJOR', 'CRITICAL']) });

@ApiTags('Administration: move-in verification')
@ApiBearerAuth()
@Controller({ path: 'admin/move-in', version: '1' })
export class MoveInAdminController {
  constructor(private readonly service: MoveInService) {}
  @Get() @RequirePermissions(PermissionKey.TRANSACTIONS_VIEW)
  list() { return this.service.adminList(); }
  @Get(':tenancyId/evidence/:evidenceId') @RequirePermissions(PermissionKey.TRANSACTIONS_VIEW)
  evidence(@CurrentUser() user: AuthenticatedUser, @Param('tenancyId') tenancyId: string, @Param('evidenceId') evidenceId: string) { return this.service.evidenceDownload(user.userId, tenancyId, evidenceId, true); }
  @Post(':tenancyId/issues/:issueId/resolve') @RequirePermissions(PermissionKey.ESCROW_MANAGE)
  resolve(@CurrentUser() user: AuthenticatedUser, @Param('tenancyId') tenancyId: string, @Param('issueId') issueId: string, @Body(new ZodValidationPipe(decisionSchema)) input: z.infer<typeof decisionSchema>) {
    return this.service.resolveIssueByAdmin(user.userId, tenancyId, issueId, input.reason);
  }
  @Post(':tenancyId/issues/:issueId/reclassify') @RequirePermissions(PermissionKey.ESCROW_MANAGE)
  reclassify(@CurrentUser() user: AuthenticatedUser, @Param('tenancyId') tenancyId: string, @Param('issueId') issueId: string, @Body(new ZodValidationPipe(classificationSchema)) input: z.infer<typeof classificationSchema>) {
    return this.service.reclassifyIssue(user.userId, tenancyId, issueId, input.severity, input.reason);
  }
  @Post(':tenancyId/refunds/:requestId/reject') @RequirePermissions(PermissionKey.REFUNDS_PROCESS)
  reject(@CurrentUser() user: AuthenticatedUser, @Param('tenancyId') tenancyId: string, @Param('requestId') requestId: string, @Body(new ZodValidationPipe(decisionSchema)) input: z.infer<typeof decisionSchema>) {
    return this.service.rejectRefund(user.userId, tenancyId, requestId, input.reason);
  }
}
