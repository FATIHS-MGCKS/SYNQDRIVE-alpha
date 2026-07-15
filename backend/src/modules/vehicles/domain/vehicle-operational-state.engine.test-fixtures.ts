import { VehicleStatus } from '@prisma/client';
import type {
  CanonicalOperationalStatus,
  DataQualityState,
  DomainBookingRef,
  OperationalReasonCode,
  VehicleStateEngineInput,
} from './vehicle-operational-state.engine.types';

/** Fixed evaluation instant for deterministic matrix tests (Europe/Berlin context). */
export const MATRIX_EVALUATION_AT = new Date('2026-07-15T12:00:00.000Z');

export const MATRIX_TIMEZONE = 'Europe/Berlin';

export const MATRIX_VEHICLE_PERSISTED_AT = '2026-06-01T08:00:00.000Z';

export function matrixEngineInput(
  overrides: Partial<VehicleStateEngineInput> = {},
): VehicleStateEngineInput {
  return {
    vehicle: {
      id: 'v-matrix-1',
      organizationId: 'org-matrix',
      rawStatus: VehicleStatus.AVAILABLE,
      licensePlate: 'M-TR-1',
      tankCapacityLiters: 50,
      persistedAt: MATRIX_VEHICLE_PERSISTED_AT,
      ...overrides.vehicle,
    },
    bookingState: {
      activeBooking: null,
      reservationWindowBooking: null,
      nextBooking: null,
      futureBookingCount: 0,
      dataQualityState: 'RELIABLE',
      dataQualityReasons: [],
      ...overrides.bookingState,
    },
    maintenanceState: {
      isMaintenance: false,
      reasonCodes: [],
      source: 'NONE',
      ...overrides.maintenanceState,
    },
    blockingState: {
      isBlocked: false,
      level: 'none',
      reasonCodes: [],
      source: 'NONE',
      ...overrides.blockingState,
    },
    context: {
      now: MATRIX_EVALUATION_AT,
      organizationTimezone: MATRIX_TIMEZONE,
      ...overrides.context,
    },
    telemetry: overrides.telemetry ?? null,
    pickupOdoByBooking: overrides.pickupOdoByBooking ?? new Map(),
  };
}

export function bookingRef(
  overrides: Partial<DomainBookingRef> & Pick<DomainBookingRef, 'id' | 'phase'>,
): DomainBookingRef {
  return {
    bookingNumber: 'BK-000001',
    status: 'CONFIRMED',
    pickupAt: '2026-08-01T10:00:00.000Z',
    returnAt: '2026-08-06T18:00:00.000Z',
    customerLabel: 'Matrix Customer',
    vehicleId: 'v-matrix-1',
    ...overrides,
  };
}

export const MATRIX_BOOKINGS = {
  activeRental: bookingRef({
    id: 'b-active',
    bookingNumber: 'BK-000101',
    status: 'ACTIVE',
    phase: 'active_rental',
    pickupAt: '2026-07-15T08:00:00.000Z',
    returnAt: '2026-07-20T18:00:00.000Z',
    kmIncluded: 500,
    kmDriven: 42,
  }),
  reservationWindow: bookingRef({
    id: 'b-window',
    bookingNumber: 'BK-000102',
    status: 'CONFIRMED',
    phase: 'pickup_window',
    pickupAt: '2026-07-15T00:00:00.000+02:00',
    returnAt: '2026-07-20T18:00:00.000Z',
  }),
  nextInTwoWeeks: bookingRef({
    id: 'b-future-2w',
    bookingNumber: 'BK-000103',
    status: 'CONFIRMED',
    phase: 'future',
    pickupAt: '2026-08-01T10:00:00.000+02:00',
    returnAt: '2026-08-06T18:00:00.000+02:00',
  }),
  nextTomorrowPreWindow: bookingRef({
    id: 'b-tomorrow',
    bookingNumber: 'BK-000104',
    status: 'CONFIRMED',
    phase: 'future',
    pickupAt: '2026-07-16T10:00:00.000+02:00',
    returnAt: '2026-07-18T18:00:00.000+02:00',
  }),
  nextSecondFuture: bookingRef({
    id: 'b-future-2',
    bookingNumber: 'BK-000105',
    status: 'CONFIRMED',
    phase: 'future',
    pickupAt: '2026-08-10T10:00:00.000+02:00',
    returnAt: '2026-08-12T18:00:00.000+02:00',
  }),
} as const;

export interface EngineMatrixExpectation {
  status: CanonicalOperationalStatus;
  reason: OperationalReasonCode;
  legacyStatus?: string;
  activeBookingId?: string | null;
  reservedBookingId?: string | null;
  nextBookingId?: string | null;
  futureBookingCount?: number;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
  dataQualityState?: DataQualityState;
  isReliable?: boolean;
  diagnosticIncludes?: string[];
  diagnosticExcludes?: string[];
  ghostWarning?: boolean;
}

export interface EngineMatrixCase {
  id: number;
  name: string;
  input: VehicleStateEngineInput;
  expect: EngineMatrixExpectation;
}
