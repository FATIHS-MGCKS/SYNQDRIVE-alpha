import { VehicleStatus } from '@prisma/client';
import type {
  FleetVehicleBookingContextDto,
  VehicleOperationalStateResult,
  VehicleOperationalTelemetryState,
} from './vehicle-operational-state.types';

/** Kanonischer operativer Zustand — §16.2 vehicle-operational-state-v2.md */
export type CanonicalOperationalStatus =
  | 'AVAILABLE'
  | 'RESERVED'
  | 'ACTIVE_RENTED'
  | 'MAINTENANCE'
  | 'BLOCKED'
  | 'UNKNOWN';

export type OperationalReasonCode =
  | 'NO_ACTIVE_OR_UPCOMING_WINDOW'
  | 'ACTIVE_BOOKING'
  | 'PICKUP_WINDOW_ACTIVE'
  | 'MAINTENANCE_ACTIVE'
  | 'HARD_BLOCK_ACTIVE'
  | 'BOOKING_DATA_UNAVAILABLE'
  | 'BOOKING_STATE_INCONSISTENT'
  | 'HANDOVER_STATE_INCONSISTENT'
  | 'RAW_STATUS_INCONSISTENT'
  | 'UNKNOWN_STATUS_VALUE';

export type DataQualityState = 'RELIABLE' | 'DEGRADED' | 'UNAVAILABLE';

export type DataQualityReasonCode =
  | 'BOOKING_QUERY_FAILED'
  | 'BOOKING_PARTIAL_RESULT'
  | 'HANDOVER_QUERY_FAILED'
  | 'MULTIPLE_ACTIVE_BOOKINGS'
  | 'ACTIVE_WITHOUT_PICKUP_PROTOCOL'
  | 'PICKUP_WITHOUT_ACTIVE_BOOKING'
  | 'RETURN_COMPLETED_WHILE_ACTIVE'
  | 'BOOKING_TENANT_SCOPE_VIOLATION'
  | 'MULTIPLE_RESERVATION_WINDOW_BOOKINGS'
  | 'RAW_STATUS_LEGACY_RENTED'
  | 'RAW_STATUS_LEGACY_RESERVED'
  | 'RAW_STATUS_INCONSISTENT'
  | 'UNKNOWN_RAW_STATUS_ENUM'
  | 'TELEMETRY_STALE_FOR_POLICY';

export type OperationalStateSource =
  | 'DERIVATION_ENGINE'
  | 'ADMIN_PERSISTED'
  | 'BOOKING_LIFECYCLE'
  | 'RENTAL_HEALTH'
  | 'FAIL_CLOSED';

export type BookingPhase =
  | 'future'
  | 'pickup_window'
  | 'active_rental'
  | 'terminal';

export type MaintenanceStateSource =
  | 'ADMIN_PERSISTED'
  | 'RENTAL_HEALTH'
  | 'NONE';

export type BlockingLevel = 'none' | 'soft' | 'maintenance' | 'hard';

export type BlockingStateSource =
  | 'ADMIN_PERSISTED'
  | 'RENTAL_HEALTH'
  | 'NONE';

export type RawStatusDiagnosticCode =
  | 'LEGACY_RENTED_PERSISTED'
  | 'LEGACY_RESERVED_PERSISTED'
  | 'CONFLICTS_WITH_ACTIVE_BOOKING'
  | 'CONFLICTS_WITH_OPERATIONAL_STATE'
  | 'UNKNOWN_ENUM_VALUE';

/**
 * Normalized booking reference for the state engine.
 * `bookingNumber` is a display ref (e.g. BK-000142) — never a raw UUID label.
 */
export interface DomainBookingRef {
  id: string;
  bookingNumber: string;
  status: string;
  pickupAt: string;
  returnAt: string;
  customerLabel?: string | null;
  vehicleId: string;
  phase: BookingPhase;
  pickupStationName?: string | null;
  returnStationName?: string | null;
  kmIncluded?: number | null;
  kmDriven?: number | null;
  isOverdue?: boolean;
}

export interface VehicleStateEngineVehicleInput {
  id: string;
  organizationId: string;
  rawStatus: VehicleStatus | string;
  licensePlate?: string | null;
  tankCapacityLiters?: number | null;
  serviceNote?: string | null;
  persistedAt?: string | null;
}

