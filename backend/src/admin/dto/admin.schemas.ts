import { PermissionEffect, PermissionKey, RoleCode, UserStatus } from '@prisma/client';
import { z } from 'zod';
import { paginationQuerySchema } from '../../common/http/pagination';

const passwordSchema = z.string().min(12).max(128);

export const adminUserQuerySchema = paginationQuerySchema.extend({
  role: z.nativeEnum(RoleCode).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  search: z.string().trim().max(320).optional(),
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
  rejectionReason: z.string().trim().min(3).max(1000).optional(),
});
export const moderateListingSchema = z.object({ note: z.string().trim().min(3).max(1000).optional() });

export type AdminUserQuery = z.infer<typeof adminUserQuerySchema>;
export type UpdateUserStatusRequest = z.infer<typeof updateUserStatusSchema>;
export type AssignRoleRequest = z.infer<typeof assignRoleSchema>;
export type UpdatePermissionsRequest = z.infer<typeof updatePermissionsSchema>;
export type CreateAdminInvitationRequest = z.infer<typeof createAdminInvitationSchema>;
export type AcceptAdminInvitationRequest = z.infer<typeof acceptAdminInvitationSchema>;
export type ReviewKycRequest = z.infer<typeof reviewKycSchema>;
export type ModerateListingRequest = z.infer<typeof moderateListingSchema>;
