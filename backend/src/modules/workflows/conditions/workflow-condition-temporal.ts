import { ConditionValueError } from './workflow-condition-normalizer';

const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseUtcMillis(iso: string, label = 'datetime'): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new ConditionValueError(`${label} must be a valid UTC ISO-8601 datetime`);
  }
  return ms;
}

export function assertValidTimezone(timezone: string): void {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
  } catch {
    throw new ConditionValueError(`Invalid IANA timezone: ${timezone}`);
  }
}

export function toLocalMinutes(utcIso: string, timezone: string): number {
  assertValidTimezone(timezone);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(utcIso));

  const hour = Number.parseInt(parts.find((p) => p.type === 'hour')?.value ?? 'NaN', 10);
  const minute = Number.parseInt(parts.find((p) => p.type === 'minute')?.value ?? 'NaN', 10);
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    throw new ConditionValueError('Failed to resolve local time for timezone window');
  }
  return hour * 60 + minute;
}

export function parseTimeWindow(value: unknown): { start: string; end: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConditionValueError('withinTimeWindow value must be { start, end } with HH:mm strings');
  }
  const record = value as Record<string, unknown>;
  const start = typeof record.start === 'string' ? record.start : null;
  const end = typeof record.end === 'string' ? record.end : null;
  if (!start || !end || !HH_MM.test(start) || !HH_MM.test(end)) {
    throw new ConditionValueError('withinTimeWindow requires start/end as HH:mm (24h)');
  }
  return { start, end };
}

export function isWithinLocalTimeWindow(
  utcIso: string,
  window: { start: string; end: string },
  timezone: string,
): boolean {
  const localMinutes = toLocalMinutes(utcIso, timezone);
  const [startH, startM] = window.start.split(':').map((part) => Number.parseInt(part, 10));
  const [endH, endM] = window.end.split(':').map((part) => Number.parseInt(part, 10));
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes <= endMinutes) {
    return localMinutes >= startMinutes && localMinutes <= endMinutes;
  }
  return localMinutes >= startMinutes || localMinutes <= endMinutes;
}

export function parseDurationMs(value: unknown): number {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0) {
      throw new ConditionValueError('durationExceeded value must be a non-negative integer of milliseconds');
    }
    return value;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConditionValueError('durationExceeded value must be { durationMs } or { minutes }');
  }
  const record = value as Record<string, unknown>;
  if (record.durationMs !== undefined) {
    return parseDurationMs(record.durationMs);
  }
  if (record.minutes !== undefined) {
    const minutes =
      typeof record.minutes === 'number' && Number.isInteger(record.minutes) && record.minutes >= 0
        ? record.minutes
        : NaN;
    if (Number.isNaN(minutes)) {
      throw new ConditionValueError('durationExceeded minutes must be a non-negative integer');
    }
    return minutes * 60_000;
  }
  throw new ConditionValueError('durationExceeded value must include durationMs or minutes');
}

export function parseBetweenRange(
  value: unknown,
  dataType: 'datetime' | 'integer' | 'decimal',
): { from: string; to: string } | { from: number; to: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConditionValueError('between value must be { from, to }');
  }
  const record = value as Record<string, unknown>;
  if (record.from === undefined || record.to === undefined) {
    throw new ConditionValueError('between requires from and to');
  }

  if (dataType === 'datetime') {
    if (typeof record.from !== 'string' || typeof record.to !== 'string') {
      throw new ConditionValueError('between requires from/to ISO-8601 UTC datetimes');
    }
    parseUtcMillis(record.from, 'from');
    parseUtcMillis(record.to, 'to');
    if (parseUtcMillis(record.from) > parseUtcMillis(record.to)) {
      throw new ConditionValueError('between range from must be <= to');
    }
    return { from: record.from, to: record.to };
  }

  const from =
    typeof record.from === 'number' && Number.isFinite(record.from) ? record.from : NaN;
  const to = typeof record.to === 'number' && Number.isFinite(record.to) ? record.to : NaN;
  if (Number.isNaN(from) || Number.isNaN(to)) {
    throw new ConditionValueError('between requires numeric from/to for number fields');
  }
  if (from > to) {
    throw new ConditionValueError('between range from must be <= to');
  }
  return { from, to };
}

export function resolveEvaluatedAtUtc(context?: { evaluatedAtUtc?: string }): string {
  if (context?.evaluatedAtUtc) {
    parseUtcMillis(context.evaluatedAtUtc, 'evaluatedAtUtc');
    return context.evaluatedAtUtc;
  }
  return new Date().toISOString();
}
