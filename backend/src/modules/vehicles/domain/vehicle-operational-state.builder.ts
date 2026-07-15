import { VehicleStatus } from '@prisma/client';
import {
  EMPTY_BOOKING_CONTEXT,
  FleetVehicleBookingContextDto,
  FleetVehicleMaintenanceContextDto,
  RENTAL_STATUS_MAP,
  VehicleOperationalStateInput,
  VehicleOperationalStateResult,
  VehicleOperationalTelemetryState,
} from './vehicle-operational-state.types';
import type {
  BookingContextBlock,
  CanonicalOperationalStatus,
  DataQualityReasonCode,
  OperationalReasonCode,
  OperationalStateBlock,
  OperationalStateSource,
  RawStatusDiagnosticCode,
  RawVehicleStatusDiagnostic,
  VehicleStateEngineInput,
  VehicleStateEngineOutput,
} from './vehicle-operational-state.engine.types';
import {
  assertEngineTimezone,
  mapBookingStateToLegacyDto,
} from './vehicle-operational-state.input-mapper';

export {
  EMPTY_BOOKING_CONTEXT,
  RENTAL_STATUS_MAP,
} from './vehicle-operational-state.types';
export type {
  FleetMaintenanceReasonCode,
  FleetVehicleBookingContextDto,
  FleetVehicleMaintenanceContextDto,
  FleetVisibleStatusLabel,
  VehicleOperationalStateInput,
  VehicleOperationalStateResult,
} from './vehicle-operational-state.types';
export type {
  BookingContextBlock,
  BuildVehicleStateEngineInputParams,
  CanonicalOperationalStatus,
  DataQualityReasonCode,
  DataQualityState,
  DomainBookingRef,
  OperationalReasonCode,
  OperationalStateBlock,
  OperationalStateSource,
  RawVehicleStatusDiagnostic,
  VehicleStateEngineBlockingStateInput,
  VehicleStateEngineBookingStateInput,
  VehicleStateEngineContextInput,
  VehicleStateEngineInput,
  VehicleStateEngineMaintenanceStateInput,
  VehicleStateEngineOutput,
  VehicleStateEngineVehicleInput,
} from './vehicle-operational-state.engine.types';
export {
  DEFAULT_ORGANIZATION_TIMEZONE,
  EMPTY_BOOKING_STATE_INPUT,
} from './vehicle-operational-state.engine.types';
export {
  assertEngineTimezone,
  buildVehicleStateEngineInput,
  mapLegacyBookingDtoToBookingState,
  mapRawStatusToBlockingState,
  mapRawStatusToMaintenanceState,
} from './vehicle-operational-state.input-mapper';

function signalTimestamp(signal: unknown): Date | null {
  if (!signal || typeof signal !== 'object') return null;
  const t = (signal as Record<string, unknown>).timestamp;
  if (typeof t === 'string') return new Date(t);
  return null;
}

function signalValue(signal: unknown): number | null {
  if (!signal || typeof signal !== 'object') return null;
  const v = (signal as Record<string, unknown>).value;
  return typeof v === 'number' && !Number.isNaN(v) ? v : null;
}

/**
 * Non-null fuel percent resolver — also used by vehicle telemetry detail surfaces.
 */
export function resolveFleetFuelPercent(
  state: VehicleOperationalTelemetryState | null | undefined,
  tankCapacityLiters?: number | null,
): number {
  if (!state) return 0;

  const relPct = state.fuelLevelRelative ?? null;
  const absLiters = state.fuelLevelAbsolute ?? null;

  if (relPct == null && absLiters == null) return 0;
  if (absLiters == null) return relPct ?? 0;

  const raw = state.rawPayloadJson as Record<string, unknown> | null;

  if (relPct != null && relPct > 0 && raw) {
    const relTs = signalTimestamp(raw.powertrainFuelSystemRelativeLevel);
    const absTs = signalTimestamp(raw.powertrainFuelSystemAbsoluteLevel);

    if (!absTs || !relTs || absTs <= relTs) return relPct;

    const relVal = signalValue(raw.powertrainFuelSystemRelativeLevel);
    const absVal = signalValue(raw.powertrainFuelSystemAbsoluteLevel);
    if (relVal != null && absVal != null && relVal > 0 && absVal > 0) {
      const timeDiffMs = absTs.getTime() - relTs.getTime();
      if (timeDiffMs < 6 * 60 * 60 * 1000) {
        const inferredCapacity = absVal / (relVal / 100);
        if (inferredCapacity > 10 && inferredCapacity < 200) {
          return (
            Math.round(
              Math.min(100, (absLiters / inferredCapacity) * 100) * 10,
            ) / 10
          );
        }
      }
    }
  }

  const DEFAULT_TANK_LITERS = 50;
  const capacity =
    tankCapacityLiters != null && tankCapacityLiters > 0
      ? tankCapacityLiters
      : DEFAULT_TANK_LITERS;
  return Math.round(Math.min(100, (absLiters / capacity) * 100) * 10) / 10;
}

