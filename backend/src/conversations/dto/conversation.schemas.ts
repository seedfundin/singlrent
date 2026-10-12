import { ConversationType } from '@prisma/client';
import { z } from 'zod';
import { paginationQuerySchema } from '../../common/http/pagination';

export const createConversationSchema = z.object({
  listingId: z.string().uuid().optional(),
  recipientId: z.string().uuid().optional(),
  subject: z.string().trim().min(1).max(255).optional(),
  type: z.nativeEnum(ConversationType).default(ConversationType.LISTING_ENQUIRY),
  initialMessage: z.string().trim().min(1).max(5000).optional(),
}).superRefine((input, context) => {
  if (input.type === ConversationType.PROPERTY_AI) {
    if (!input.listingId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['listingId'], message: 'A listing is required for the property assistant' });
    }
    return;
  }
  if (!input.recipientId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['recipientId'], message: 'A recipient is required for this conversation' });
  }
});

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});

export const conversationQuerySchema = paginationQuerySchema;
export const messageQuerySchema = paginationQuerySchema;

export type CreateConversationRequest = z.infer<typeof createConversationSchema>;
export type SendMessageRequest = z.infer<typeof sendMessageSchema>;
export type ConversationQuery = z.infer<typeof conversationQuerySchema>;
