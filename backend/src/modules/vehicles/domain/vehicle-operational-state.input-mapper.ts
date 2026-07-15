import { VehicleStatus } from '@prisma/client';
import type { FleetVehicleBookingContextDto } from './vehicle-operational-state.types';
import {
  NEUTRAL_BOOKING_DISPLAY_LABEL,
} from './vehicle-booking-context.types';
import {
  DEFAULT_ORGANIZATION_TIMEZONE,
  EMPTY_BOOKING_STATE_INPUT,
  type BuildVehicleStateEngineInputParams,
  type DataQualityReasonCode,
  type DataQualityState,
  type DomainBookingRef,
  type VehicleStateEngineBlockingStateInput,
  type VehicleStateEngineBookingStateInput,
  type VehicleStateEngineContextInput,
  type VehicleStateEngineInput,
  type VehicleStateEngineMaintenanceStateInput,
} from './vehicle-operational-state.engine.types';

export function assertEngineTimezone(
  context: Pick<VehicleStateEngineContextInput, 'organizationTimezone'>,
): void {
  if (!context.organizationTimezone?.trim()) {
    throw new Error(
      'VehicleStateEngineInput.context.organizationTimezone is required',
    );
  }
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function activeRefFromLegacyDto(
  dto: FleetVehicleBookingContextDto,
  vehicleId: string,
): DomainBookingRef | null {
  if (!dto.activeBookingId) return null;
  return {
    id: dto.activeBookingId,
    bookingNumber: NEUTRAL_BOOKING_DISPLAY_LABEL,
    bookingNumberDiagnostic: 'MISSING_DISPLAY_REF',
    status: 'ACTIVE',
    pickupAt: dto.activeStartAt ?? '',
    returnAt: dto.activeReturnAt ?? '',
    customerLabel: dto.activeCustomerName,
    vehicleId,
    phase: 'active_rental',
    returnStationName: dto.activeReturnStationName,
    kmIncluded: dto.activeKmIncluded,
    kmDriven: dto.activeKmDriven,
    isOverdue: dto.activeIsOverdue,
  };
}

function reservationRefFromLegacyDto(
  dto: FleetVehicleBookingContextDto,
  vehicleId: string,
): DomainBookingRef | null {
  if (!dto.reservedBookingId) return null;
  return {
    id: dto.reservedBookingId,
    bookingNumber: NEUTRAL_BOOKING_DISPLAY_LABEL,
    bookingNumberDiagnostic: 'MISSING_DISPLAY_REF',
    status: 'CONFIRMED',
    pickupAt: dto.reservedPickupAt ?? '',
    returnAt: dto.reservedReturnAt ?? '',
    customerLabel: dto.reservedCustomerName,
    vehicleId,
    phase: 'pickup_window',
    pickupStationName: dto.reservedPickupStationName,
    isOverdue: dto.reservedIsOverdue,
  };
}

/**
 * Maps legacy flat booking DTO → normalized engine booking state.
 * V1: reserved slot doubles as reservation-window + future booking — unchanged here.
 */
export function mapLegacyBookingDtoToBookingState(
  bookingCtx: FleetVehicleBookingContextDto | null | undefined,
  vehicleId: string,
  options?: {
    dataQualityState?: DataQualityState;
    dataQualityReasons?: DataQualityReasonCode[];
  },
): VehicleStateEngineBookingStateInput {
  if (!bookingCtx) {
    return {
      ...EMPTY_BOOKING_STATE_INPUT,
      dataQualityState: options?.dataQualityState ?? 'RELIABLE',
      dataQualityReasons: options?.dataQualityReasons ?? [],
    };
  }

  const activeBooking = activeRefFromLegacyDto(bookingCtx, vehicleId);
  const reservationWindowBooking = reservationRefFromLegacyDto(
    bookingCtx,
    vehicleId,
  );

  return {
    activeBooking,
    reservationWindowBooking,
    nextBooking: null,
    futureBookingCount: 0,
    dataQualityState: options?.dataQualityState ?? 'RELIABLE',
    dataQualityReasons: options?.dataQualityReasons ?? [],
  };
}

export function mapRawStatusToMaintenanceState(
  rawStatus: VehicleStatus | string | null | undefined,
): VehicleStateEngineMaintenanceStateInput {
  if (rawStatus === VehicleStatus.IN_SERVICE) {
    return {
      isMaintenance: true,
      reasonCodes: ['SCHEDULED_SERVICE'],
      source: 'ADMIN_PERSISTED',
    };
  }
  return {
    isMaintenance: false,
    reasonCodes: [],
    source: 'NONE',
  };
}

export function mapRawStatusToBlockingState(
  rawStatus: VehicleStatus | string | null | undefined,
): VehicleStateEngineBlockingStateInput {
  if (rawStatus === VehicleStatus.OUT_OF_SERVICE) {
    return {
      isBlocked: true,
      level: 'hard',
      reasonCodes: ['OPERATIONAL_BLOCK'],
      source: 'ADMIN_PERSISTED',
    };
  }
  return {
    isBlocked: false,
    level: 'none',
    reasonCodes: [],
    source: 'NONE',
  };
}

export function buildVehicleStateEngineInput(
  params: BuildVehicleStateEngineInputParams,
): VehicleStateEngineInput {
  const now = params.now ?? new Date();
  const organizationTimezone =
    params.organizationTimezone?.trim() || DEFAULT_ORGANIZATION_TIMEZONE;

  const context: VehicleStateEngineContextInput = {
    now,
    organizationTimezone,
  };
  assertEngineTimezone(context);

  const bookingState =
    params.bookingState ??
    mapLegacyBookingDtoToBookingState(params.bookingCtx ?? null, params.vehicle.id, {
      dataQualityState: params.bookingDataQuality,
      dataQualityReasons: params.bookingDataQualityReasons,
    });

  return {
    vehicle: {
      id: params.vehicle.id,
      organizationId: params.vehicle.organizationId,
      rawStatus: params.vehicle.status,
      licensePlate: params.vehicle.licensePlate ?? null,
      tankCapacityLiters: params.vehicle.tankCapacityLiters ?? null,
      serviceNote: params.vehicle.serviceNote ?? null,
      persistedAt: toIso(params.vehicle.updatedAt),
    },
    bookingState,
    maintenanceState: mapRawStatusToMaintenanceState(params.vehicle.status),
    blockingState: mapRawStatusToBlockingState(params.vehicle.status),
    context,
    telemetry: params.telemetry ?? null,
    pickupOdoByBooking: params.pickupOdoByBooking ?? new Map(),
  };
}

export function mapBookingStateToLegacyDto(
  bookingState: VehicleStateEngineBookingStateInput,
  vehicleId: string,
): FleetVehicleBookingContextDto | null {
  if (bookingState.dataQualityState === 'UNAVAILABLE') {
    return null;
  }

  const active = bookingState.activeBooking ?? null;
  const reserved = bookingState.reservationWindowBooking ?? null;

  if (!active && !reserved) {
    return null;
  }

  return {
    reservedBookingId: reserved?.id ?? null,
    reservedCustomerName: reserved?.customerLabel ?? null,
    reservedPickupAt: reserved?.pickupAt ?? null,
    reservedReturnAt: reserved?.returnAt ?? null,
    reservedPickupStationName: reserved?.pickupStationName ?? null,
    reservedIsOverdue: reserved?.isOverdue ?? false,
    activeBookingId: active?.id ?? null,
    activeCustomerName: active?.customerLabel ?? null,
    activeStartAt: active?.pickupAt ?? null,
    activeReturnAt: active?.returnAt ?? null,
    activeReturnStationName: active?.returnStationName ?? null,
    activeKmIncluded: active?.kmIncluded ?? null,
    activeKmDriven: active?.kmDriven ?? null,
    activeIsOverdue: active?.isOverdue ?? false,
  };
}
