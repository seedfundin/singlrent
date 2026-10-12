import { Module } from '@nestjs/common';
import { ListingsModule } from '../listings/listings.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { PropertyAiService } from './property-ai.service';

@Module({
  imports: [ListingsModule, NotificationsModule, WebsocketModule],
  controllers: [ConversationsController],
  providers: [ConversationsService, PropertyAiService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
