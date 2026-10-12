import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { CreateListingRequest, createListingSchema, ListingQuery, listingQuerySchema, UpdateListingRequest, updateListingSchema } from './dto/listing.schemas';
import { ListingsService } from './listings.service';

@ApiTags('Listings')
@Controller({ path: 'listings', version: '1' })
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  @Public()
  @Get()
  search(@Query(new ZodValidationPipe(listingQuerySchema)) query: ListingQuery) {
    return this.listingsService.search(query);
  }

  @ApiBearerAuth()
  @Get('mine')
  mine(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(listingQuerySchema)) query: ListingQuery) {
    return this.listingsService.getMine(user.userId, query);
  }

  @ApiBearerAuth()
  @Get('mine/:idOrSlug')
  managedDetail(@CurrentUser() user: AuthenticatedUser, @Param('idOrSlug') idOrSlug: string) {
    return this.listingsService.getManagedById(user.userId, idOrSlug);
  }

  @ApiBearerAuth()
  @Get('saved')
  saved(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(listingQuerySchema)) query: ListingQuery) {
    return this.listingsService.saved(user.userId, query);
  }

  @Public()
  @Get(':idOrSlug/pricing')
  pricing(@Param('idOrSlug') idOrSlug: string) {
    return this.listingsService.publicPricing(idOrSlug);
  }

  @Public()
  @Get(':idOrSlug')
  detail(@Param('idOrSlug') idOrSlug: string) {
    return this.listingsService.getByPublicId(idOrSlug);
  }

  @ApiBearerAuth()
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(createListingSchema)) input: CreateListingRequest) {
    return this.listingsService.create(user.userId, input);
  }

  @ApiBearerAuth()
  @Patch(':listingId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('listingId') listingId: string,
    @Body(new ZodValidationPipe(updateListingSchema)) input: UpdateListingRequest,
  ) {
    return this.listingsService.update(user.userId, listingId, input);
  }

  @ApiBearerAuth()
  @Post(':listingId/publish')
  publish(@CurrentUser() user: AuthenticatedUser, @Param('listingId') listingId: string) {
    return this.listingsService.publish(user.userId, listingId);
  }

  @ApiBearerAuth()
  @Post(':listingId/submit')
  submitLegacy(@CurrentUser() user: AuthenticatedUser, @Param('listingId') listingId: string) {
    // Kept for compatibility with older clients. It now publishes an eligible
    // saved listing immediately instead of adding it to an admin queue.
    return this.listingsService.publish(user.userId, listingId);
  }

  @ApiBearerAuth()
  @Delete(':listingId/media/:mediaId')
  @HttpCode(204)
  async removeMedia(
    @CurrentUser() user: AuthenticatedUser,
    @Param('listingId') listingId: string,
    @Param('mediaId') mediaId: string,
  ): Promise<void> {
    await this.listingsService.removeMedia(user.userId, listingId, mediaId);
  }

  @ApiBearerAuth()
  @Post(':listingId/save')
  @HttpCode(204)
  async save(@CurrentUser() user: AuthenticatedUser, @Param('listingId') listingId: string): Promise<void> {
    await this.listingsService.save(user.userId, listingId);
  }

  @ApiBearerAuth()
  @Delete(':listingId/save')
  @HttpCode(204)
  async unsave(@CurrentUser() user: AuthenticatedUser, @Param('listingId') listingId: string): Promise<void> {
    await this.listingsService.unsave(user.userId, listingId);
  }

  @ApiBearerAuth()
  @Delete(':listingId')
  @HttpCode(204)
  async archive(@CurrentUser() user: AuthenticatedUser, @Param('listingId') listingId: string): Promise<void> {
    await this.listingsService.archive(user.userId, listingId);
  }
}
