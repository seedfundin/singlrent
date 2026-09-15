import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PermissionKey } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { CreateReviewRequest, createReviewSchema, ModerateReviewRequest, moderateReviewSchema, ReviewQuery, reviewQuerySchema } from './dto/review.schemas';
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
}
