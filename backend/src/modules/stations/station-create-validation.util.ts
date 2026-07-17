import { BadRequestException } from '@nestjs/common';
import { StationStatus } from '@prisma/client';
import { isValidIanaTimezone } from '@modules/vehicles/diagnostic/vehicle-booking-handover-diagnostic.util';
import {
  evaluateStationLifecycle,
  StationLifecycleCommand,
} from '@shared/stations/station-lifecycle.policy';
import { assertValidGeofenceRadius } from './station-location-masterdata.util';

export const STATION_WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type StationWeekday = (typeof STATION_WEEKDAYS)[number];

export const StationCreateValidationCode = {
  NAME_REQUIRED: 'STATION_NAME_REQUIRED',
  STATUS_ARCHIVED_FORBIDDEN: 'STATION_CREATE_ARCHIVED_FORBIDDEN',
  COORDINATE_PAIR_REQUIRED: 'STATION_COORDINATE_PAIR_REQUIRED',
  LATITUDE_OUT_OF_RANGE: 'STATION_LATITUDE_OUT_OF_RANGE',
  LONGITUDE_OUT_OF_RANGE: 'STATION_LONGITUDE_OUT_OF_RANGE',
  INVALID_TIMEZONE: 'STATION_INVALID_TIMEZONE',
  INVALID_CAPACITY: 'STATION_INVALID_CAPACITY',
  CODE_DUPLICATE: 'STATION_CODE_DUPLICATE',
  CAPABILITY_INCONSISTENT: 'STATION_CAPABILITY_INCONSISTENT',
  PRIMARY_REQUIRES_ACTIVE: 'STATION_PRIMARY_REQUIRES_ACTIVE',
  ORGANIZATION_OVERRIDE_FORBIDDEN: 'STATION_ORGANIZATION_OVERRIDE_FORBIDDEN',
  INVALID_OPENING_HOURS: 'STATION_INVALID_OPENING_HOURS',
} as const;

export type StationCreateValidationCode =
  (typeof StationCreateValidationCode)[keyof typeof StationCreateValidationCode];

export interface StationCreateInput {
  name?: string;
  code?: string | null;
  status?: StationStatus;
  isPrimary?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  timezone?: string | null;
  radiusMeters?: number | null;
  capacity?: number | null;
  pickupEnabled?: boolean;
  returnEnabled?: boolean;
  afterHoursReturnEnabled?: boolean;
  openingHours?: Record<string, unknown> | string | null;
  organizationId?: string;
}

const TIME_OF_DAY_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function assertValidCoordinatePair(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): void {
  const hasLat = latitude !== undefined && latitude !== null;
  const hasLng = longitude !== undefined && longitude !== null;

  if (hasLat !== hasLng) {
    throw new BadRequestException({
      message: 'latitude and longitude must be provided together',
      code: StationCreateValidationCode.COORDINATE_PAIR_REQUIRED,
    });
  }
  if (!hasLat || !hasLng) return;

  if (latitude < -90 || latitude > 90) {
    throw new BadRequestException({
      message: 'latitude must be between -90 and 90',
      code: StationCreateValidationCode.LATITUDE_OUT_OF_RANGE,
    });
  }
  if (longitude < -180 || longitude > 180) {
    throw new BadRequestException({
      message: 'longitude must be between -180 and 180',
      code: StationCreateValidationCode.LONGITUDE_OUT_OF_RANGE,
    });
  }
}

export function assertValidStationTimezone(timezone: string | null | undefined): void {
  if (timezone === undefined || timezone === null || timezone === '') return;
  const trimmed = timezone.trim();
  if (!trimmed || !isValidIanaTimezone(trimmed)) {
    throw new BadRequestException({
      message: 'timezone must be a valid IANA timezone (e.g. Europe/Berlin)',
      code: StationCreateValidationCode.INVALID_TIMEZONE,
    });
  }
}

export function assertValidStationCapacity(capacity: number | null | undefined): void {
  if (capacity === undefined || capacity === null) return;
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new BadRequestException({
      message: 'capacity must be null or a positive integer',
      code: StationCreateValidationCode.INVALID_CAPACITY,
    });
  }
}

function isValidTimeSlot(open: unknown, close: unknown): boolean {
  if (typeof open !== 'string' || typeof close !== 'string') return false;
  if (!TIME_OF_DAY_RE.test(open) || !TIME_OF_DAY_RE.test(close)) return false;
  return open < close;
}

function validateOpeningHoursDay(dayValue: unknown): boolean {
  if (dayValue == null || typeof dayValue !== 'object' || Array.isArray(dayValue)) {
    return false;
  }
  const day = dayValue as Record<string, unknown>;
  if (day.closed === true) {
    return Object.keys(day).every((k) => k === 'closed');
  }

  if (Array.isArray(day.slots)) {
    if (day.slots.length === 0) return false;
    return day.slots.every((slot) => {
      if (slot == null || typeof slot !== 'object' || Array.isArray(slot)) return false;
      const s = slot as Record<string, unknown>;
      return isValidTimeSlot(s.open, s.close);
    });
  }

  return isValidTimeSlot(day.open, day.close);
}