/**
 * Booking-domain input for the engine.
 *
 * Optional refs use three states:
 * - `undefined` — booking slice not supplied (partial / not loaded input)
 * - `null` — loaded successfully, no matching booking for this slot
 * - `DomainBookingRef` — active booking data present
 */
export interface VehicleStateEngineBookingStateInput {
  activeBooking?: DomainBookingRef | null;
  reservationWindowBooking?: DomainBookingRef | null;
  nextBooking?: DomainBookingRef | null;
  futureBookingCount: number;
  /** Chronological tail after nextBooking — optional for vehicle detail/diagnostics. */
  futureBookings?: DomainBookingRef[];
  dataQualityState: DataQualityState;
  dataQualityReasons: DataQualityReasonCode[];
}

export interface VehicleStateEngineMaintenanceStateInput {
  isMaintenance: boolean;
  reasonCodes: string[];
  source: MaintenanceStateSource;
}

export interface VehicleStateEngineBlockingStateInput {
  isBlocked: boolean;
  level: BlockingLevel;
  reasonCodes: string[];
  source: BlockingStateSource;
}

export interface VehicleStateEngineContextInput {
  now: Date;
  /** IANA timezone, e.g. Europe/Berlin — required */
  organizationTimezone: string;
}

export interface VehicleStateEngineInput {
  vehicle: VehicleStateEngineVehicleInput;
  bookingState: VehicleStateEngineBookingStateInput;
  maintenanceState: VehicleStateEngineMaintenanceStateInput;
  blockingState: VehicleStateEngineBlockingStateInput;
  context: VehicleStateEngineContextInput;
  telemetry?: VehicleOperationalTelemetryState | null;
  pickupOdoByBooking?: Map<string, number>;
}

export interface OperationalStateBlock {
  status: CanonicalOperationalStatus;
  reason: OperationalReasonCode;
  source: OperationalStateSource;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  derivedAt: string;
  dataQualityState: DataQualityState;
  dataQualityReasons: DataQualityReasonCode[];
  isReliable: boolean;
}

export interface BookingContextBlock {
  activeBooking: DomainBookingRef | null;
  reservedBooking: DomainBookingRef | null;
  nextBooking: DomainBookingRef | null;
  futureBookingCount: number;
}

export interface RawVehicleStatusDiagnostic {
  value: VehicleStatus | string;
  persistedAt: string | null;
  isLegacyOrInconsistent: boolean;
  diagnosticCodes: RawStatusDiagnosticCode[];
}

export interface VehicleStateEngineOutput {
  operationalState: OperationalStateBlock;
  bookingContext: BookingContextBlock;
  rawVehicleStatus: RawVehicleStatusDiagnostic;
  diagnosticReasons: string[];
  /** V1 fleet projection — retained until API migration (Prompt 8+). */
  legacy: VehicleOperationalStateResult;
}

/** Params for assembling engine input from fleet read-model rows. */
export interface BuildVehicleStateEngineInputParams {
  vehicle: {
    id: string;
    organizationId: string;
    status: VehicleStatus | string;
    licensePlate?: string | null;
    tankCapacityLiters?: number | null;
    serviceNote?: string | null;
    updatedAt?: Date | string | null;
  };
  /** Normalized booking state from `assembleBookingContextMap` (preferred). */
  bookingState?: VehicleStateEngineBookingStateInput | null;
  /** @deprecated Legacy flat DTO — use `bookingState` when available. */
  bookingCtx?: FleetVehicleBookingContextDto | null;
  bookingDataQuality?: DataQualityState;
  bookingDataQualityReasons?: DataQualityReasonCode[];
  organizationTimezone: string;
  now?: Date;
  telemetry?: VehicleOperationalTelemetryState | null;
  pickupOdoByBooking?: Map<string, number>;
}

export const DEFAULT_ORGANIZATION_TIMEZONE = 'Europe/Berlin';

export const EMPTY_BOOKING_STATE_INPUT: VehicleStateEngineBookingStateInput = {
  activeBooking: null,
  reservationWindowBooking: null,
  nextBooking: null,
  futureBookingCount: 0,
  futureBookings: [],
  dataQualityState: 'RELIABLE',
  dataQualityReasons: [],
};
