import { ConversationType } from '@prisma/client';
import { z } from 'zod';
import { paginationQuerySchema } from '../../common/http/pagination';

export const createConversationSchema = z.object({
  listingId: z.string().uuid().optional(),
  recipientId: z.string().uuid(),
  subject: z.string().trim().min(1).max(255).optional(),
  type: z.nativeEnum(ConversationType).default(ConversationType.LISTING_ENQUIRY),
  initialMessage: z.string().trim().min(1).max(5000).optional(),
});

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});

export const conversationQuerySchema = paginationQuerySchema;
export const messageQuerySchema = paginationQuerySchema;

export type CreateConversationRequest = z.infer<typeof createConversationSchema>;
export type SendMessageRequest = z.infer<typeof sendMessageSchema>;
export type ConversationQuery = z.infer<typeof conversationQuerySchema>;
