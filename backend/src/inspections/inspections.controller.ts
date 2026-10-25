import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { availabilitySchema, AvailabilityInput, bookingSchema, BookingInput, proposalSchema } from './inspection.schemas';
import { InspectionsService } from './inspections.service';

@Controller({ path: 'inspections', version: '1' })
export class InspectionsController {
  constructor(private readonly inspections: InspectionsService) {}
  @Public() @Get('listings/:listingId/slots') slots(@Param('listingId') id: string) { return this.inspections.slots(id); }
  @Get('listings/:listingId/availability') availability(@CurrentUser() user: AuthenticatedUser, @Param('listingId') id: string) { return this.inspections.getAvailability(user.userId, id); }
  @Put('listings/:listingId/availability') save(@CurrentUser() user: AuthenticatedUser, @Param('listingId') id: string, @Body(new ZodValidationPipe(availabilitySchema)) input: AvailabilityInput) { return this.inspections.saveAvailability(user.userId, id, input); }
  @Post('listings/:listingId/bookings') book(@CurrentUser() user: AuthenticatedUser, @Param('listingId') id: string, @Body(new ZodValidationPipe(bookingSchema)) input: BookingInput) { return this.inspections.book(user.userId, id, input); }
  @Get() list(@CurrentUser() user: AuthenticatedUser) { return this.inspections.list(user.userId); }
  @Post(':id/approve') approve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.inspections.action(user.userId, id, 'approve'); }
  @Post(':id/decline') decline(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.inspections.action(user.userId, id, 'decline'); }
  @Post(':id/cancel') cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.inspections.action(user.userId, id, 'cancel'); }
  @Post(':id/complete') complete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.inspections.action(user.userId, id, 'complete'); }
  @Post(':id/confirm-attendance') confirmAttendance(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.inspections.action(user.userId, id, 'confirm-attendance'); }
  @Post(':id/dispute-attendance') disputeAttendance(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.inspections.action(user.userId, id, 'dispute-attendance'); }
  @Post(':id/propose') propose(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body(new ZodValidationPipe(proposalSchema)) input: { startsAt: string }) { return this.inspections.action(user.userId, id, 'propose', input.startsAt); }
  @Post(':id/accept-proposal') accept(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.inspections.action(user.userId, id, 'accept-proposal'); }
  @Post(':id/reject-proposal') reject(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.inspections.action(user.userId, id, 'reject-proposal'); }
}
