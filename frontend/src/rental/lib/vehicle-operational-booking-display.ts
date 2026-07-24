import type { StatusTone } from '../../components/patterns';
import { bookingRef } from '../components/bookings/bookingUtils';
import type { VehicleOperationalReadModel } from './vehicle-operational-state';
import {
  formatVehicleOperationalStatusLabel,
  operationalStatusToneFor,
  selectActiveBooking,
  selectIsStatusReliable,
  selectNextBooking,
  selectOperationalStatus,
  selectReservedBooking,
  VEHICLE_OPERATIONAL_STATUS,
  type VehicleBookingReference,
  type VehicleOperationalDisplayLocale,
  type VehicleOperationalStatus,
} from './vehicle-operational-state';
import {
  isOperationalStatusUnreliable,
  resolveUnreliableOperationalStatusDisplay,
} from './vehicle-operational-unknown-display';

export const DEFAULT_FLEET_DISPLAY_TIMEZONE = 'Europe/Berlin';

export interface FleetDisplayTimeOptions {
  locale?: VehicleOperationalDisplayLocale;
  timeZone?: string;
  now?: number;
  /** Shorter copy for list rows and map HUD. */
  compact?: boolean;
}

export interface OperationalStatusBadgeDisplay {
  status: VehicleOperationalStatus;
  label: string;
  tone: StatusTone;
  isUnknown: boolean;
  /** Shown when status is UNKNOWN or data is not reliable. */
  dataQualityHint: string | null;
  /** User-facing explanation for unreliable operational status. */
  unreliableExplanation: string | null;
  showUnreliableCallout: boolean;
}

export interface BookingSupplementDisplay {
  short: string;
  detail: string;
}

type ZonedDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function resolveLocaleTag(locale: VehicleOperationalDisplayLocale): string {
  return locale === 'de' ? 'de-DE' : 'en-US';
}

function resolveTimeZone(timeZone?: string): string {
  const tz = timeZone?.trim();
  return tz && tz.length > 0 ? tz : DEFAULT_FLEET_DISPLAY_TIMEZONE;
}

function parseInstant(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date : null;
}

