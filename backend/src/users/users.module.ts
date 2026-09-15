import { Module } from '@nestjs/common';
import { DojahVerificationService } from './dojah-verification.service';
import { UsersController } from './users.controller';
import { KycService } from './kyc.service';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, KycService, DojahVerificationService],
  exports: [UsersService, KycService],
})
export class UsersModule {}
