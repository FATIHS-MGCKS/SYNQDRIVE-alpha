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
  DataQualityState,
  DomainBookingRef,
  OperationalReasonCode,
  OperationalStateBlock,
  OperationalStateSource,
  RawStatusDiagnosticCode,
  RawVehicleStatusDiagnostic,
  VehicleStateEngineInput,
  VehicleStateEngineOutput,
  VehicleStateEngineVehicleInput,
} from './vehicle-operational-state.engine.types';
import {
  assertEngineTimezone,
  buildVehicleStateEngineInput,
  mapBookingStateToLegacyDto,
} from './vehicle-operational-state.input-mapper';
import {
  appendUniqueReason,
  buildGhostLegacyRawWarning,
  detectLegacyRawStatusInconsistency,
  detectRawAvailableMismatch,
  legacyRawQualityTags,
  resolveLegacyRawWithUnreliableBooking,
} from './vehicle-raw-status.guard';
import { DEFAULT_ORGANIZATION_TIMEZONE } from './vehicle-operational-state.engine.types';
import { canonicalOperationalStatusToLegacyLabel } from './vehicle-operational-state.serializer';

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
  canonicalOperationalStatusToLegacyLabel,
  serializeFleetOperationalStateProjection,
  serializeOperationalStateBlock,
  serializeRawVehicleStatusDiagnostic,
} from './vehicle-operational-state.serializer';
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

const KNOWN_RAW_STATUSES = new Set<string>([
  VehicleStatus.AVAILABLE,
  VehicleStatus.IN_SERVICE,
  VehicleStatus.OUT_OF_SERVICE,
  VehicleStatus.RENTED,
  VehicleStatus.RESERVED,
]);

const CANONICAL_TO_LEGACY_STATUS = {
  AVAILABLE: 'Available',
  RESERVED: 'Reserved',
  ACTIVE_RENTED: 'Active Rented',
  MAINTENANCE: 'Maintenance',
  BLOCKED: 'Blocked',
  UNKNOWN: 'Unknown',
} as const satisfies Record<CanonicalOperationalStatus, string>;

/** @deprecated Use `canonicalOperationalStatusToLegacyLabel` from serializer. */
function legacyLabelFromCanonical(status: CanonicalOperationalStatus): string {
  return canonicalOperationalStatusToLegacyLabel(status);
}

const FAIL_CLOSED_QUALITY_CODES: DataQualityReasonCode[] = [
  'BOOKING_QUERY_FAILED',
  'HANDOVER_QUERY_FAILED',
  'MULTIPLE_ACTIVE_BOOKINGS',
  'ACTIVE_WITHOUT_PICKUP_PROTOCOL',
  'PICKUP_WITHOUT_ACTIVE_BOOKING',
  'RETURN_COMPLETED_WHILE_ACTIVE',
  'BOOKING_TENANT_SCOPE_VIOLATION',
  'MULTIPLE_RESERVATION_WINDOW_BOOKINGS',
];

function isKnownRawStatus(raw: VehicleStatus | string): boolean {
  return KNOWN_RAW_STATUSES.has(String(raw));
}

function areBookingSlicesLoaded(
  bookingState: VehicleStateEngineInput['bookingState'],
): boolean {
  return (
    bookingState.activeBooking !== undefined &&
    bookingState.reservationWindowBooking !== undefined &&
    bookingState.nextBooking !== undefined
  );
}

function isActiveRentalConsistent(
  activeBooking: DomainBookingRef | null | undefined,
): activeBooking is DomainBookingRef {
  if (!activeBooking) return false;
  return (
    activeBooking.phase === 'active_rental' || activeBooking.status === 'ACTIVE'
  );
}

function isReservationWindowConsistent(
  reservationWindowBooking: DomainBookingRef | null | undefined,
): reservationWindowBooking is DomainBookingRef {
  if (!reservationWindowBooking) return false;
  return (
    reservationWindowBooking.phase === 'pickup_window' ||
    reservationWindowBooking.status === 'PENDING' ||
    reservationWindowBooking.status === 'CONFIRMED'
  );
}

