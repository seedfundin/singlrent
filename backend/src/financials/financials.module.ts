import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { LedgerService } from './ledger.service';
import { PayoutExecutionService } from './payout-execution.service';
import { PricingService } from './pricing.service';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [IntegrationsModule, DocumentsModule],
  providers: [PricingService, LedgerService, PayoutExecutionService],
  exports: [PricingService, LedgerService, PayoutExecutionService],
})
export class FinancialsModule {}
