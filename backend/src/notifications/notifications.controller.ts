import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { NotificationQuery, notificationQuerySchema, UpdatePreferencesRequest, updatePreferencesSchema } from './dto/notification.schemas';
import { NotificationsService } from './notifications.service';
import { PushDevicesService } from './push-devices.service';
import { z } from 'zod';

const pushDeviceSchema = z.union([
  z.object({ token: z.string().min(1).max(4096), label: z.string().trim().max(120).optional() }).strict(),
  z.object({ provider: z.literal('WEB_PUSH'), subscription: z.object({ endpoint: z.string().url().max(4096), keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(200) }).strict() }).strict(), label: z.string().trim().max(120).optional() }).strict(),
]);

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService, private readonly devices: PushDevicesService) {}

  @Get('devices')
  listDevices(@CurrentUser() user: AuthenticatedUser) { return this.devices.list(user.userId); }

  @Post('devices')
  registerDevice(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(pushDeviceSchema)) input: z.infer<typeof pushDeviceSchema>) { return this.devices.register(user.userId, input); }

  @Delete('devices/:id')
  @HttpCode(204)
  async removeDevice(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { await this.devices.remove(user.userId, id); }

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

  @Get(':notificationId')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('notificationId') notificationId: string) {
    return this.notificationsService.getOne(user.userId, notificationId);
  }

  @Patch('preferences')
  updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updatePreferencesSchema)) input: UpdatePreferencesRequest,
  ) {
    return this.notificationsService.updatePreferences(user.userId, input);
  }
}
