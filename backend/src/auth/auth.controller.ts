import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { AuthService, AuthSession } from './auth.service';
import {
  LoginRequest,
  GoogleAuthRequest,
  googleAuthSchema,
  loginSchema,
  LogoutRequest,
  logoutSchema,
  RefreshRequest,
  refreshSchema,
  RegisterRequest,
  registerSchema,
  ConfirmEmailVerificationRequest,
  confirmEmailVerificationSchema,
} from './dto/auth.schemas';

@ApiTags('Authentication')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Create a tenant, landlord, or agent account' })
  @ApiResponse({ status: 201, description: 'Account and token session created.' })
  register(
    @Body(new ZodValidationPipe(registerSchema)) input: RegisterRequest,
    @Req() request: Request,
  ): Promise<AuthSession> {
    return this.authService.register(input, request);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sign in with email and password' })
  login(
    @Body(new ZodValidationPipe(loginSchema)) input: LoginRequest,
    @Req() request: Request,
  ): Promise<AuthSession> {
    return this.authService.login(input, request);
  }

  @Public()
  @Post('google')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sign in or sign up with a verified Google ID token' })
  google(
    @Body(new ZodValidationPipe(googleAuthSchema)) input: GoogleAuthRequest,
    @Req() request: Request,
  ): Promise<AuthSession> {
    return this.authService.google(input, request);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate a refresh token and issue a new session' })
  refresh(
    @Body(new ZodValidationPipe(refreshSchema)) input: RefreshRequest,
    @Req() request: Request,
  ): Promise<AuthSession> {
    return this.authService.refresh(input, request);
  }

  @Post('logout')
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke the current refresh token' })
  async logout(
    @Body(new ZodValidationPipe(logoutSchema)) input: LogoutRequest,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<void> {
    await this.authService.logout(input, currentUser);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Return the authenticated user' })
  me(@CurrentUser() currentUser: AuthenticatedUser): Promise<AuthSession['user']> {
    return this.authService.me(currentUser);
  }

  @Post('email-verification')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirm the email OTP issued after registration' })
  confirmEmailVerification(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(new ZodValidationPipe(confirmEmailVerificationSchema)) input: ConfirmEmailVerificationRequest,
  ) {
    return this.authService.confirmEmailVerification(currentUser, input);
  }

  @Post('email-verification/resend')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Issue a replacement email verification OTP' })
  resendEmailVerification(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.authService.resendEmailVerification(currentUser);
  }
}