export function resolveFleetFuelPercentOrNull(
  state: VehicleOperationalTelemetryState | null | undefined,
  tankCapacityLiters?: number | null,
): number | null {
  if (!state) return null;
  const relPct = state.fuelLevelRelative ?? null;
  const absLiters = state.fuelLevelAbsolute ?? null;
  if (relPct == null && absLiters == null) return null;
  const value = resolveFleetFuelPercent(state, tankCapacityLiters);
  return Math.min(100, Math.max(0, Math.ceil(value)));
}

export function deriveMaintenanceContext(
  status: VehicleStatus | string | null | undefined,
): FleetVehicleMaintenanceContextDto {
  if (status === VehicleStatus.IN_SERVICE) {
    return {
      maintenanceReason: 'Scheduled service',
      maintenanceReasonCode: 'SCHEDULED_SERVICE',
      maintenanceUrgency: 'planned',
    };
  }
  if (status === VehicleStatus.OUT_OF_SERVICE) {
    return {
      maintenanceReason: 'Operationally blocked',
      maintenanceReasonCode: 'OPERATIONAL_BLOCK',
      maintenanceUrgency: 'urgent',
    };
  }
  return {
    maintenanceReason: null,
    maintenanceReasonCode: null,
    maintenanceUrgency: null,
  };
}

function buildGhostStateWarning(
  vehicle: VehicleOperationalStateInput['vehicle'],
  ghostLabel: string,
  rawStatus: string,
): string {
  return `[fleet-status] Ghost ${ghostLabel} state on vehicle ${
    vehicle.id ?? vehicle.licensePlate ?? '<unknown>'
  }: Vehicle.status is ${rawStatus} but no matching booking truth. Treating as Available.`;
}

function resolveLiveKmDriven(
  bookingDto: FleetVehicleBookingContextDto,
  state: VehicleOperationalStateInput['state'],
  pickupOdoByBooking: Map<string, number>,
): number | null {
  if (!bookingDto.activeBookingId) {
    return bookingDto.activeKmDriven ?? null;
  }
  if (bookingDto.activeKmDriven != null) return bookingDto.activeKmDriven;
  const pickupOdo = pickupOdoByBooking.get(bookingDto.activeBookingId);
  const currentOdo =
    typeof state?.odometerKm === 'number' ? state.odometerKm : null;
  if (pickupOdo == null || currentOdo == null) return null;
  return Math.max(0, Math.floor(currentOdo - pickupOdo));
}

/**
 * Canonical fleet operational-state builder (V1 semantics).
 *
 * Single pure derivation used by `/vehicles` and `/fleet-map`. No Prisma,
 * cache, or controller dependencies.
 */
