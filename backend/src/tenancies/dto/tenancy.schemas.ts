import { TenancyStatus } from '@prisma/client';
import { z } from 'zod';
import { paginationQuerySchema } from '../../common/http/pagination';

export const tenancyQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(TenancyStatus).optional(),
});
export type TenancyQuery = z.infer<typeof tenancyQuerySchema>;
