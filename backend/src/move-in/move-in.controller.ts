import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { MoveInService } from './move-in.service';
import { AdditionalIssueRequest, additionalIssueRequest, ChecklistRequest, checklistRequest, IssueActionRequest, issueActionRequest } from './move-in.schemas';
import { z } from 'zod';

const refundRequest = z.object({ reason: z.string().trim().min(3).max(4000) }).strict();
const evidenceRequest = z.object({ objectKey: z.string().trim().min(1).max(500), issueId: z.string().uuid().optional() }).strict();

@ApiTags('Move-in verification')
@ApiBearerAuth()
@Controller({ path: 'tenancies/:tenancyId/move-in', version: '1' })
export class MoveInController {
  constructor(private readonly service: MoveInService) {}
  @Get() get(@CurrentUser() user: AuthenticatedUser, @Param('tenancyId') id: string) { return this.service.get(user.userId, id); }
  @Post('handover') handover(@CurrentUser() user: AuthenticatedUser, @Param('tenancyId') id: string) { return this.service.confirmHandover(user.userId, id); }
  @Put('draft') draft(@CurrentUser() user: AuthenticatedUser, @Param('tenancyId') id: string, @Body(new ZodValidationPipe(checklistRequest)) input: ChecklistRequest) { return this.service.saveDraft(user.userId, id, input.answers); }
  @Post('submit') submit(@CurrentUser() user: AuthenticatedUser, @Param('tenancyId') id: string, @Body(new ZodValidationPipe(checklistRequest)) input: ChecklistRequest) { return this.service.submit(user.userId, id, input.answers); }
  @Post('issues/:issueId/actions') issue(@CurrentUser() user: AuthenticatedUser, @Param('tenancyId') id: string, @Param('issueId') issueId: string, @Body(new ZodValidationPipe(issueActionRequest)) input: IssueActionRequest) { return this.service.updateIssue(user.userId, id, issueId, input.action, input.note); }
  @Post('issues') report(@CurrentUser() user: AuthenticatedUser, @Param('tenancyId') id: string, @Body(new ZodValidationPipe(additionalIssueRequest)) input: AdditionalIssueRequest) { return this.service.reportAdditionalIssue(user.userId, id, input.item, input.issueType, input.description); }
  @Post('refund-request') refund(@CurrentUser() user: AuthenticatedUser, @Param('tenancyId') id: string, @Body(new ZodValidationPipe(refundRequest)) input: z.infer<typeof refundRequest>) { return this.service.requestRefund(user.userId, id, input.reason); }
  @Post('evidence') evidence(@CurrentUser() user: AuthenticatedUser, @Param('tenancyId') id: string, @Body(new ZodValidationPipe(evidenceRequest)) input: z.infer<typeof evidenceRequest>) { return this.service.attachEvidence(user.userId, id, input.objectKey, input.issueId); }
  @Get('evidence/:evidenceId') download(@CurrentUser() user: AuthenticatedUser, @Param('tenancyId') id: string, @Param('evidenceId') evidenceId: string) { return this.service.evidenceDownload(user.userId, id, evidenceId); }
}