export function buildVehicleOperationalState(
  input: VehicleOperationalStateInput,
): VehicleOperationalStateResult {
  const { vehicle, state, bookingCtx, pickupOdoByBooking } = input;
  const dbStatus =
    RENTAL_STATUS_MAP[vehicle.status as VehicleStatus] ?? 'Available';
  const bookingDerived: 'Active Rented' | 'Reserved' | null =
    bookingCtx && bookingCtx.activeBookingId
      ? 'Active Rented'
      : bookingCtx && bookingCtx.reservedBookingId
        ? 'Reserved'
        : null;

  let status: string;
  let ghostStateWarning: string | null = null;

  if (dbStatus === 'Maintenance') {
    status = 'Maintenance';
  } else if (bookingDerived) {
    status = bookingDerived;
  } else if (dbStatus === 'Active Rented' || dbStatus === 'Reserved') {
    status = 'Available';
    ghostStateWarning = buildGhostStateWarning(
      vehicle,
      dbStatus,
      String(vehicle.status),
    );
  } else {
    status = dbStatus;
  }

  const maintenanceCtx: FleetVehicleMaintenanceContextDto =
    status === 'Maintenance'
      ? deriveMaintenanceContext(vehicle.status)
      : {
          maintenanceReason: null,
          maintenanceReasonCode: null,
          maintenanceUrgency: null,
        };

  const bookingDto: FleetVehicleBookingContextDto =
    status === 'Active Rented' || status === 'Reserved'
      ? bookingCtx ?? EMPTY_BOOKING_CONTEXT
      : EMPTY_BOOKING_CONTEXT;

  const liveKmDriven = resolveLiveKmDriven(
    bookingDto,
    state,
    pickupOdoByBooking,
  );

  const odometerKm =
    typeof state?.odometerKm === 'number' && Number.isFinite(state.odometerKm)
      ? Math.floor(state.odometerKm)
      : null;

  const fuelPercent = resolveFleetFuelPercentOrNull(
    state,
    vehicle.tankCapacityLiters,
  );

  const evSoc =
    typeof state?.evSoc === 'number' && Number.isFinite(state.evSoc)
      ? Math.min(100, Math.max(0, Math.ceil(state.evSoc)))
      : null;

  return {
    status,
    maintenanceCtx,
    bookingDto,
    liveKmDriven,
    odometerKm,
    fuelPercent,
    evSoc,
    ghostStateWarning,
  };
}

const LEGACY_TO_CANONICAL_STATUS: Record<string, CanonicalOperationalStatus> = {
  Available: 'AVAILABLE',
  Reserved: 'RESERVED',
  'Active Rented': 'ACTIVE_RENTED',
  Maintenance: 'MAINTENANCE',
};

function mapLegacyStatusToCanonical(
  legacyStatus: string,
  blockingState: VehicleStateEngineInput['blockingState'],
): CanonicalOperationalStatus {
  if (blockingState.isBlocked && blockingState.level === 'hard') {
    // V1 fleet label collapses OUT_OF_SERVICE into Maintenance — output carries both signals.
    return LEGACY_TO_CANONICAL_STATUS[legacyStatus] ?? 'UNKNOWN';
  }
  return LEGACY_TO_CANONICAL_STATUS[legacyStatus] ?? 'UNKNOWN';
}

function mapLegacyStatusToReason(
  canonicalStatus: CanonicalOperationalStatus,
  legacy: VehicleOperationalStateResult,
): OperationalReasonCode {
  if (legacy.ghostStateWarning) {
    return 'RAW_STATUS_INCONSISTENT';
  }
  switch (canonicalStatus) {
    case 'AVAILABLE':
      return 'NO_ACTIVE_OR_UPCOMING_WINDOW';
    case 'RESERVED':
      return 'PICKUP_WINDOW_ACTIVE';
    case 'ACTIVE_RENTED':
      return 'ACTIVE_BOOKING';
    case 'MAINTENANCE':
      return 'MAINTENANCE_ACTIVE';
    case 'BLOCKED':
      return 'HARD_BLOCK_ACTIVE';
    default:
      return 'UNKNOWN_STATUS_VALUE';
  }
}

function resolveOperationalSource(
  input: VehicleStateEngineInput,
  canonicalStatus: CanonicalOperationalStatus,
): OperationalStateSource {
  if (input.bookingState.dataQualityState === 'UNAVAILABLE') {
    return 'FAIL_CLOSED';
  }
  if (
    canonicalStatus === 'MAINTENANCE' &&
    input.maintenanceState.source === 'ADMIN_PERSISTED'
  ) {
    return 'ADMIN_PERSISTED';
  }
  if (
    canonicalStatus === 'BLOCKED' &&
    input.blockingState.source === 'ADMIN_PERSISTED'
  ) {
    return 'ADMIN_PERSISTED';
  }
  if (
    canonicalStatus === 'ACTIVE_RENTED' ||
    canonicalStatus === 'RESERVED'
  ) {
    return 'BOOKING_LIFECYCLE';
  }
  return 'DERIVATION_ENGINE';
}

