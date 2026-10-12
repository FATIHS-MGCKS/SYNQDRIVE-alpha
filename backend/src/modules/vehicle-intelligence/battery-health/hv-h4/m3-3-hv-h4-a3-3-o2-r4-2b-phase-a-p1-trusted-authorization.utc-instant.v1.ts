const UTC_INSTANT_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/;

function daysInMonthUtc(year: number, month: number): number {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  if ([4, 6, 9, 11].includes(month)) return 30;
  return 31;
}

/**
 * Parse and validate a UTC instant with true calendar correctness (not `Date.parse` rollover).
 */
export function parseUtcInstantStrictV1(raw: string): Date | null {
  const trimmed = raw.trim();
  const match = UTC_INSTANT_RE.exec(trimmed);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const frac = match[7] ?? '';
  const millis = frac.length > 0 ? Number(frac.padEnd(3, '0')) : 0;

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second) ||
    !Number.isFinite(millis)
  ) {
    return null;
  }

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonthUtc(year, month)) return null;
  if (hour > 23 || minute > 59 || second > 59 || millis > 999) return null;

  const ms = Date.UTC(year, month - 1, day, hour, minute, second, millis);
  if (!Number.isFinite(ms)) return null;

  const d = new Date(ms);
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day ||
    d.getUTCHours() !== hour ||
    d.getUTCMinutes() !== minute ||
    d.getUTCSeconds() !== second ||
    d.getUTCMilliseconds() !== millis
  ) {
    return null;
  }

  return d;
}

export function resolveVerificationClockV1(
  options: { now?: Date } = {},
): { ok: true; now: Date } | { ok: false; reasonCode: string } {
  const candidate = options.now ?? new Date();
  if (!(candidate instanceof Date) || !Number.isFinite(candidate.getTime())) {
    return { ok: false, reasonCode: 'PHASE_A_P1_VERIFICATION_CLOCK_INVALID' };
  }
  return { ok: true, now: candidate };
}
