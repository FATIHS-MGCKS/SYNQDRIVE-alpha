import { BadRequestException } from '@nestjs/common';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const DEFAULT_TARIFF_TIMEZONE = 'Europe/Berlin';

/**
 * Parse a tariff instant for validity boundaries.
 * - Full ISO-8601 strings → absolute instant (UTC storage).
 * - Date-only `YYYY-MM-DD` → start of that calendar day in `timeZone`, stored as UTC.
 */
export function parseTariffEffectiveInstant(
  input: string,
  timeZone: string = DEFAULT_TARIFF_TIMEZONE,
): Date {
  const trimmed = input.trim();
  if (DATE_ONLY_RE.test(trimmed)) {
    return zonedStartOfDayToUtc(trimmed, timeZone);
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException({
      message: 'Ungültiger Gültigkeitszeitpunkt',
      code: 'INVALID_TARIFF_INSTANT',
      input: trimmed,
    });
  }
  return parsed;
}

/** Start of calendar day in IANA timezone as UTC instant (handles DST). */
export function zonedStartOfDayToUtc(dateOnly: string, timeZone: string): Date {
  const [year, month, day] = dateOnly.split('-').map(Number);
  if (!year || !month || !day) {
    throw new BadRequestException({
      message: 'Ungültiges Datum',
      code: 'INVALID_TARIFF_INSTANT',
      input: dateOnly,
    });
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const localAt = (ms: number) => {
    const parts = formatter.formatToParts(new Date(ms));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
    return {
      year: Number(get('year')),
      month: Number(get('month')),
      day: Number(get('day')),
      hour: Number(get('hour')),
      minute: Number(get('minute')),
      second: Number(get('second')),
    };
  };

  const lo = Date.UTC(year, month - 2, day, 0, 0, 0);
  const hi = Date.UTC(year, month, day + 1, 23, 59, 59);

  for (let ms = lo; ms <= hi; ms += 60_000) {
    const local = localAt(ms);
    if (
      local.year === year &&
      local.month === month &&
      local.day === day &&
      local.hour === 0 &&
      local.minute === 0 &&
      local.second === 0
    ) {
      return new Date(ms);
    }
  }

  throw new BadRequestException({
    message: 'Kalendertag konnte in Zeitzone nicht aufgelöst werden',
    code: 'INVALID_TARIFF_INSTANT',
    input: dateOnly,
    timeZone,
  });
}

/** Booking pickup/return — always absolute instants from ISO API input. */
export function parseBookingInstant(input: string | Date): Date {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) {
      throw new BadRequestException({
        message: 'Ungültiger Buchungszeitpunkt',
        code: 'INVALID_BOOKING_INSTANT',
      });
    }
    return input;
  }
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException({
      message: 'Ungültiger Buchungszeitpunkt',
      code: 'INVALID_BOOKING_INSTANT',
      input,
    });
  }
  return parsed;
}
