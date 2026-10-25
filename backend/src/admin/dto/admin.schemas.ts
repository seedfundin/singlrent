import { ListingStatus, MaintenanceStatus, PaymentStatus, PermissionEffect, PermissionKey, RoleCode, UserStatus } from '@prisma/client';
import { z } from 'zod';
import { paginationQuerySchema } from '../../common/http/pagination';

const passwordSchema = z.string().min(12).max(128);

export const adminUserQuerySchema = paginationQuerySchema.extend({
  role: z.nativeEnum(RoleCode).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  search: z.string().trim().max(320).optional(),
});
export const adminListingQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(ListingStatus).optional(),
});
export const adminTransactionQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(PaymentStatus).optional(),
  // Searches the shared SingleRent reference first, then the related payment-provider
  // collection/transfer references and the transaction participants.
  search: z.string().trim().min(1).max(180).optional(),
});
export const adminMaintenanceQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(MaintenanceStatus).optional(),
});
export const updateUserStatusSchema = z.object({ status: z.nativeEnum(UserStatus) });
export const assignRoleSchema = z.object({ role: z.nativeEnum(RoleCode) });
export const updatePermissionsSchema = z.object({
  permissions: z.array(z.object({ key: z.nativeEnum(PermissionKey), effect: z.nativeEnum(PermissionEffect) })).max(100),
});
export const createAdminInvitationSchema = z.object({
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  role: z.enum([RoleCode.ADMIN, RoleCode.SUPER_ADMIN]).default(RoleCode.ADMIN),
  adminTitle: z.string().trim().max(150).optional(),
});
export const acceptAdminInvitationSchema = z
  .object({
    token: z.string().min(30).max(200),
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    password: passwordSchema,
    confirmPassword: passwordSchema,
  })
  .superRefine(({ password, confirmPassword }, context) => {
    if (password !== confirmPassword) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['confirmPassword'], message: 'Passwords do not match' });
    }
  });
export const reviewKycSchema = z.object({
  approved: z.boolean(),
  // Approval is available only for a provider-confirmed record held because
  // the account name differs. Administrators must leave an audit note.
  reviewNote: z.string().trim().min(3).max(1000).optional(),
  // Retained temporarily for older clients that submit a decline reason.
  rejectionReason: z.string().trim().min(3).max(1000).optional(),
});
export const reviewPublisherVerificationSchema = reviewKycSchema;
export const moderateListingSchema = z.object({ note: z.string().trim().min(3).max(1000).optional() });
export const adminRefundSchema = z.object({
  scope: z.enum(['RENT', 'CAUTION']),
  amountKobo: z.string().regex(/^\d+$/).max(18),
  reason: z.string().trim().min(3).max(1000),
});
export const adminCautionDisputeResolutionSchema = z.object({
  outcome: z.enum(['RETURN_TO_TENANT', 'PAY_LANDLORD']),
  note: z.string().trim().min(3).max(1000),
});

export type AdminUserQuery = z.infer<typeof adminUserQuerySchema>;
export type AdminListingQuery = z.infer<typeof adminListingQuerySchema>;
export type AdminTransactionQuery = z.infer<typeof adminTransactionQuerySchema>;
export type AdminMaintenanceQuery = z.infer<typeof adminMaintenanceQuerySchema>;
export type UpdateUserStatusRequest = z.infer<typeof updateUserStatusSchema>;
export type AssignRoleRequest = z.infer<typeof assignRoleSchema>;
export type UpdatePermissionsRequest = z.infer<typeof updatePermissionsSchema>;
export type CreateAdminInvitationRequest = z.infer<typeof createAdminInvitationSchema>;
export type AcceptAdminInvitationRequest = z.infer<typeof acceptAdminInvitationSchema>;
export type ReviewKycRequest = z.infer<typeof reviewKycSchema>;
export type ReviewPublisherVerificationRequest = z.infer<typeof reviewPublisherVerificationSchema>;
export type ModerateListingRequest = z.infer<typeof moderateListingSchema>;
export type AdminRefundRequest = z.infer<typeof adminRefundSchema>;
export type AdminCautionDisputeResolutionRequest = z.infer<typeof adminCautionDisputeResolutionSchema>;
