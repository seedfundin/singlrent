import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PermissionKey, RoleCode } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import {
  AcceptAdminInvitationRequest,
  acceptAdminInvitationSchema,
  AdminUserQuery,
  adminUserQuerySchema,
  AssignRoleRequest,
  assignRoleSchema,
  CreateAdminInvitationRequest,
  createAdminInvitationSchema,
  ModerateListingRequest,
  moderateListingSchema,
  ReviewKycRequest,
  reviewKycSchema,
  UpdatePermissionsRequest,
  updatePermissionsSchema,
  UpdateUserStatusRequest,
  updateUserStatusSchema,
} from './dto/admin.schemas';
import { AdminService } from './admin.service';

@ApiTags('Administration')
@ApiBearerAuth()
@Controller({ path: 'admin', version: '1' })
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Public()
  @Post('invitations/accept')
  acceptInvitation(@Body(new ZodValidationPipe(acceptAdminInvitationSchema)) input: AcceptAdminInvitationRequest) {
    return this.adminService.acceptInvitation(input);
  }

  @Get('users')
  @RequirePermissions(PermissionKey.USERS_VIEW)
  users(@Query(new ZodValidationPipe(adminUserQuerySchema)) query: AdminUserQuery) {
    return this.adminService.listUsers(query);
  }

  @Patch('users/:userId/status')
  @RequirePermissions(PermissionKey.USERS_SUSPEND)
  updateUserStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(updateUserStatusSchema)) input: UpdateUserStatusRequest,
  ) {
    return this.adminService.updateUserStatus(user.userId, userId, input);
  }

  @Roles(RoleCode.SUPER_ADMIN)
  @Post('users/:userId/roles')
  assignRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(assignRoleSchema)) input: AssignRoleRequest,
  ) {
    return this.adminService.assignRole(user.userId, userId, input);
  }

  @Roles(RoleCode.SUPER_ADMIN)
  @Patch('users/:userId/permissions')
  updatePermissions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(updatePermissionsSchema)) input: UpdatePermissionsRequest,
  ) {
    return this.adminService.setDirectPermissions(user.userId, userId, input);
  }

  @Roles(RoleCode.SUPER_ADMIN)
  @Post('invitations')
  createInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createAdminInvitationSchema)) input: CreateAdminInvitationRequest,
  ) {
    return this.adminService.createInvitation(user.userId, input);
  }

  @Get('kyc')
  @RequirePermissions(PermissionKey.KYC_VIEW)
  kyc(@Query(new ZodValidationPipe(adminUserQuerySchema)) query: AdminUserQuery) {
    return this.adminService.listUsers(query);
  }

  @Post('kyc/:userId/review')
  @RequirePermissions(PermissionKey.KYC_REVIEW)
  reviewKyc(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(reviewKycSchema)) input: ReviewKycRequest,
  ) {
    return this.adminService.reviewKyc(user.userId, userId, input);
  }

  @Post('listings/:listingId/approve')
  @RequirePermissions(PermissionKey.LISTINGS_APPROVE)
  approveListing(@CurrentUser() user: AuthenticatedUser, @Param('listingId') listingId: string, @Body(new ZodValidationPipe(moderateListingSchema)) input: ModerateListingRequest) {
    return this.adminService.moderateListing(user.userId, listingId, 'approve', input);
  }

  @Post('listings/:listingId/reject')
  @RequirePermissions(PermissionKey.LISTINGS_REJECT)
  rejectListing(@CurrentUser() user: AuthenticatedUser, @Param('listingId') listingId: string, @Body(new ZodValidationPipe(moderateListingSchema)) input: ModerateListingRequest) {
    return this.adminService.moderateListing(user.userId, listingId, 'reject', input);
  }

  @Post('listings/:listingId/suspend')
  @RequirePermissions(PermissionKey.LISTINGS_SUSPEND)
  suspendListing(@CurrentUser() user: AuthenticatedUser, @Param('listingId') listingId: string, @Body(new ZodValidationPipe(moderateListingSchema)) input: ModerateListingRequest) {
    return this.adminService.moderateListing(user.userId, listingId, 'suspend', input);
  }

  @Get('audit-logs')
  @RequirePermissions(PermissionKey.AUDIT_LOGS_VIEW)
  auditLogs(@Query(new ZodValidationPipe(adminUserQuerySchema)) query: AdminUserQuery) {
    return this.adminService.listAuditLogs(query);
  }
}
