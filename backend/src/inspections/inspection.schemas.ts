import { z } from 'zod';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const windowSchema = z.object({ day: z.number().int().min(0).max(6).optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), start: time, end: time }).strict().refine((v) => v.start < v.end, 'End time must be after start time');
export const availabilitySchema = z.object({
  mode: z.enum(['WEEKLY', 'SPECIFIC_DATES', 'BY_REQUEST']),
  timezone: z.string().min(1).max(100).refine((tz) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } }, 'Choose a valid timezone'),
  durationMinutes: z.union([z.literal(30), z.literal(60)]),
  automaticConfirmation: z.boolean().default(false),
  windows: z.array(windowSchema).max(100),
}).strict().superRefine((value, ctx) => {
  for (const window of value.windows) {
    if ((value.mode === 'WEEKLY' && (window.day === undefined || window.date !== undefined)) || (value.mode === 'SPECIFIC_DATES' && (!window.date || window.day !== undefined)) || value.mode === 'BY_REQUEST') ctx.addIssue({ code: 'custom', message: 'Windows must match the availability mode', path: ['windows'] });
    if (window.date && (Number.isNaN(Date.parse(`${window.date}T00:00:00Z`)) || new Date(`${window.date}T00:00:00Z`).toISOString().slice(0, 10) !== window.date)) ctx.addIssue({ code: 'custom', message: 'Invalid calendar date', path: ['windows'] });
  }
});
export const bookingSchema = z.object({ startsAt: z.string().datetime({ offset: true }), source: z.enum(['SLOT', 'REQUEST']) }).strict();
export const proposalSchema = z.object({ startsAt: z.string().datetime({ offset: true }) }).strict();
export type AvailabilityInput = z.infer<typeof availabilitySchema>;
export type BookingInput = z.infer<typeof bookingSchema>;
