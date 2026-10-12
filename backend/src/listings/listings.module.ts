import { Module } from '@nestjs/common';
import { FinancialsModule } from '../financials/financials.module';
import { MediaModule } from '../media/media.module';
import { UsersModule } from '../users/users.module';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';

@Module({
  imports: [UsersModule, MediaModule, FinancialsModule],
  controllers: [ListingsController],
  providers: [ListingsService],
  exports: [ListingsService],
})
export class ListingsModule {}
