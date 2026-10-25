import { AvailabilityInput } from './inspection.schemas';

function localParts(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(value);
  const part = (name: string) => Number(parts.find((entry) => entry.type === name)?.value);
  return { year: part('year'), month: part('month'), day: part('day'), hour: part('hour'), minute: part('minute') };
}

/** Resolve a wall-clock time, rejecting skipped DST times rather than silently changing them. */
function wallClockToUtc(date: string, minutes: number, timezone: string): Date | null {
  const [year = 0, month = 0, day = 0] = date.split('-').map(Number);
  const target = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60);
  let candidate = target;
  for (let i = 0; i < 4; i++) {
    const p = localParts(new Date(candidate), timezone);
    const actual = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    if (actual === target) return new Date(candidate);
    candidate += target - actual;
  }
  return null;
}

export function generateInspectionSlots(config: AvailabilityInput, now: Date): Array<{ startsAt: string; endsAt: string; date: string }> {
  if (config.mode === 'BY_REQUEST') return [];
  const local = localParts(now, config.timezone);
  const firstDay = Date.UTC(local.year, local.month - 1, local.day);
  const until = now.getTime() + 30 * 24 * 60 * 60 * 1000;
  const slots = new Map<string, { startsAt: string; endsAt: string; date: string }>();
  for (let offset = 0; offset <= 30; offset++) {
    const day = new Date(firstDay + offset * 86400000);
    const date = day.toISOString().slice(0, 10);
    const windows = config.windows.filter((window) => config.mode === 'WEEKLY' ? window.day === day.getUTCDay() : window.date === date);
    for (const window of windows) {
      const [sh = 0, sm = 0] = window.start.split(':').map(Number);
      const [eh = 0, em = 0] = window.end.split(':').map(Number);
      for (let minute = sh * 60 + sm; minute + config.durationMinutes <= eh * 60 + em; minute += config.durationMinutes) {
        const start = wallClockToUtc(date, minute, config.timezone);
        if (!start || start.getTime() <= now.getTime() || start.getTime() > until) continue;
        const end = new Date(start.getTime() + config.durationMinutes * 60000);
        slots.set(start.toISOString(), { startsAt: start.toISOString(), endsAt: end.toISOString(), date });
      }
    }
  }
  return [...slots.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
