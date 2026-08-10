import { BadRequestException } from '@nestjs/common';
import { PLATFORM_DEFAULT_TIMEZONE } from '@shared/time/platform-time.constants';
import {
  zonedDateOnly as canonicalZonedDateOnly,
  zonedStartOfDayToUtc as canonicalZonedStartOfDayToUtc,
} from '@shared/time/iana-timezone.util';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const DEFAULT_TARIFF_TIMEZONE = PLATFORM_DEFAULT_TIMEZONE;

/** Calendar date `YYYY-MM-DD` for an instant in an IANA timezone. */
export function zonedDateOnly(
  instant: Date,
  timeZone: string = DEFAULT_TARIFF_TIMEZONE,
): string {
  return canonicalZonedDateOnly(instant, timeZone);
}

/**
 * Default `validFrom` for new vehicle assignments — start of the assignment
 * calendar day in the org timezone so same-day pickups before "now" still resolve.
 */
export function defaultTariffAssignmentValidFrom(
  timeZone: string = DEFAULT_TARIFF_TIMEZONE,
  reference: Date = new Date(),
): Date {
  return zonedStartOfDayToUtc(zonedDateOnly(reference, timeZone), timeZone);
}

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
  try {
    return canonicalZonedStartOfDayToUtc(dateOnly, timeZone);
  } catch {
    throw new BadRequestException({
      message: 'Kalendertag konnte in Zeitzone nicht aufgelöst werden',
      code: 'INVALID_TARIFF_INSTANT',
      input: dateOnly,
      timeZone,
    });
  }
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
