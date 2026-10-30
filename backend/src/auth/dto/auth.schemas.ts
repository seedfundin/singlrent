import { RoleCode } from "@prisma/client";
import { z } from "zod";

const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(128, "Password must be at most 128 characters");

const phoneSchema = z
  .string()
  .trim()
  .regex(
    /^\+[1-9]\d{7,14}$/,
    "Use an international phone number, for example +2348012345678",
  );
const optionalEmailSchema = z.preprocess(
  (value) => (typeof value === "string" && !value.trim() ? undefined : value),
  z
    .string()
    .trim()
    .email()
    .max(320)
    .transform((value) => value.toLowerCase())
    .optional(),
);

const dateOfBirthSchema = z.coerce
  .date()
  .refine(
    (value) =>
      value >= new Date("1900-01-01T00:00:00.000Z") && value <= new Date(),
    "Enter a valid date of birth",
  );

function requireAdultAgent(
  value: { role: RoleCode; dateOfBirth?: Date },
  context: z.RefinementCtx,
) {
  if (value.role !== RoleCode.AGENT) return;
  if (!value.dateOfBirth) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["dateOfBirth"],
      message: "Agents must provide a date of birth",
    });
    return;
  }
  const threshold = new Date();
  threshold.setHours(0, 0, 0, 0);
  threshold.setFullYear(threshold.getFullYear() - 18);
  if (value.dateOfBirth > threshold) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["dateOfBirth"],
      message: "You must be at least 18 years old to register as an agent",
    });
  }
}

export const registerSchema = z
  .object({
    email: optionalEmailSchema,
    phone: phoneSchema,
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    password: passwordSchema,
    confirmPassword: passwordSchema,
    role: z
      .enum([RoleCode.TENANT, RoleCode.LANDLORD, RoleCode.AGENT])
      .default(RoleCode.TENANT),
    dateOfBirth: dateOfBirthSchema.optional(),
  })
  .superRefine(({ password, confirmPassword, role, dateOfBirth }, context) => {
    if (password !== confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match",
      });
    }
    requireAdultAgent({ role, dateOfBirth }, context);
  });

export const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(320),
  password: z.string().min(1).max(128),
});

export const googleAuthSchema = z
  .object({
    idToken: z.string().min(100).max(10_000),
    phone: phoneSchema.optional(),
    role: z
      .enum([RoleCode.TENANT, RoleCode.LANDLORD, RoleCode.AGENT])
      .default(RoleCode.TENANT),
    dateOfBirth: dateOfBirthSchema.optional(),
  })
  .superRefine(requireAdultAgent);

export const refreshSchema = z.object({
  refreshToken: z.string().min(32).max(512),
});

export const logoutSchema = refreshSchema;

export const confirmPhoneVerificationSchema = z.object({
  challengeId: z.string().uuid(),
  code: z
    .string()
    .regex(/^\d{6}$/, "Enter the six-digit phone verification code"),
});

export const issuePhoneVerificationSchema = z.object({
  phone: phoneSchema.optional(),
});

export const requestPasswordResetSchema = z.object({
  phone: phoneSchema,
});

export const confirmPasswordResetSchema = z
  .object({
    phone: phoneSchema,
    challengeId: z.string().uuid(),
    code: z
      .string()
      .regex(/^\d{6}$/, "Enter the six-digit password reset code"),
    password: passwordSchema,
    confirmPassword: passwordSchema,
  })
  .superRefine(({ password, confirmPassword }, context) => {
    if (password !== confirmPassword)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match",
      });
  });

export const deactivateAccountSchema = z.object({
  currentPassword: z.string().min(1).max(128).optional(),
  confirmation: z.literal("DEACTIVATE"),
});

export type RegisterRequest = z.infer<typeof registerSchema>;
export type LoginRequest = z.infer<typeof loginSchema>;
export type GoogleAuthRequest = z.infer<typeof googleAuthSchema>;
export type RefreshRequest = z.infer<typeof refreshSchema>;
export type LogoutRequest = z.infer<typeof logoutSchema>;
export type ConfirmPhoneVerificationRequest = z.infer<
  typeof confirmPhoneVerificationSchema
>;
export type IssuePhoneVerificationRequest = z.infer<
  typeof issuePhoneVerificationSchema
>;
export type RequestPasswordResetRequest = z.infer<
  typeof requestPasswordResetSchema
>;
export type ConfirmPasswordResetRequest = z.infer<
  typeof confirmPasswordResetSchema
>;
export type DeactivateAccountRequest = z.infer<typeof deactivateAccountSchema>;
