import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PermissionKey } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { AdminReviewQuery, adminReviewQuerySchema, CreateReviewRequest, createReviewSchema, DisputeReviewRequest, disputeReviewSchema, ModerateReviewRequest, moderateReviewSchema, ReviewQuery, reviewQuerySchema, TenantReviewRecordQuery, tenantReviewRecordQuerySchema } from './dto/review.schemas';
import { ReviewsService } from './reviews.service';

@ApiTags('Reviews')
@Controller({ path: 'reviews', version: '1' })
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Public()
  @Get()
  list(@Query(new ZodValidationPipe(reviewQuerySchema)) query: ReviewQuery) {
    return this.reviewsService.list(query);
  }

  @Public()
  @Get('summary')
  summary(@Query(new ZodValidationPipe(reviewQuerySchema)) query: ReviewQuery) {
    return this.reviewsService.summary(query);
  }

  @ApiBearerAuth()
  @Get('mine')
  mine(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(adminReviewQuerySchema)) query: AdminReviewQuery) {
    return this.reviewsService.mine(user.userId, query);
  }

  @ApiBearerAuth()
  @Get('received')
  received(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(adminReviewQuerySchema)) query: AdminReviewQuery) {
    return this.reviewsService.received(user.userId, query);
  }

  @ApiBearerAuth()
  @Get('opportunities')
  opportunities(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(adminReviewQuerySchema)) query: AdminReviewQuery) {
    return this.reviewsService.opportunities(user.userId, query);
  }

  @ApiBearerAuth()
  @Get('inspection-opportunities')
  inspectionOpportunities(@CurrentUser() user: AuthenticatedUser) {
    return this.reviewsService.inspectionOpportunities(user.userId);
  }

  /** Private rental history for the landlord or agent handling this application. */
  @ApiBearerAuth()
  @Get('tenant-record/:applicationId')
  tenantRecord(
    @CurrentUser() user: AuthenticatedUser,
    @Param('applicationId') applicationId: string,
    @Query(new ZodValidationPipe(tenantReviewRecordQuerySchema)) query: TenantReviewRecordQuery,
  ) {
    return this.reviewsService.tenantRecord(user.userId, applicationId, query);
  }

  @ApiBearerAuth()
  @Get('admin')
  @RequirePermissions(PermissionKey.REVIEWS_VIEW)
  admin(@Query(new ZodValidationPipe(adminReviewQuerySchema)) query: AdminReviewQuery) {
    return this.reviewsService.adminList(query);
  }

  @ApiBearerAuth()
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(createReviewSchema)) input: CreateReviewRequest) {
    return this.reviewsService.create(user.userId, input);
  }

  @ApiBearerAuth()
  @Patch(':reviewId/moderation')
  @RequirePermissions(PermissionKey.REVIEWS_MODERATE)
  moderate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reviewId') reviewId: string,
    @Body(new ZodValidationPipe(moderateReviewSchema)) input: ModerateReviewRequest,
  ) {
    return this.reviewsService.moderate(user.userId, reviewId, input);
  }

  @ApiBearerAuth()
  @Post(':reviewId/dispute')
  dispute(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reviewId') reviewId: string,
    @Body(new ZodValidationPipe(disputeReviewSchema)) input: DisputeReviewRequest,
  ) {
    return this.reviewsService.dispute(user.userId, reviewId, input);
  }
}
