import { z } from 'zod';
import { checklistItems, issueTypes } from './move-in.rules';

const answer = z.object({
  item: z.enum(checklistItems),
  result: z.enum(['SATISFACTORY', 'ISSUE_FOUND', 'NOT_APPLICABLE']),
  description: z.string().trim().max(4000).optional(),
  issueType: z.enum(Object.keys(issueTypes) as [keyof typeof issueTypes, ...(keyof typeof issueTypes)[]]).optional(),
}).strict();
export const checklistRequest = z.object({ answers: z.array(answer).max(checklistItems.length) }).strict();
export const issueActionRequest = z.object({
  action: z.enum(['REPAIR_REPORTED', 'TENANT_CONFIRMED', 'DISPUTE_CLASSIFICATION', 'REQUEST_REVIEW']),
  note: z.string().trim().min(1).max(4000),
}).strict();
export const additionalIssueRequest = z.object({ item: z.enum(checklistItems), issueType: z.enum(Object.keys(issueTypes) as [keyof typeof issueTypes, ...(keyof typeof issueTypes)[]]), description: z.string().trim().min(1).max(4000) }).strict();
export type AdditionalIssueRequest = z.infer<typeof additionalIssueRequest>;
export type ChecklistRequest = z.infer<typeof checklistRequest>;
export type IssueActionRequest = z.infer<typeof issueActionRequest>;
