import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { DojahVerificationService } from './dojah-verification.service';
import { PublisherVerificationService } from './publisher-verification.service';
import { UsersController } from './users.controller';
import { KycService } from './kyc.service';
import { UsersService } from './users.service';

@Module({
  imports: [IntegrationsModule],
  controllers: [UsersController],
  providers: [UsersService, KycService, DojahVerificationService, PublisherVerificationService],
  exports: [UsersService, KycService, PublisherVerificationService],
})
export class UsersModule {}
