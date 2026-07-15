import { FuelType } from '@prisma/client';
import { interpretVehicleState } from '../vehicle-state-interpreter';
import type { FleetMapVehicleDto } from '../vehicles.service';
import type {
  FleetVehicleBookingContextDto,
  FleetVehicleFutureBookingDto,
  FleetVehicleMaintenanceContextDto,
} from './vehicle-operational-state.types';
import type {
  FleetBookingContextDto,
} from './vehicle-booking-context.serializer';
import type { FleetOperationalStateDto } from './vehicle-operational-state.serializer';
import type { FleetRawVehicleStatusDto } from './vehicle-operational-state.serializer';
import type { CompactOperationalVehicleDto } from './vehicle-fleet-read-model.types';

const FUEL_TYPE_LABEL: Record<FuelType, string> = {
  GASOLINE: 'Gasoline',
  DIESEL: 'Diesel',
  ELECTRIC: 'Electric',
  HYBRID: 'Hybrid',
  PLUGIN_HYBRID: 'Plug-in Hybrid',
  OTHER: 'Other',
};

const RENTAL_HEALTH_MAP = {
  GOOD: 'Good Health',
  WARNING: 'Warning',
  CRITICAL: 'Critical',
} as const;

const CLEANING_STATUS_MAP = {
  CLEAN: 'Clean',
  NEEDS_CLEANING: 'Needs Cleaning',
} as const;

export interface FleetOperationalProjection {
  status: string;
  operationalState: FleetOperationalStateDto;
  rawVehicleStatus?: FleetRawVehicleStatusDto;
  bookingContext: FleetBookingContextDto;
  bookingDto: FleetVehicleBookingContextDto;
  maintenanceCtx: FleetVehicleMaintenanceContextDto;
  nextBooking: FleetVehicleFutureBookingDto | null;
  futureBookingCount: number;
  odometerKm: number | null;
  fuelPercent: number | null;
  evSoc: number | null;
  liveKmDriven: number | null;
}

export interface FleetMapVehicleSource {
  id: string;
  organizationId?: string;
  licensePlate?: string | null;
  vehicleName?: string | null;
  make?: string | null;
  model: string;
  year?: number | null;
  fuelType?: FuelType | null;
  healthStatus?: string | null;
  cleaningStatus?: string | null;
  imageUrl?: string | null;
  tankCapacityLiters?: number | null;
  homeStation?: { id: string; name: string } | null;
  currentStationId?: string | null;
  expectedStationId?: string | null;
  latestState?: {
    latitude?: number | null;
    longitude?: number | null;
    lastSeenAt?: Date | null;
    speedKmh?: number | null;
    isIgnitionOn?: boolean | null;
    engineLoad?: number | null;
    tractionBatteryPowerKw?: number | null;
    coolantTempC?: number | null;
    odometerKm?: number | null;
    rawPayloadJson?: unknown;
  } | null;
}

export function interpretFleetVehicleTelemetry(
  state: FleetMapVehicleSource['latestState'],
  tripState: { state: any } | null,
) {
  return interpretVehicleState(
    {
      lastSeenAt: state?.lastSeenAt ?? null,
      speedKmh: state?.speedKmh ?? null,
      isIgnitionOn: state?.isIgnitionOn ?? null,
      engineLoad: state?.engineLoad ?? null,
      tractionBatteryPowerKw: state?.tractionBatteryPowerKw ?? null,
      coolantTempC: state?.coolantTempC ?? null,
      odometerKm: state?.odometerKm ?? null,
    },
    tripState,
  );
}

export function buildFleetMapVehicleDto(input: {
  vehicle: FleetMapVehicleSource;
  fleetCtx: FleetOperationalProjection;
  interpreted: ReturnType<typeof interpretFleetVehicleTelemetry>;
  heading?: number | null;
}): FleetMapVehicleDto {
  const { vehicle, fleetCtx, interpreted } = input;
  const state = vehicle.latestState;
  const isElectric =
    vehicle.fuelType === FuelType.ELECTRIC ||
    vehicle.fuelType === FuelType.PLUGIN_HYBRID;

  return {
    id: vehicle.id,
    licensePlate: vehicle.licensePlate ?? null,
    displayName:
      vehicle.vehicleName ??
      [vehicle.make, vehicle.model].filter(Boolean).join(' ').trim(),
    make: vehicle.make ?? null,
    model: vehicle.model,
    year: vehicle.year ?? null,
    status: fleetCtx.status,
    operationalState: fleetCtx.operationalState,
    bookingContext: fleetCtx.bookingContext,
    fuelType: FUEL_TYPE_LABEL[vehicle.fuelType as FuelType] ?? 'Other',
    healthStatus:
      RENTAL_HEALTH_MAP[vehicle.healthStatus as keyof typeof RENTAL_HEALTH_MAP] ??
      'Good Health',
    cleaningStatus:
      CLEANING_STATUS_MAP[
        vehicle.cleaningStatus as keyof typeof CLEANING_STATUS_MAP
      ] ?? 'Clean',
    stationId: vehicle.homeStation?.id ?? null,
    stationName: vehicle.homeStation?.name ?? null,
    homeStationId: vehicle.homeStation?.id ?? null,
    currentStationId: vehicle.currentStationId ?? null,
    expectedStationId: vehicle.expectedStationId ?? null,
    latitude: state?.latitude ?? null,
    longitude: state?.longitude ?? null,
    lastSeenAt: state?.lastSeenAt?.toISOString() ?? null,
    signalAgeMs: interpreted.signalAgeMs,
    isFresh: interpreted.isFresh,
    onlineStatus: interpreted.onlineStatus,
    telemetryFreshness: interpreted.telemetryFreshness,
    displayState: interpreted.displayState,
    displayIgnition: interpreted.displayIgnition,
    isLiveTracking: interpreted.isLiveTracking,
    heading: input.heading ?? null,
    imageUrl: vehicle.imageUrl ?? null,
    odometerKm: fleetCtx.odometerKm,
    fuelPercent: fleetCtx.fuelPercent,
    evSoc: fleetCtx.evSoc,
    isElectric,
    ...fleetCtx.bookingDto,
    activeKmDriven: fleetCtx.liveKmDriven,
    nextBooking: fleetCtx.nextBooking,
    futureBookingCount: fleetCtx.futureBookingCount,
    ...fleetCtx.maintenanceCtx,
  };
}

export function buildCompactOperationalVehicleDto(input: {
  id: string;
  displayName: string;
  licensePlate: string | null;
  fleetCtx: FleetOperationalProjection;
}): CompactOperationalVehicleDto {
  return {
    id: input.id,
    displayName: input.displayName,
    licensePlate: input.licensePlate,
    status: input.fleetCtx.status,
    operationalState: input.fleetCtx.operationalState,
    bookingContext: input.fleetCtx.bookingContext,
  };
}

/** Canonical operational triple used by contract tests across read-model shapes. */
export function extractOperationalContractSlice(
  fleetCtx: Pick<FleetOperationalProjection, 'operationalState'>,
) {
  return {
    status: fleetCtx.operationalState.status,
    reason: fleetCtx.operationalState.reason,
    dataQualityState: fleetCtx.operationalState.dataQualityState,
    isReliable: fleetCtx.operationalState.isReliable,
  };
}