function detectBookingInconsistency(
  input: VehicleStateEngineInput,
): OperationalReasonCode | null {
  const { bookingState } = input;
  const active = bookingState.activeBooking ?? null;
  const reserved = bookingState.reservationWindowBooking ?? null;

  // active + reserved together is resolved by priority 4 > 5 (§15.4), not UNKNOWN.
  if (active && !isActiveRentalConsistent(active)) {
    return 'BOOKING_STATE_INCONSISTENT';
  }
  if (reserved && !isReservationWindowConsistent(reserved)) {
    return 'BOOKING_STATE_INCONSISTENT';
  }
  return null;
}

function resolvePriorityOneReason(
  input: VehicleStateEngineInput,
): OperationalReasonCode | null {
  const { bookingState } = input;

  if (!areBookingSlicesLoaded(bookingState)) {
    return 'BOOKING_DATA_UNAVAILABLE';
  }
  if (bookingState.dataQualityState === 'UNAVAILABLE') {
    return 'BOOKING_DATA_UNAVAILABLE';
  }

  const legacyRawUnreliable = resolveLegacyRawWithUnreliableBooking(input);
  if (legacyRawUnreliable) {
    return legacyRawUnreliable;
  }

  if (bookingState.dataQualityState === 'DEGRADED') {
    return 'BOOKING_STATE_INCONSISTENT';
  }
  for (const code of bookingState.dataQualityReasons) {
    if (FAIL_CLOSED_QUALITY_CODES.includes(code)) {
      if (code === 'ACTIVE_WITHOUT_PICKUP_PROTOCOL') {
        return 'HANDOVER_STATE_INCONSISTENT';
      }
      if (
        code === 'PICKUP_WITHOUT_ACTIVE_BOOKING' ||
        code === 'RETURN_COMPLETED_WHILE_ACTIVE' ||
        code === 'BOOKING_TENANT_SCOPE_VIOLATION'
      ) {
        return 'HANDOVER_STATE_INCONSISTENT';
      }
      if (code === 'MULTIPLE_ACTIVE_BOOKINGS') {
        return 'BOOKING_STATE_INCONSISTENT';
      }
      if (code === 'MULTIPLE_RESERVATION_WINDOW_BOOKINGS') {
        return 'BOOKING_STATE_INCONSISTENT';
      }
      return 'BOOKING_DATA_UNAVAILABLE';
    }
  }

  const legacyGhost = detectLegacyRawStatusInconsistency(input);
  if (legacyGhost) {
    return legacyGhost;
  }

  if (!isKnownRawStatus(input.vehicle.rawStatus)) {
    return 'UNKNOWN_STATUS_VALUE';
  }

  return detectBookingInconsistency(input);
}

function resolveEffectiveWindow(
  status: CanonicalOperationalStatus,
  input: VehicleStateEngineInput,
): { effectiveFrom: string | null; effectiveUntil: string | null } {
  const { bookingState, vehicle } = input;
  switch (status) {
    case 'ACTIVE_RENTED': {
      const booking = bookingState.activeBooking;
      return {
        effectiveFrom: booking?.pickupAt ?? null,
        effectiveUntil: booking?.returnAt ?? null,
      };
    }
    case 'RESERVED': {
      const booking = bookingState.reservationWindowBooking;
      return {
        effectiveFrom: booking?.pickupAt ?? null,
        effectiveUntil: booking?.returnAt ?? null,
      };
    }
    case 'MAINTENANCE':
    case 'BLOCKED':
      return {
        effectiveFrom: vehicle.persistedAt ?? null,
        effectiveUntil: null,
      };
    default:
      return { effectiveFrom: null, effectiveUntil: null };
  }
}

