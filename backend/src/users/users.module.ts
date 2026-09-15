import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { KycService } from './kyc.service';
import { NimcVerificationService } from './nimc-verification.service';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, KycService, NimcVerificationService],
  exports: [UsersService, KycService],
})
export class UsersModule {}
