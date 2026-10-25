import { Module } from '@nestjs/common';
import { FinancialsModule } from '../financials/financials.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { JobsModule } from '../jobs/jobs.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { UsersModule } from '../users/users.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';
import { PayoutAccountsController } from './payout-accounts.controller';
import { PayoutAccountsService } from './payout-accounts.service';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [FinancialsModule, IntegrationsModule, JobsModule, NotificationsModule, WebsocketModule, UsersModule, DocumentsModule],
  controllers: [PaymentsController, PayoutsController, PayoutAccountsController],
  providers: [PaymentsService, PayoutsService, PayoutAccountsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
