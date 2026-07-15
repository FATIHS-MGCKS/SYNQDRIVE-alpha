import type { Logger } from '@nestjs/common';
import type { DataQualityReasonCode } from './vehicle-operational-state.engine.types';
import type { VehicleStateEngineBookingStateInput } from './vehicle-operational-state.engine.types';
import { EMPTY_BOOKING_STATE_INPUT } from './vehicle-operational-state.engine.types';
import {
  assembleBookingContextMap,
  unavailableBookingContextMap,
} from './vehicle-booking-context.assembler';
import type { VehicleBookingQueryRow } from './vehicle-booking-context.types';

export type BookingContextQueryErrorClass =
  | 'DATABASE'
  | 'TIMEOUT'
  | 'UNKNOWN';

export type BookingContextQueryLayer =
  | 'BOOKING'
  | 'HANDOVER'
  | 'STATION';

export interface BookingContextQueryFailureLog {
  msg: string;
  organizationId: string;
  vehicleScope: { count: number };
  queryLayer: BookingContextQueryLayer;
  errorClass: BookingContextQueryErrorClass;
}

/** RELIABLE empty context — successful query, no operational bookings. */
export function reliableEmptyBookingContext(): VehicleStateEngineBookingStateInput {
  return {
    ...EMPTY_BOOKING_STATE_INPUT,
    futureBookings: [],
    dataQualityState: 'RELIABLE',
    dataQualityReasons: [],
  };
}

export function unavailableBookingContextForVehicle(): VehicleStateEngineBookingStateInput {
  return {
    ...EMPTY_BOOKING_STATE_INPUT,
    activeBooking: null,
    reservationWindowBooking: null,
    nextBooking: null,
    futureBookings: [],
    dataQualityState: 'UNAVAILABLE',
    dataQualityReasons: ['BOOKING_QUERY_FAILED'],
  };
}

/**
 * Resolves engine booking state for a vehicle from a loaded context map.
 * Fail-closed when the map was not supplied; RELIABLE-empty when loaded but no rows.
 */
export function resolveBookingStateForVehicle(
  map: Map<string, VehicleStateEngineBookingStateInput> | undefined,
  vehicleId: string,
): VehicleStateEngineBookingStateInput {
  if (!map) {
    return unavailableBookingContextForVehicle();
  }
  return map.get(vehicleId) ?? reliableEmptyBookingContext();
}

export function classifyBookingContextQueryError(
  err: unknown,
): BookingContextQueryErrorClass {
  if (err && typeof err === 'object') {
    const code = String((err as { code?: string }).code ?? '');
    if (
      code === 'P1008' ||
      code === 'P2024' ||
      code === 'ETIMEDOUT' ||
      code === 'ETIME'
    ) {
      return 'TIMEOUT';
    }
    if (code.startsWith('P')) {
      return 'DATABASE';
    }
    const name = String((err as { name?: string }).name ?? '');
    if (name === 'TimeoutError' || name === 'AbortError') {
      return 'TIMEOUT';
    }
  }
  return 'UNKNOWN';
}

export function logBookingContextQueryFailure(
  logger: Logger,
  params: BookingContextQueryFailureLog,
): void {
  logger.error(params);
}

function appendReason(
  reasons: DataQualityReasonCode[],
  code: DataQualityReasonCode,
): DataQualityReasonCode[] {
  if (reasons.includes(code)) return reasons;
  return [...reasons, code];
}

/** Handover batch failure — withhold booking-dependent slots, mark DEGRADED. */
export function degradeMapForHandoverQueryFailure(
  map: Map<string, VehicleStateEngineBookingStateInput>,
  vehicleIdsWithOperationalBookings: Iterable<string>,
): void {
  for (const vehicleId of vehicleIdsWithOperationalBookings) {
    const state = map.get(vehicleId);
    if (!state) continue;
    map.set(vehicleId, {
      ...state,
      activeBooking: null,
      reservationWindowBooking: null,
      dataQualityState: 'DEGRADED',
      dataQualityReasons: appendReason(
        state.dataQualityReasons,
        'HANDOVER_QUERY_FAILED',
      ),
    });
  }
}

/** Station lookup failure — partial result, DEGRADED (names may be missing). */
export function degradeMapForStationQueryFailure(
  map: Map<string, VehicleStateEngineBookingStateInput>,
  vehicleIdsWithOperationalBookings: Iterable<string>,
): void {
  for (const vehicleId of vehicleIdsWithOperationalBookings) {
    const state = map.get(vehicleId);
    if (!state) continue;
    if (state.dataQualityState === 'UNAVAILABLE') continue;
    map.set(vehicleId, {
      ...state,
      dataQualityState: 'DEGRADED',
      dataQualityReasons: appendReason(
        state.dataQualityReasons,
        'BOOKING_PARTIAL_RESULT',
      ),
    });
  }
}

export function vehicleIdsWithOperationalBookings(
  bookingRows: VehicleBookingQueryRow[],
): Set<string> {
  return new Set(bookingRows.map((r) => r.vehicleId));
}

export interface FinalizeBookingContextMapParams {
  organizationId: string;
  vehicleIds: string[];
  organizationTimezone: string;
  evaluationAt: Date;
  bookingRows: VehicleBookingQueryRow[];
  bookingQueryFailed: boolean;
  handoverQueryFailed: boolean;
  stationQueryFailed: boolean;
}

/**
 * Pure post-query assembly — maps every requested vehicleId to a booking context
 * with explicit dataQualityState (never fail-open empty arrays).
 */
export function finalizeBookingContextMap(
  params: FinalizeBookingContextMapParams,
): Map<string, VehicleStateEngineBookingStateInput> {
  const {
    organizationId,
    vehicleIds,
    organizationTimezone,
    evaluationAt,
    bookingRows,
    bookingQueryFailed,
    handoverQueryFailed,
    stationQueryFailed,
  } = params;

  if (bookingQueryFailed) {
    return unavailableBookingContextMap(vehicleIds);
  }

  const map = assembleBookingContextMap({
    organizationId,
    vehicleIds,
    bookings: bookingRows,
    evaluationAt,
    organizationTimezone,
  });

  const affectedVehicles = vehicleIdsWithOperationalBookings(bookingRows);

  if (handoverQueryFailed) {
    degradeMapForHandoverQueryFailure(map, affectedVehicles);
  }
  if (stationQueryFailed) {
    degradeMapForStationQueryFailure(map, affectedVehicles);
  }

  return map;
}
