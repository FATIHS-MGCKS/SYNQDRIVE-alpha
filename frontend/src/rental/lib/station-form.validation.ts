import type { StationOpeningHours } from '../../lib/api';
import { WEEKDAYS } from './stationUtils';
import {
  STATION_FORM_RADIUS_MAX,
  STATION_FORM_RADIUS_MIN,
} from './station-form.constants';

export type StationFormFieldErrors = Record<string, string>;

export type StationFormValidationInput = {
  name: string;
  address: string;
  postalCode: string;
  city: string;
  country: string;
  email: string;
  capacity: string;
  latitude: string;
  longitude: string;
  radiusMeters: number | null;
  timezone: string;
  pickupEnabled: boolean;
  returnEnabled: boolean;
  afterHoursReturnEnabled: boolean;
  keyBoxAvailable: boolean;
  openingHours: StationOpeningHours;
};

const TIME_OF_DAY_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MINUTES_PER_DAY = 24 * 60;

type MinuteInterval = [number, number];

function parseOpeningHoursTime(time: string): number | null {
  if (!TIME_OF_DAY_RE.test(time)) return null;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function expandSlotToMinuteIntervals(slot: { open: string; close: string }): MinuteInterval[] | null {
  const openMinutes = parseOpeningHoursTime(slot.open);
  const closeMinutes = parseOpeningHoursTime(slot.close);
  if (openMinutes === null || closeMinutes === null) return null;
  if (openMinutes === closeMinutes) return null;
  if (openMinutes < closeMinutes) return [[openMinutes, closeMinutes]];
  return [
    [openMinutes, MINUTES_PER_DAY],
    [0, closeMinutes],
  ];
}

function minuteIntervalsOverlap(a: MinuteInterval, b: MinuteInterval): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

function slotsHaveOverlap(slots: Array<{ open: string; close: string }>): boolean {
  const intervals: MinuteInterval[] = [];
  for (const slot of slots) {
    const expanded = expandSlotToMinuteIntervals(slot);
    if (!expanded) return true;
    for (const candidate of expanded) {
      for (const existing of intervals) {
        if (minuteIntervalsOverlap(candidate, existing)) return true;
      }
      intervals.push(candidate);
    }
  }
  return false;
}

export function isValidIanaTimezone(timezone: string): boolean {
  const trimmed = timezone.trim();
  if (!trimmed) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
}

export function formatStationTimezonePreview(timezone: string, locale = 'de-DE'): string | null {
  if (!isValidIanaTimezone(timezone)) return null;
  try {
    const now = new Date();
    const formatted = new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
      hour: '2-digit',
      minute: '2-digit',
    }).format(now);
    return formatted;
  } catch {
    return null;
  }
}

function validateOpeningHours(
  openingHours: StationOpeningHours,
  errors: StationFormFieldErrors,
  t: (key: string) => string,
): void {
  if ('legacyText' in openingHours && typeof openingHours.legacyText === 'string') {
    return;
  }

  for (const day of WEEKDAYS) {
    const dayValue = openingHours[day];
    if (!dayValue) continue;
    if (dayValue.closed) continue;

    const open = dayValue.open ?? '';
    const close = dayValue.close ?? '';
    if (!open || !close) {
      errors[`openingHours.${day}`] = t('stations.form.errorHoursIncomplete');
      continue;
    }
    if (parseOpeningHoursTime(open) === null || parseOpeningHoursTime(close) === null) {
      errors[`openingHours.${day}`] = t('stations.form.errorHoursInvalidTime');
      continue;
    }
    if (expandSlotToMinuteIntervals({ open, close }) === null) {
      errors[`openingHours.${day}`] = t('stations.form.errorHoursInvalidSlot');
      continue;
    }
    if (slotsHaveOverlap([{ open, close }])) {
      errors[`openingHours.${day}`] = t('stations.form.errorHoursOverlap');
    }
  }
}

/**
 * Validates station form values and returns field-level errors (empty = valid).
 */
export function validateStationForm(
  form: StationFormValidationInput,
  t: (key: string) => string,
): StationFormFieldErrors {
  const errors: StationFormFieldErrors = {};

  if (!form.name.trim()) {
    errors.name = t('stations.form.errorName');
  }
  if (!form.address.trim()) {
    errors.address = t('stations.form.errorAddress');
  }
  if (!form.city.trim()) {
    errors.city = t('stations.form.errorLocation');
  }
  if (!form.postalCode.trim()) {
    errors.postalCode = t('stations.form.errorLocation');
  }
  if (!form.country.trim()) {
    errors.country = t('stations.form.errorLocation');
  }
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = t('stations.form.errorEmail');
  }

  const latTrim = form.latitude.trim();
  const lngTrim = form.longitude.trim();
  const hasLat = latTrim.length > 0;
  const hasLng = lngTrim.length > 0;
  if (hasLat !== hasLng) {
    errors.coordinates = t('stations.form.errorCoordinatePair');
  } else if (hasLat && hasLng) {
    const lat = Number(latTrim);
    const lng = Number(lngTrim);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      errors.coordinates = t('stations.form.errorCoords');
    } else if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      errors.coordinates = t('stations.form.errorCoordsRange');
    }
  }

  if (form.radiusMeters != null && (form.radiusMeters < STATION_FORM_RADIUS_MIN || form.radiusMeters > STATION_FORM_RADIUS_MAX)) {
    errors.radiusMeters = t('stations.form.errorRadius');
  }

  if (form.capacity.trim()) {
    const cap = Number(form.capacity);
    if (!Number.isFinite(cap) || cap < 0 || !Number.isInteger(cap)) {
      errors.capacity = t('stations.form.errorCapacity');
    } else if (cap < 1) {
      errors.capacity = t('stations.form.errorCapacityMin');
    }
  }

  if (!isValidIanaTimezone(form.timezone)) {
    errors.timezone = t('stations.form.errorTimezone');
  }

  if (form.afterHoursReturnEnabled && !form.returnEnabled) {
    errors.afterHoursReturnEnabled = t('stations.form.errorAfterHoursRequiresReturn');
  }

  validateOpeningHours(form.openingHours, errors, t);

  return errors;
}

export function hasStationFormAfterHoursKeyboxWarning(form: Pick<StationFormValidationInput, 'afterHoursReturnEnabled' | 'keyBoxAvailable'>): boolean {
  return form.afterHoursReturnEnabled && !form.keyBoxAvailable;
}

export function firstStationFormErrorField(errors: StationFormFieldErrors): string | null {
  const keys = Object.keys(errors);
  return keys.length > 0 ? keys[0] : null;
}