function resolveOperationalSource(
  input: VehicleStateEngineInput,
  canonicalStatus: CanonicalOperationalStatus,
): OperationalStateSource {
  if (canonicalStatus === 'UNKNOWN') {
    if (input.bookingState.dataQualityState === 'UNAVAILABLE') {
      return 'FAIL_CLOSED';
    }
    return 'DERIVATION_ENGINE';
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

interface CanonicalDerivation {
  status: CanonicalOperationalStatus;
  reason: OperationalReasonCode;
  ghostStateWarning: string | null;
  outputDataQualityState: DataQualityState;
  outputDataQualityReasons: DataQualityReasonCode[];
}

function applyRawAvailableMismatchDiagnostics(
  input: VehicleStateEngineInput,
  derivation: CanonicalDerivation,
): CanonicalDerivation {
  const mismatch = detectRawAvailableMismatch(input, derivation.status);
  if (!mismatch.warning) {
    return derivation;
  }

  let outputDataQualityReasons = [...derivation.outputDataQualityReasons];
  for (const code of mismatch.extraQualityReasons) {
    outputDataQualityReasons = appendUniqueReason(outputDataQualityReasons, code);
  }
  let outputDataQualityState = derivation.outputDataQualityState;
  if (outputDataQualityState === 'RELIABLE') {
    outputDataQualityState = 'DEGRADED';
  }

  return {
    ...derivation,
    ghostStateWarning: mismatch.warning,
    outputDataQualityState,
    outputDataQualityReasons,
  };
}

/**
 * Kanonische V2-Prioritätskette — §15.1 vehicle-operational-state-v2.md
 */
export function deriveCanonicalOperationalState(
  input: VehicleStateEngineInput,
): CanonicalDerivation {
  const { bookingState, maintenanceState, blockingState, vehicle } = input;
  let ghostStateWarning: string | null = null;
  let outputDataQualityReasons = [...bookingState.dataQualityReasons];
  let outputDataQualityState = bookingState.dataQualityState;

  const priorityOneReason = resolvePriorityOneReason(input);
  if (priorityOneReason) {
    if (priorityOneReason === 'RAW_STATUS_INCONSISTENT') {
      const ghostLabel =
        vehicle.rawStatus === VehicleStatus.RENTED
          ? ('Active Rented' as const)
          : ('Reserved' as const);
      ghostStateWarning = buildGhostLegacyRawWarning(
        vehicle,
        ghostLabel,
        String(vehicle.rawStatus),
      );
      for (const tag of legacyRawQualityTags(vehicle.rawStatus)) {
        outputDataQualityReasons = appendUniqueReason(
          outputDataQualityReasons,
          tag,
        );
      }
      if (outputDataQualityState === 'RELIABLE') {
        outputDataQualityState = 'DEGRADED';
      }
    }
    if (
      priorityOneReason === 'UNKNOWN_STATUS_VALUE' &&
      !outputDataQualityReasons.includes('UNKNOWN_RAW_STATUS_ENUM')
    ) {
      outputDataQualityReasons.push('UNKNOWN_RAW_STATUS_ENUM');
      if (outputDataQualityState === 'RELIABLE') {
        outputDataQualityState = 'DEGRADED';
      }
    }
    return {
      status: 'UNKNOWN',
      reason: priorityOneReason,
      ghostStateWarning,
      outputDataQualityState,
      outputDataQualityReasons,
    };
  }

  if (maintenanceState.isMaintenance) {
    return {
      status: 'MAINTENANCE',
      reason: 'MAINTENANCE_ACTIVE',
      ghostStateWarning: null,
      outputDataQualityState,
      outputDataQualityReasons,
    };
  }

  if (blockingState.isBlocked && blockingState.level === 'hard') {
    return {
      status: 'BLOCKED',
      reason: 'HARD_BLOCK_ACTIVE',
      ghostStateWarning: null,
      outputDataQualityState,
      outputDataQualityReasons,
    };
  }

  if (isActiveRentalConsistent(bookingState.activeBooking)) {
    return applyRawAvailableMismatchDiagnostics(input, {
      status: 'ACTIVE_RENTED',
      reason: 'ACTIVE_BOOKING',
      ghostStateWarning: null,
      outputDataQualityState,
      outputDataQualityReasons,
    });
  }

  if (isReservationWindowConsistent(bookingState.reservationWindowBooking)) {
    return applyRawAvailableMismatchDiagnostics(input, {
      status: 'RESERVED',
      reason: 'PICKUP_WINDOW_ACTIVE',
      ghostStateWarning: null,
      outputDataQualityState,
      outputDataQualityReasons,
    });
  }

  return {
    status: 'AVAILABLE',
    reason: 'NO_ACTIVE_OR_UPCOMING_WINDOW',
    ghostStateWarning: null,
    outputDataQualityState,
    outputDataQualityReasons,
  };
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
 * Fleet operational-state builder — delegates to the V2 state engine and
 * returns the legacy fleet projection for API compatibility.
 */
export function buildVehicleOperationalState(
  input: VehicleOperationalStateInput,
): VehicleOperationalStateResult {
  const engineInput = buildVehicleStateEngineInput({
    vehicle: {
      id: input.vehicle.id ?? 'unknown',
      organizationId: 'legacy',
      status: input.vehicle.status ?? VehicleStatus.AVAILABLE,
      licensePlate: input.vehicle.licensePlate,
      tankCapacityLiters: input.vehicle.tankCapacityLiters,
    },
    bookingCtx: input.bookingCtx,
    organizationTimezone: DEFAULT_ORGANIZATION_TIMEZONE,
    telemetry: input.state,
    pickupOdoByBooking: input.pickupOdoByBooking,
  });
  return buildVehicleOperationalStateFromEngineInput(engineInput).legacy;
}

function buildLegacyMaintenanceContext(
  canonicalStatus: CanonicalOperationalStatus,
  rawStatus: VehicleStatus | string,
): FleetVehicleMaintenanceContextDto {
  if (canonicalStatus === 'MAINTENANCE' || canonicalStatus === 'BLOCKED') {
    return deriveMaintenanceContext(rawStatus);
  }
  return {
    maintenanceReason: null,
    maintenanceReasonCode: null,
    maintenanceUrgency: null,
  };
}

function buildLegacyBookingDto(
  canonicalStatus: CanonicalOperationalStatus,
  input: VehicleStateEngineInput,
): FleetVehicleBookingContextDto {
  if (canonicalStatus === 'ACTIVE_RENTED' || canonicalStatus === 'RESERVED') {
    return (
      mapBookingStateToLegacyDto(input.bookingState, input.vehicle.id) ??
      EMPTY_BOOKING_CONTEXT
    );
  }
  return EMPTY_BOOKING_CONTEXT;
}

function buildLegacyProjection(
  input: VehicleStateEngineInput,
  derivation: CanonicalDerivation,
): VehicleOperationalStateResult {
  const { vehicle, telemetry, pickupOdoByBooking } = input;
  const legacyStatus = legacyLabelFromCanonical(derivation.status);
  const bookingDto = buildLegacyBookingDto(derivation.status, input);
  const maintenanceCtx = buildLegacyMaintenanceContext(
    derivation.status,
    vehicle.rawStatus,
  );

  const odometerKm =
    typeof telemetry?.odometerKm === 'number' &&
    Number.isFinite(telemetry.odometerKm)
      ? Math.floor(telemetry.odometerKm)
      : null;

  const fuelPercent = resolveFleetFuelPercentOrNull(
    telemetry,
    vehicle.tankCapacityLiters,
  );

  const evSoc =
    typeof telemetry?.evSoc === 'number' && Number.isFinite(telemetry.evSoc)
      ? Math.min(100, Math.max(0, Math.ceil(telemetry.evSoc)))
      : null;

  return {
    status: legacyStatus,
    maintenanceCtx,
    bookingDto,
    liveKmDriven: resolveLiveKmDriven(
      bookingDto,
      telemetry ?? null,
      pickupOdoByBooking ?? new Map(),
    ),
    odometerKm,
    fuelPercent,
    evSoc,
    ghostStateWarning: derivation.ghostStateWarning,
  };
}

function buildRawVehicleStatusDiagnostic(
  input: VehicleStateEngineInput,
  derivation: CanonicalDerivation,
): RawVehicleStatusDiagnostic {
  const diagnosticCodes: RawStatusDiagnosticCode[] = [];
  const raw = input.vehicle.rawStatus;

  if (raw === VehicleStatus.RENTED) {
    diagnosticCodes.push('LEGACY_RENTED_PERSISTED');
  }
  if (raw === VehicleStatus.RESERVED) {
    diagnosticCodes.push('LEGACY_RESERVED_PERSISTED');
  }
  if (!isKnownRawStatus(raw)) {
    diagnosticCodes.push('UNKNOWN_ENUM_VALUE');
  }
  if (derivation.reason === 'RAW_STATUS_INCONSISTENT') {
    diagnosticCodes.push('CONFLICTS_WITH_OPERATIONAL_STATE');
  }
  if (
    derivation.outputDataQualityReasons.includes('RAW_STATUS_INCONSISTENT') &&
    derivation.status !== 'UNKNOWN'
  ) {
    diagnosticCodes.push('CONFLICTS_WITH_OPERATIONAL_STATE');
  }

  return {
    value: raw,
    persistedAt: input.vehicle.persistedAt ?? null,
    isLegacyOrInconsistent:
      diagnosticCodes.length > 0 || derivation.status === 'UNKNOWN',
    diagnosticCodes,
  };
}

function buildBookingContextBlock(
  input: VehicleStateEngineInput,
): BookingContextBlock {
  const { bookingState } = input;
  if (bookingState.dataQualityState === 'UNAVAILABLE') {
    return {
      activeBooking: null,
      reservedBooking: null,
      nextBooking: null,
      futureBookingCount: 0,
    };
  }
  return {
    activeBooking: bookingState.activeBooking ?? null,
    reservedBooking: bookingState.reservationWindowBooking ?? null,
    nextBooking: bookingState.nextBooking ?? null,
    futureBookingCount: bookingState.futureBookingCount,
  };
}

function collectDiagnosticReasons(
  input: VehicleStateEngineInput,
  derivation: CanonicalDerivation,
): string[] {
  const reasons: string[] = [
    ...derivation.outputDataQualityReasons,
    ...input.maintenanceState.reasonCodes,
    ...input.blockingState.reasonCodes,
  ];
  if (derivation.ghostStateWarning) {
    reasons.push('RAW_STATUS_INCONSISTENT');
  }
  return [...new Set(reasons)];
}

/**
 * V2 state engine entry point — accepts normalized domain inputs (§16).
 */
export function buildVehicleOperationalStateFromEngineInput(
  input: VehicleStateEngineInput,
): VehicleStateEngineOutput {
  assertEngineTimezone(input.context);

  const derivation = deriveCanonicalOperationalState(input);
  const derivedAt = input.context.now.toISOString();
  const { effectiveFrom, effectiveUntil } = resolveEffectiveWindow(
    derivation.status,
    input,
  );
  const legacy = buildLegacyProjection(input, derivation);

  const operationalState: OperationalStateBlock = {
    status: derivation.status,
    reason: derivation.reason,
    source: resolveOperationalSource(input, derivation.status),
    effectiveFrom,
    effectiveUntil,
    derivedAt,
    dataQualityState: derivation.outputDataQualityState,
    dataQualityReasons: derivation.outputDataQualityReasons,
    isReliable:
      derivation.outputDataQualityState === 'RELIABLE' &&
      derivation.status !== 'UNKNOWN',
  };

  return {
    operationalState,
    bookingContext: buildBookingContextBlock(input),
    rawVehicleStatus: buildRawVehicleStatusDiagnostic(input, derivation),
    diagnosticReasons: collectDiagnosticReasons(input, derivation),
    legacy,
  };
}
