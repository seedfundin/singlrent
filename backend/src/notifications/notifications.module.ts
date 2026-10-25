import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushDevicesService } from './push-devices.service';

@Module({
  imports: [WebsocketModule, JobsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, PushDevicesService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