function zonedDateParts(
  date: Date,
  timeZone: string,
  localeTag: string,
): ZonedDateParts | null {
  try {
    const formatter = new Intl.DateTimeFormat(localeTag, {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const read = (type: Intl.DateTimeFormatPartTypes): number => {
      const value = parts.find((part) => part.type === type)?.value ?? '';
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    return {
      year: read('year'),
      month: read('month'),
      day: read('day'),
      hour: read('hour'),
      minute: read('minute'),
    };
  } catch {
    return null;
  }
}

function sameZonedCalendarDay(a: Date, b: Date, timeZone: string, localeTag: string): boolean {
  const pa = zonedDateParts(a, timeZone, localeTag);
  const pb = zonedDateParts(b, timeZone, localeTag);
  if (!pa || !pb) return false;
  return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day;
}

export function truncateMiddle(text: string, maxLen: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return trimmed;
  if (maxLen <= 3) return trimmed.slice(0, maxLen);
  const head = Math.ceil((maxLen - 1) / 2);
  const tail = Math.floor((maxLen - 1) / 2);
  return `${trimmed.slice(0, head)}…${trimmed.slice(trimmed.length - tail)}`;
}

function formatTime(
  date: Date,
  localeTag: string,
  timeZone: string,
  de: boolean,
): string {
  try {
    return new Intl.DateTimeFormat(localeTag, {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    const fallback = date.toLocaleTimeString(localeTag, {
      hour: '2-digit',
      minute: '2-digit',
    });
    return de ? `${fallback} Uhr` : fallback;
  }
}

function formatDate(
  date: Date,
  localeTag: string,
  timeZone: string,
  compact: boolean,
): string {
  try {
    return new Intl.DateTimeFormat(localeTag, {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      ...(compact ? {} : { year: 'numeric' }),
    }).format(date);
  } catch {
    return date.toLocaleDateString(localeTag, {
      day: '2-digit',
      month: '2-digit',
      ...(compact ? {} : { year: 'numeric' }),
    });
  }
}

function formatDateWithYear(
  date: Date,
  localeTag: string,
  timeZone: string,
): string {
  try {
    return new Intl.DateTimeFormat(localeTag, {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  } catch {
    return date.toLocaleDateString(localeTag, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }
}

export function formatOperationalDateTime(
  iso: string | null | undefined,
  options: FleetDisplayTimeOptions = {},
): string | null {
  const date = parseInstant(iso);
  if (!date) return null;
  const locale = options.locale ?? 'de';
  const de = locale === 'de';
  const localeTag = resolveLocaleTag(locale);
  const timeZone = resolveTimeZone(options.timeZone);
  const now = new Date(options.now ?? Date.now());
  const time = formatTime(date, localeTag, timeZone, de);

  if (sameZonedCalendarDay(date, now, timeZone, localeTag)) {
    return de ? `heute um ${time} Uhr` : `today at ${time}`;
  }

  const dateLabel = formatDateWithYear(date, localeTag, timeZone);
  return de ? `am ${dateLabel} um ${time} Uhr` : `on ${dateLabel} at ${time}`;
}

export function formatOperationalDateRange(
  pickupIso: string | null | undefined,
  returnIso: string | null | undefined,
  options: FleetDisplayTimeOptions = {},
): string | null {
  const pickup = parseInstant(pickupIso);
  const returnAt = parseInstant(returnIso);
  if (!pickup && !returnAt) return null;

  const locale = options.locale ?? 'de';
  const localeTag = resolveLocaleTag(locale);
  const timeZone = resolveTimeZone(options.timeZone);
  const compact = options.compact === true;

  if (pickup && returnAt) {
    const pickupLabel = formatDate(pickup, localeTag, timeZone, compact);
    const returnLabel = formatDateWithYear(returnAt, localeTag, timeZone);
    return `${pickupLabel}–${returnLabel}`;
  }

  const single = pickup ?? returnAt;
  if (!single) return null;
  return formatDateWithYear(single, localeTag, timeZone);
}

function dataQualityHintFor(
  status: VehicleOperationalStatus,
  reliable: boolean,
  locale: VehicleOperationalDisplayLocale,
): string | null {
  const de = locale === 'de';
  if (status === VEHICLE_OPERATIONAL_STATUS.UNKNOWN || !reliable) {
    return de
      ? 'Der aktuelle Buchungszustand konnte nicht zuverlässig ermittelt werden.'
      : 'The current booking state could not be determined reliably.';
  }
  return null;
}

export function resolveOperationalStatusBadge(
  vehicle: VehicleOperationalReadModel,
  options: FleetDisplayTimeOptions = {},
): OperationalStatusBadgeDisplay {
  const locale = options.locale ?? 'de';
  const status = selectOperationalStatus(vehicle);
  const reliable = selectIsStatusReliable(vehicle);
  const unreliable = resolveUnreliableOperationalStatusDisplay(vehicle, { locale });
  const isUnknown = isOperationalStatusUnreliable(vehicle);
  const label = unreliable?.badgeLabel ?? formatVehicleOperationalStatusLabel(status, locale);
  const tone: StatusTone = isUnknown
    ? unreliable?.tone === 'watch'
      ? 'watch'
      : 'neutral'
    : operationalStatusToneFor(status);
  const dataQualityHint = dataQualityHintFor(status, reliable, locale);

  return {
    status,
    label,
    tone,
    isUnknown,
    dataQualityHint,
    unreliableExplanation: unreliable?.explanation ?? null,
    showUnreliableCallout: isUnknown,
  };
}

function formatCustomerLabel(
  name: string | null | undefined,
  compact: boolean,
  de: boolean,
): string | null {
  if (!name?.trim()) return null;
  const normalized = name.trim();
  const display = compact ? truncateMiddle(normalized, 22) : normalized;
  return display;
}

function bookingReferenceLabel(booking: VehicleBookingReference, compact: boolean): string | null {
  if (!booking.bookingId) return null;
  const ref = bookingRef(booking.bookingId);
  return compact ? ref : ref;
}

function buildActiveReturnSupplement(
  booking: VehicleBookingReference,
  options: FleetDisplayTimeOptions,
): BookingSupplementDisplay | null {
  const locale = options.locale ?? 'de';
  const de = locale === 'de';
  const compact = options.compact === true;
  const when = formatOperationalDateTime(booking.returnAt, options);
  if (!when) return null;

  const customer = formatCustomerLabel(booking.customerName, compact, de);
  const ref = bookingReferenceLabel(booking, compact);

  if (booking.isOverdue) {
    const short = de ? 'Rückgabe überfällig' : 'Return overdue';
    const detailParts = [short, when, customer, ref].filter(Boolean);
    return { short, detail: detailParts.join(' · ') };
  }

  const short = de ? `Rückgabe ${when}` : `Return ${when}`;
  const detailParts = [short, customer, ref].filter(Boolean);
  return { short, detail: detailParts.join(' · ') };
}

function buildReservedPickupSupplement(
  booking: VehicleBookingReference,
  options: FleetDisplayTimeOptions,
): BookingSupplementDisplay | null {
  const locale = options.locale ?? 'de';
  const de = locale === 'de';
  const compact = options.compact === true;
  const pickup = parseInstant(booking.pickupAt);
  if (!pickup) return null;

  const localeTag = resolveLocaleTag(locale);
  const timeZone = resolveTimeZone(options.timeZone);
  const now = new Date(options.now ?? Date.now());
  const time = formatTime(pickup, localeTag, timeZone, de);
  const customer = formatCustomerLabel(booking.customerName, compact, de);
  const ref = bookingReferenceLabel(booking, compact);

  const isToday = sameZonedCalendarDay(pickup, now, timeZone, localeTag);
  let short: string;
  if (booking.isOverdue) {
    short = de ? 'Abholung überfällig' : 'Pickup overdue';
  } else if (isToday) {
    short = de ? `Abholung heute um ${time} Uhr` : `Pickup today at ${time}`;
  } else {
    const when = formatOperationalDateTime(booking.pickupAt, options);
    short = de ? `Abholung ${when}` : `Pickup ${when}`;
  }

  const detailParts = [short, customer, ref].filter(Boolean);
  return { short, detail: detailParts.join(' · ') };
}

function buildNextBookingSupplement(
  booking: VehicleBookingReference,
  options: FleetDisplayTimeOptions,
): BookingSupplementDisplay | null {
  const locale = options.locale ?? 'de';
  const de = locale === 'de';
  const compact = options.compact === true;
  const range = formatOperationalDateRange(booking.pickupAt, booking.returnAt, options);
  if (!range) return null;

  const prefix = de ? 'Nächste Buchung' : 'Next booking';
  const short = `${prefix}: ${range}`;
  const customer = formatCustomerLabel(booking.customerName, compact, de);
  const ref = bookingReferenceLabel(booking, compact);
  const detailParts = [short, customer, ref].filter(Boolean);
  return { short, detail: detailParts.join(' · ') };
}

/**
 * Booking supplement line — sourced from `bookingContext` only.
 * `nextBooking` never becomes a status badge.
 */
export function resolveBookingSupplement(
  vehicle: VehicleOperationalReadModel,
  options: FleetDisplayTimeOptions = {},
): BookingSupplementDisplay | null {
  if (isOperationalStatusUnreliable(vehicle)) return null;

  const status = selectOperationalStatus(vehicle);
  const active = selectActiveBooking(vehicle);
  const reserved = selectReservedBooking(vehicle);
  const next = selectNextBooking(vehicle);

  if (status === VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED && active) {
    const primary = buildActiveReturnSupplement(active, options);
    if (!next) return primary;
    const nextLine = buildNextBookingSupplement(next, { ...options, compact: false });
    if (!primary) return nextLine;
    if (!nextLine) return primary;
    return {
      short: primary.short,
      detail: `${primary.detail} · ${nextLine.short}`,
    };
  }

  if (status === VEHICLE_OPERATIONAL_STATUS.RESERVED && reserved) {
    return buildReservedPickupSupplement(reserved, options);
  }

  if (status === VEHICLE_OPERATIONAL_STATUS.AVAILABLE && next) {
    return buildNextBookingSupplement(next, options);
  }

  return null;
}