export function assertValidOpeningHours(
  openingHours: Record<string, unknown> | string | null | undefined,
): void {
  if (openingHours === undefined || openingHours === null) return;

  if (typeof openingHours === 'string') {
    const trimmed = openingHours.trim();
    if (!trimmed) return;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        assertValidOpeningHours(parsed as Record<string, unknown>);
        return;
      }
    } catch {
      // legacy free-text is allowed
      return;
    }
    throw new BadRequestException({
      message: 'openingHours string must be valid JSON or legacy text',
      code: StationCreateValidationCode.INVALID_OPENING_HOURS,
    });
  }

  if (typeof openingHours !== 'object' || Array.isArray(openingHours)) {
    throw new BadRequestException({
      message: 'openingHours must be an object',
      code: StationCreateValidationCode.INVALID_OPENING_HOURS,
    });
  }

  if ('legacyText' in openingHours) {
    const legacy = openingHours.legacyText;
    if (legacy === undefined || legacy === null || typeof legacy === 'string') return;
    throw new BadRequestException({
      message: 'openingHours.legacyText must be a string',
      code: StationCreateValidationCode.INVALID_OPENING_HOURS,
    });
  }

  const keys = Object.keys(openingHours);
  if (keys.length === 0) return;

  for (const key of keys) {
    if (!STATION_WEEKDAYS.includes(key as StationWeekday)) {
      throw new BadRequestException({
        message: `openingHours contains unknown day key "${key}"`,
        code: StationCreateValidationCode.INVALID_OPENING_HOURS,
      });
    }
    if (!validateOpeningHoursDay(openingHours[key])) {
      throw new BadRequestException({
        message: `openingHours.${key} is invalid`,
        code: StationCreateValidationCode.INVALID_OPENING_HOURS,
      });
    }
  }
}

export function assertPickupReturnCapabilitiesConsistent(input: {
  status?: StationStatus;
  pickupEnabled?: boolean;
  returnEnabled?: boolean;
  afterHoursReturnEnabled?: boolean;
  isPrimary?: boolean;
}): void {
  const status = input.status ?? 'ACTIVE';
  const pickupEnabled = input.pickupEnabled ?? true;
  const returnEnabled = input.returnEnabled ?? true;
  const afterHoursReturnEnabled = input.afterHoursReturnEnabled ?? false;

  if (afterHoursReturnEnabled && !returnEnabled) {
    throw new BadRequestException({
      message: 'afterHoursReturnEnabled requires returnEnabled',
      code: StationCreateValidationCode.CAPABILITY_INCONSISTENT,
    });
  }

  if (status === 'INACTIVE' && (pickupEnabled || returnEnabled)) {
    throw new BadRequestException({
      message: 'inactive stations cannot enable pickup or return capabilities on create',
      code: StationCreateValidationCode.CAPABILITY_INCONSISTENT,
    });
  }

  if (input.isPrimary === true && status !== 'ACTIVE') {
    throw new BadRequestException({
      message: 'primary station must be created with ACTIVE status',
      code: StationCreateValidationCode.PRIMARY_REQUIRES_ACTIVE,
    });
  }
}

export function stripClientOrganizationId<T extends StationCreateInput>(payload: T): Omit<T, 'organizationId'> {
  if (payload.organizationId !== undefined) {
    const { organizationId: _ignored, ...rest } = payload;
    return rest as Omit<T, 'organizationId'>;
  }
  return payload;
}

export function assertNoClientOrganizationOverride(payload: StationCreateInput): void {
  if (payload.organizationId !== undefined) {
    throw new BadRequestException({
      message: 'organizationId cannot be set via request payload',
      code: StationCreateValidationCode.ORGANIZATION_OVERRIDE_FORBIDDEN,
    });
  }
}

export function assertValidStationCreateStatus(status: StationStatus | undefined): void {
  const lifecycle = evaluateStationLifecycle({
    command: StationLifecycleCommand.CREATE,
    station: {
      status: 'ACTIVE',
      isPrimary: false,
      pickupEnabled: true,
      returnEnabled: true,
    },
    context: { createStatus: status ?? 'ACTIVE' },
  });
  if (!lifecycle.allowed) {
    throw new BadRequestException({
      message: lifecycle.blockingReasons[0]?.message ?? 'Invalid station status for create',
      code: StationCreateValidationCode.STATUS_ARCHIVED_FORBIDDEN,
      blockingReasons: lifecycle.blockingReasons,
    });
  }
}

export function validateStationCreatePayload(payload: StationCreateInput): void {
  assertNoClientOrganizationOverride(payload);

  const name = payload.name?.trim();
  if (!name) {
    throw new BadRequestException({
      message: 'Station name is required',
      code: StationCreateValidationCode.NAME_REQUIRED,
    });
  }

  assertValidStationCreateStatus(payload.status);
  assertValidCoordinatePair(payload.latitude, payload.longitude);
  assertValidStationTimezone(payload.timezone);
  assertValidGeofenceRadius(payload.radiusMeters);
  assertValidStationCapacity(payload.capacity);
  assertPickupReturnCapabilitiesConsistent(payload);
  assertValidOpeningHours(payload.openingHours ?? undefined);
}
