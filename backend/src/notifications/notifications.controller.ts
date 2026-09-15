import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { NotificationQuery, notificationQuerySchema, UpdatePreferencesRequest, updatePreferencesSchema } from './dto/notification.schemas';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(notificationQuerySchema)) query: NotificationQuery) {
    return this.notificationsService.list(user.userId, query);
  }

  @Patch(':notificationId/read')
  @HttpCode(204)
  async markRead(@CurrentUser() user: AuthenticatedUser, @Param('notificationId') notificationId: string): Promise<void> {
    await this.notificationsService.markRead(user.userId, notificationId);
  }

  @Post('read-all')
  @HttpCode(204)
  async markAllRead(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.notificationsService.markAllRead(user.userId);
  }

  @Get('preferences')
  preferences(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.getPreferences(user.userId);
  }

  @Patch('preferences')
  updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updatePreferencesSchema)) input: UpdatePreferencesRequest,
  ) {
    return this.notificationsService.updatePreferences(user.userId, input);
  }
}
