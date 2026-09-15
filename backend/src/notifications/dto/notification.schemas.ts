import { NotificationChannel, NotificationType } from '@prisma/client';
import { z } from 'zod';
import { paginationQuerySchema } from '../../common/http/pagination';

export const notificationQuerySchema = paginationQuerySchema.extend({
  unreadOnly: z.coerce.boolean().default(false),
});

export const updatePreferencesSchema = z.object({
  preferences: z
    .array(
      z.object({
        type: z.nativeEnum(NotificationType),
        channel: z.nativeEnum(NotificationChannel),
        enabled: z.boolean(),
      }),
    )
    .min(1)
    .max(100),
});

export type NotificationQuery = z.infer<typeof notificationQuerySchema>;
export type UpdatePreferencesRequest = z.infer<typeof updatePreferencesSchema>;
