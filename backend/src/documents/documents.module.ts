import { Module } from '@nestjs/common';
import { AgreementsService } from './agreements.service';
import { AgreementsController, ReceiptsController } from './documents.controller';
import { ReceiptsService } from './receipts.service';
import { GuarantorFormsService } from './guarantor-forms.service';
import { MediaModule } from '../media/media.module';

@Module({
  controllers: [AgreementsController, ReceiptsController],
  imports: [MediaModule],
  providers: [AgreementsService, GuarantorFormsService, ReceiptsService],
  exports: [AgreementsService, GuarantorFormsService, ReceiptsService],
})
export class DocumentsModule {}
