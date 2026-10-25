import { z } from 'zod';

const booleanFromEnvironment = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:3000'),
  SWAGGER_ENABLED: z.preprocess((value) => value ?? 'true', booleanFromEnvironment),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().min(2).default('1h'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  PASSWORD_HASH_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),
  MOVE_IN_WINDOW_HOURS: z.coerce.number().int().min(24).max(720).default(48),
  FIELD_ENCRYPTION_SECRET: z.string().min(32).default('local-development-field-encryption-secret-change-me'),
  PAYSTACK_SECRET_KEY: z.string().min(1).optional(),
  PAYSTACK_BASE_URL: z.string().url().default('https://api.paystack.co'),
  PAYSTACK_CALLBACK_URL: z.string().url().optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().min(1).optional(),
  CLOUDFLARE_R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  CLOUDFLARE_R2_BUCKET_NAME: z.string().min(1).optional(),
  CLOUDFLARE_R2_PRIVATE_BUCKET_NAME: z.string().min(1).optional(),
  CLOUDFLARE_R2_PUBLIC_URL: z.string().url().optional(),
  // Dojah API credentials are backend-only. The hosted publisher-verification
  // widget uses a separate browser-safe public key.
  DOJAH_BASE_URL: z.string().url().default('https://api.dojah.io'),
  DOJAH_APP_ID: z.string().min(1).optional(),
  DOJAH_SECRET_KEY: z.string().min(1).optional(),
  DOJAH_WEBHOOK_SECRET: z.string().min(1).optional(),
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_TOKEN_INFO_URL: z.string().url().default('https://oauth2.googleapis.com/tokeninfo'),
  EMAIL_PROVIDER: z.enum(['disabled', 'resend']).default('disabled'),
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().email().optional(),
  PUSH_NOTIFICATIONS_ENABLED: z.preprocess((value) => value ?? 'false', booleanFromEnvironment),
  PUSH_DEVICE_ENCRYPTION_KEY: z.string().min(32).optional(),
  FIREBASE_SERVER_PROJECT_ID: z.string().min(1).optional(),
  FIREBASE_CLIENT_EMAIL: z.string().email().optional(),
  FIREBASE_PRIVATE_KEY: z.string().min(1).optional(),
  WEB_PUSH_VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  WEB_PUSH_VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  WEB_PUSH_VAPID_SUBJECT: z.string().min(1).optional(),
}).superRefine((config, context) => {
  if (!config.PUSH_NOTIFICATIONS_ENABLED) return;
  if (!config.PUSH_DEVICE_ENCRYPTION_KEY) context.addIssue({ code: z.ZodIssueCode.custom, path: ['PUSH_DEVICE_ENCRYPTION_KEY'], message: 'Required when browser push is enabled' });
  const firebase = config.FIREBASE_SERVER_PROJECT_ID && config.FIREBASE_CLIENT_EMAIL && config.FIREBASE_PRIVATE_KEY;
  const web = config.WEB_PUSH_VAPID_PUBLIC_KEY && config.WEB_PUSH_VAPID_PRIVATE_KEY && config.WEB_PUSH_VAPID_SUBJECT;
  if (!firebase && !web) context.addIssue({ code: z.ZodIssueCode.custom, path: ['PUSH_NOTIFICATIONS_ENABLED'], message: 'Configure at least one complete push provider before enabling push' });
  if (config.WEB_PUSH_VAPID_SUBJECT && !/^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/.test(config.WEB_PUSH_VAPID_SUBJECT)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['WEB_PUSH_VAPID_SUBJECT'], message: 'Must be a mailto address or HTTPS URL' });
});

export type EnvironmentVariables = z.infer<typeof environmentSchema>;

export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  const parsed = environmentSchema.safeParse(config);

  if (!parsed.success) {
    const messages = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join(', ');
    throw new Error(`Invalid environment configuration: ${messages}`);
  }

  return parsed.data;
}
