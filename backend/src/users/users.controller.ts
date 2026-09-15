import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import {
  ConfirmPhoneVerificationRequest,
  confirmPhoneVerificationSchema,
  SendPhoneVerificationRequest,
  sendPhoneVerificationSchema,
  SubmitNinRequest,
  submitNinSchema,
  UpdateProfileRequest,
  updateProfileSchema,
} from './dto/user.schemas';
import { KycService } from './kyc.service';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly kycService: KycService,
  ) {}

  @Get('me/profile')
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getProfile(user.userId);
  }

  @Patch('me/profile')
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) input: UpdateProfileRequest,
  ) {
    return this.usersService.updateProfile(user.userId, input);
  }

  @Post('me/phone-verification')
  sendPhoneVerification(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(sendPhoneVerificationSchema)) input: SendPhoneVerificationRequest,
  ) {
    return this.kycService.sendPhoneChallenge(user.userId, input);
  }

  @Post('me/phone-verification/confirm')
  confirmPhoneVerification(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(confirmPhoneVerificationSchema)) input: ConfirmPhoneVerificationRequest,
  ) {
    return this.kycService.confirmPhoneChallenge(user.userId, input);
  }

  @Post('me/kyc/nin')
  submitNin(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(submitNinSchema)) input: SubmitNinRequest,
  ) {
    return this.kycService.submitNin(user.userId, input);
  }
}
