import type { AgentBusinessHours } from './agent-config.types';

const DAY_ALIASES: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

function parseTimeToMinutes(value: string | null | undefined): number | null {
  if (!value?.trim()) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function resolveDayIndex(day: string): number | null {
  const normalized = day.trim().toLowerCase();
  if (/^\d+$/.test(normalized)) {
    const index = Number(normalized);
    return index >= 0 && index <= 6 ? index : null;
  }
  return DAY_ALIASES[normalized] ?? null;
}

export function isWithinBusinessHours(
  businessHours: AgentBusinessHours | null | undefined,
  at: Date = new Date(),
): boolean {
  if (!businessHours) {
    return true;
  }

  const schedule = businessHours.schedule ?? [];
  if (schedule.length > 0) {
    const dayIndex = at.getDay();
    const dayRule = schedule.find((row) => resolveDayIndex(row.day) === dayIndex);
    if (!dayRule) {
      return true;
    }
    if (dayRule.closed) {
      return false;
    }
    const open = parseTimeToMinutes(dayRule.open);
    const close = parseTimeToMinutes(dayRule.close);
    if (open == null || close == null) {
      return true;
    }
    const minutes = at.getHours() * 60 + at.getMinutes();
    return minutes >= open && minutes < close;
  }

  const open = parseTimeToMinutes(businessHours.start);
  const close = parseTimeToMinutes(businessHours.end);
  if (open == null || close == null) {
    return true;
  }
  const minutes = at.getHours() * 60 + at.getMinutes();
  return minutes >= open && minutes < close;
}

export function summarizeBusinessHoursState(
  businessHours: AgentBusinessHours | null | undefined,
  at: Date = new Date(),
): 'open' | 'closed' | 'unknown' {
  if (!businessHours) {
    return 'unknown';
  }
  return isWithinBusinessHours(businessHours, at) ? 'open' : 'closed';
}
