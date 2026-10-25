import { availabilitySchema } from './inspection.schemas';
import { generateInspectionSlots } from './inspection-slots';

describe('inspection availability', () => {
  const now = new Date('2026-10-19T08:30:00.000Z'); // Monday, 09:30 in Lagos
  it('generates recurring slots in the property timezone and excludes the past', () => {
    const config = availabilitySchema.parse({ mode: 'WEEKLY', timezone: 'Africa/Lagos', durationMinutes: 60, automaticConfirmation: false, windows: [{ day: 1, start: '09:00', end: '12:00' }] });
    const slots = generateInspectionSlots(config, now);
    expect(slots[0]).toEqual({ startsAt: '2026-10-19T09:00:00.000Z', endsAt: '2026-10-19T10:00:00.000Z', date: '2026-10-19' });
    expect(slots.some((s) => s.date === '2026-10-26')).toBe(true);
    expect(slots.every((s) => new Date(s.startsAt) > now)).toBe(true);
  });
  it('excludes expired specific dates and supports by-request fallback', () => {
    const config = availabilitySchema.parse({ mode: 'SPECIFIC_DATES', timezone: 'Africa/Lagos', durationMinutes: 30, automaticConfirmation: false, windows: [{ date: '2026-10-18', start: '09:00', end: '10:00' }] });
    expect(generateInspectionSlots(config, now)).toEqual([]);
    expect(generateInspectionSlots({ ...config, mode: 'BY_REQUEST', windows: [] }, now)).toEqual([]);
  });
  it('rejects invalid modes, durations, timezone, and calendar dates', () => {
    expect(availabilitySchema.safeParse({ mode: 'WEEKLY', timezone: 'Bad/Timezone', durationMinutes: 45, automaticConfirmation: true, windows: [] }).success).toBe(false);
    expect(availabilitySchema.safeParse({ mode: 'SPECIFIC_DATES', timezone: 'Africa/Lagos', durationMinutes: 30, automaticConfirmation: false, windows: [{ date: '2026-02-31', start: '10:00', end: '11:00' }] }).success).toBe(false);
  });
});