function buildRawVehicleStatusDiagnostic(
  input: VehicleStateEngineInput,
  legacy: VehicleOperationalStateResult,
): RawVehicleStatusDiagnostic {
  const diagnosticCodes: RawStatusDiagnosticCode[] = [];
  const raw = input.vehicle.rawStatus;

  if (raw === VehicleStatus.RENTED) {
    diagnosticCodes.push('LEGACY_RENTED_PERSISTED');
  }
  if (raw === VehicleStatus.RESERVED) {
    diagnosticCodes.push('LEGACY_RESERVED_PERSISTED');
  }
  if (
    raw !== VehicleStatus.AVAILABLE &&
    raw !== VehicleStatus.IN_SERVICE &&
    raw !== VehicleStatus.OUT_OF_SERVICE &&
    raw !== VehicleStatus.RENTED &&
    raw !== VehicleStatus.RESERVED
  ) {
    diagnosticCodes.push('UNKNOWN_ENUM_VALUE');
  }
  if (legacy.ghostStateWarning) {
    diagnosticCodes.push('CONFLICTS_WITH_OPERATIONAL_STATE');
  }

  return {
    value: raw,
    persistedAt: input.vehicle.persistedAt ?? null,
    isLegacyOrInconsistent:
      diagnosticCodes.length > 0 || legacy.ghostStateWarning != null,
    diagnosticCodes,
  };
}

function buildBookingContextBlock(
  input: VehicleStateEngineInput,
): BookingContextBlock {
  const { bookingState } = input;
  return {
    activeBooking: bookingState.activeBooking ?? null,
    reservedBooking: bookingState.reservationWindowBooking ?? null,
    nextBooking: bookingState.nextBooking ?? null,
    futureBookingCount: bookingState.futureBookingCount,
  };
}

function collectDiagnosticReasons(
  input: VehicleStateEngineInput,
  legacy: VehicleOperationalStateResult,
): string[] {
  const reasons: string[] = [];
  for (const code of input.bookingState.dataQualityReasons) {
    reasons.push(code);
  }
  for (const code of input.maintenanceState.reasonCodes) {
    reasons.push(code);
  }
  for (const code of input.blockingState.reasonCodes) {
    reasons.push(code);
  }
  if (legacy.ghostStateWarning) {
    reasons.push('RAW_STATUS_INCONSISTENT');
  }
  return [...new Set(reasons)];
}

function toLegacyOperationalInput(
  input: VehicleStateEngineInput,
): VehicleOperationalStateInput {
  return {
    vehicle: {
      id: input.vehicle.id,
      status: input.vehicle.rawStatus,
      licensePlate: input.vehicle.licensePlate,
      tankCapacityLiters: input.vehicle.tankCapacityLiters,
    },
    state: input.telemetry ?? null,
    bookingCtx: mapBookingStateToLegacyDto(
      input.bookingState,
      input.vehicle.id,
    ),
    pickupOdoByBooking: input.pickupOdoByBooking ?? new Map(),
  };
}

/**
 * V2 state engine entry point — accepts normalized domain inputs (§16).
 *
 * Derivation semantics remain V1 until Prompt 8+; this function structures
 * inputs/outputs per the architecture contract without changing Reserved rules.
 */
export function buildVehicleOperationalStateFromEngineInput(
  input: VehicleStateEngineInput,
): VehicleStateEngineOutput {
  assertEngineTimezone(input.context);

  const legacy = buildVehicleOperationalState(toLegacyOperationalInput(input));
  const derivedAt = input.context.now.toISOString();
  const dataQualityState = input.bookingState.dataQualityState;
  const dataQualityReasons: DataQualityReasonCode[] = [
    ...input.bookingState.dataQualityReasons,
  ];

  const canonicalStatus = mapLegacyStatusToCanonical(
    legacy.status,
    input.blockingState,
  );
  const reason = mapLegacyStatusToReason(canonicalStatus, legacy);

  const operationalState: OperationalStateBlock = {
    status: canonicalStatus,
    reason,
    source: resolveOperationalSource(input, canonicalStatus),
    effectiveFrom: null,
    effectiveUntil: null,
    derivedAt,
    dataQualityState,
    dataQualityReasons,
    isReliable: dataQualityState === 'RELIABLE',
  };

  return {
    operationalState,
    bookingContext: buildBookingContextBlock(input),
    rawVehicleStatus: buildRawVehicleStatusDiagnostic(input, legacy),
    diagnosticReasons: collectDiagnosticReasons(input, legacy),
    legacy,
  };
}
