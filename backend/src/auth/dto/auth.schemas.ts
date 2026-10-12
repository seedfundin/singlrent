import { RoleCode } from '@prisma/client';
import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(128, 'Password must be at most 128 characters');

export const registerSchema = z
  .object({
    email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    password: passwordSchema,
    confirmPassword: passwordSchema,
    role: z.enum([RoleCode.TENANT, RoleCode.LANDLORD, RoleCode.AGENT]).default(RoleCode.TENANT),
  })
  .superRefine(({ password, confirmPassword }, context) => {
    if (password !== confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmPassword'],
        message: 'Passwords do not match',
      });
    }
  });

export const loginSchema = z.object({
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});

export const googleAuthSchema = z.object({
  idToken: z.string().min(100).max(10_000),
  role: z.enum([RoleCode.TENANT, RoleCode.LANDLORD, RoleCode.AGENT]).default(RoleCode.TENANT),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(32).max(512),
});

export const logoutSchema = refreshSchema;

export const confirmEmailVerificationSchema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/, 'Enter the six-digit email verification code'),
});

export type RegisterRequest = z.infer<typeof registerSchema>;
export type LoginRequest = z.infer<typeof loginSchema>;
export type GoogleAuthRequest = z.infer<typeof googleAuthSchema>;
export type RefreshRequest = z.infer<typeof refreshSchema>;
export type LogoutRequest = z.infer<typeof logoutSchema>;
export type ConfirmEmailVerificationRequest = z.infer<typeof confirmEmailVerificationSchema>;
