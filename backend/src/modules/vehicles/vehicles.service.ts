import { Injectable, NotFoundException, Inject, Logger, forwardRef } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import {
  Vehicle,
  Prisma,
  FuelType,
  VehicleType,
  VehicleStatus,
  HealthStatus,
  CleaningStatus,
  EnrichmentJobType,
  BatterySourceType,
  BookingStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { RedisService } from '@shared/redis/redis.service';
import { DimoAuthService } from '@modules/dimo/dimo-auth.service';
import { DimoTelemetryService } from '@modules/dimo/dimo-telemetry.service';
import { VehicleProviderConsentService } from './vehicle-provider-consent.service';
import dimoConfig from '@config/dimo.config';
import {
  parsePagination,
  buildPaginatedResult,
  PaginationParams,
  PaginatedResult,
} from '@shared/utils/pagination';
import { interpretVehicleState } from './vehicle-state-interpreter';
import type { FleetConnectivityQueryDto } from './dto/fleet-connectivity-query.dto';
import {
  buildFleetConnectivitySummary,
  DEFAULT_FLEET_CONNECTIVITY_LIMIT,
  FLEET_CONNECTIVITY_HARD_LIMIT,
  FLEET_CONNECTIVITY_THRESHOLDS,
  mapFleetConnectivityVehicle,
  matchesFleetConnectivitySearch,
  paginateFleetConnectivityVehicles,
} from './fleet-connectivity.util';
import type { FleetConnectivityResponseDto } from './fleet-connectivity.types';
import { TireLifecycleService } from '@modules/vehicle-intelligence/tires/tire-lifecycle.service';
import { BrakeLifecycleService } from '@modules/vehicle-intelligence/brakes/brake-lifecycle.service';
import {
  applyNewBrakeDefaults,
  hasRegistrationBrakeSpecValues,
  normalizeRegistrationBrakeCondition,
  shouldInitializeBrakesFromRegistration,
  type RegistrationBrakeManualSpec,
} from '@modules/vehicle-intelligence/brakes/register-brake-baseline';
import { DataAuthorizationsService } from '@modules/data-authorizations/data-authorizations.service';
import { DataAuthorizationEnforcementService } from '@modules/data-authorizations/data-authorization-enforcement.service';
import { DeviceConnectionQueryService } from '@modules/dimo/device-connection-query.service';
import { buildFleetDeviceConnectionFields } from '@modules/dimo/device-connection-read-model';
import {
  buildVehicleOperationalStateFromEngineInput,
  buildVehicleStateEngineInput,
  DEFAULT_ORGANIZATION_TIMEZONE,
  EMPTY_BOOKING_CONTEXT,
  resolveFleetFuelPercent,
} from './domain/vehicle-operational-state.builder';
import {
  assembleBookingContextMap,
  unavailableBookingContextMap,
} from './domain/vehicle-booking-context.assembler';
import {
  formatBookingCustomerLabel,
  type VehicleBookingQueryRow,
} from './domain/vehicle-booking-context.types';
import type { VehicleStateEngineBookingStateInput } from './domain/vehicle-operational-state.engine.types';
import type {
  FleetMaintenanceReasonCode,
  FleetVehicleBookingContextDto,
  FleetVehicleMaintenanceContextDto,
} from './domain/vehicle-operational-state.types';
export { EMPTY_BOOKING_CONTEXT } from './domain/vehicle-operational-state.builder';

const DIMO_FUEL_TYPE_MAP: Record<string, FuelType> = {
  GASOLINE: FuelType.GASOLINE,
  DIESEL: FuelType.DIESEL,
  ELECTRIC: FuelType.ELECTRIC,
  HYBRID: FuelType.HYBRID,
  PLUGIN_HYBRID: FuelType.PLUGIN_HYBRID,
  GAS: FuelType.GASOLINE,
  PETROL: FuelType.GASOLINE,
  OTHER: FuelType.OTHER,
};

// V4.6.86 — Platform-admin status labels. Aligned with the rental
// `RENTAL_STATUS_MAP` for the shared states (`Available`, `Reserved`,
// `Active Rented`). Keeps the admin-only distinction between
// scheduled `Maintenance` (IN_SERVICE) and an explicit operational
// `Blocked` (OUT_OF_SERVICE) so platform operators can still see
// whether a vehicle is down by choice or by break-down. Previously
// used `Rented`, which caused terminology drift between master and
// rental surfaces.
const VEHICLE_STATUS_MAP: Record<VehicleStatus, string> = {
  AVAILABLE: 'Available',
  RENTED: 'Active Rented',
  IN_SERVICE: 'Maintenance',
  OUT_OF_SERVICE: 'Blocked',
  RESERVED: 'Reserved',
};

// Rental Fleet/Dashboard status keys — see domain/vehicle-operational-state.types.ts
// `RENTAL_STATUS_MAP` for the canonical fleet derivation builder.

const HEALTH_STATUS_MAP: Record<HealthStatus, string> = {
  GOOD: 'Good',
  WARNING: 'Warning',
  CRITICAL: 'Critical',
};

const RENTAL_HEALTH_MAP: Record<HealthStatus, string> = {
  GOOD: 'Good Health',
  WARNING: 'Warning',
  CRITICAL: 'Critical',
};

const CLEANING_STATUS_MAP: Record<CleaningStatus, string> = {
  CLEAN: 'Clean',
  NEEDS_CLEANING: 'Needs Cleaning',
};

const FUEL_TYPE_LABEL: Record<FuelType, string> = {
  GASOLINE: 'Gasoline',
  DIESEL: 'Diesel',
  ELECTRIC: 'Electric',
  HYBRID: 'Hybrid',
  PLUGIN_HYBRID: 'Plug-in Hybrid',
  OTHER: 'Other',
};

function centsToEur(cents: number | null | undefined): string {
  if (cents == null) return '0.00';
  return (cents / 100).toFixed(2);
}

const FULL_VEHICLE_INCLUDE = {
  homeStation: true,
  dimoVehicle: true,
  latestState: true,
  batterySpecs: { orderBy: { createdAt: 'desc' as const }, take: 1 },
  tireSetups: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    include: {
      measurements: { orderBy: { measuredAt: 'desc' as const }, take: 1 },
    },
  },
  brakeSpecs: { orderBy: { createdAt: 'desc' as const }, take: 1 },
  serviceEvents: { orderBy: { eventDate: 'desc' as const }, take: 5 },
} satisfies Prisma.VehicleInclude;

const FULL_VEHICLE_WITH_ORG_INCLUDE = {
  ...FULL_VEHICLE_INCLUDE,
  organization: true,
} satisfies Prisma.VehicleInclude;

// Fleet booking/maintenance DTOs — domain/vehicle-operational-state.types.ts

export interface FleetMapVehicleDto
  extends FleetVehicleBookingContextDto,
    FleetVehicleMaintenanceContextDto {
  id: string;
  licensePlate: string | null;
  displayName: string;
  make: string | null;
  model: string;
  year: number | null;
  status: string;
  fuelType: string;
  healthStatus: string;
  cleaningStatus: string;
  stationId: string | null;
  stationName: string | null;
  latitude: number | null;
  longitude: number | null;
  lastSeenAt: string | null;
  signalAgeMs: number;
  isFresh: boolean;
  onlineStatus: string;
  telemetryFreshness: string;
  displayState: string;
  displayIgnition: string;
  isLiveTracking: boolean;
  heading: number | null;
  imageUrl: string | null;
  // V4.6.84 — telemetry summary so map markers can render fuel/SoC and
  // odometer without a second round-trip. Nullable when no telemetry
  // state exists yet.
  odometerKm: number | null;
  fuelPercent: number | null;
  evSoc: number | null;
  isElectric: boolean;
}

@Injectable()
export class VehiclesService {
  private readonly logger = new Logger(VehiclesService.name);

  /** @deprecated Prefer `EMPTY_BOOKING_CONTEXT` import from domain module. */
  static readonly EMPTY_BOOKING_CONTEXT = EMPTY_BOOKING_CONTEXT;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly dimoAuth: DimoAuthService,
    private readonly dimoTelemetry: DimoTelemetryService,
    private readonly providerConsent: VehicleProviderConsentService,
    @Inject(forwardRef(() => TireLifecycleService))
    private readonly tireLifecycleService: TireLifecycleService,
    @Inject(forwardRef(() => BrakeLifecycleService))
    private readonly brakeLifecycleService: BrakeLifecycleService,
    private readonly dataAuthorizations: DataAuthorizationsService,
    private readonly dataAuthEnforcement: DataAuthorizationEnforcementService,
    private readonly deviceConnectionQuery: DeviceConnectionQueryService,
    @Inject(dimoConfig.KEY) private readonly dimoConf: ConfigType<typeof dimoConfig>,
  ) {}

  // Short-lived cache for the fleet-map endpoint. The UI polls every few
  // seconds for live tracking; a 5s TTL makes the common case (heartbeat
  // refresh) serve from Redis instead of Postgres without sacrificing
  // perceived freshness (telemetry lag is > 5s anyway on most providers).
  private static readonly FLEET_MAP_CACHE_TTL_SECONDS = 5;
  private fleetMapCacheKey(orgId: string) {
    return `fleet-map:${orgId}:v1`;
  }

  private withOrgScope(organizationId: string) {
    return { organizationId };
  }

  private async buildTripStateMap(
    vehicleIds: string[],
  ): Promise<Map<string, { state: any }>> {
    if (vehicleIds.length === 0) return new Map();
    const rows = await this.prisma.vehicleTripDetectionState
      .findMany({
        where: { vehicleId: { in: vehicleIds } },
        select: { vehicleId: true, state: true },
      })
      .catch(() => [] as { vehicleId: string; state: any }[]);
    return new Map(rows.map((r) => [r.vehicleId, { state: r.state }]));
  }

  /**
   * V4.9.476 — Canonical booking context for fleet operational state.
   *
   * Loads tenant-scoped bookings in one query (+ batched stations), then
   * assembles normalized engine input: activeBooking, reservationWindowBooking,
   * nextBooking, futureBookingCount, dataQualityState.
   */
  private async buildBookingContextMap(
    organizationId: string,
    vehicleIds: string[],
    organizationTimezone: string = DEFAULT_ORGANIZATION_TIMEZONE,
  ): Promise<Map<string, VehicleStateEngineBookingStateInput>> {
    if (vehicleIds.length === 0) return new Map();

    const evaluationAt = new Date();
    let queryFailed = false;
    const rows = await this.prisma.booking
      .findMany({
        where: {
          organizationId,
          vehicleId: { in: vehicleIds },
          OR: [
            { status: 'ACTIVE' },
            {
              status: { in: ['PENDING', 'CONFIRMED'] as BookingStatus[] },
              endDate: { gte: evaluationAt },
            },
          ],
        },
        select: {
          id: true,
          vehicleId: true,
          organizationId: true,
          status: true,
          startDate: true,
          endDate: true,
          kmIncluded: true,
          kmDriven: true,
          pickupStationId: true,
          returnStationId: true,
          actualPickupStationId: true,
          actualReturnStationId: true,
          completedAt: true,
          customer: {
            select: { firstName: true, lastName: true, company: true },
          },
        },
        orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
      })
      .catch(() => {
        queryFailed = true;
        return [];
      });

    if (queryFailed) {
      return unavailableBookingContextMap(vehicleIds);
    }

    const stationIds = Array.from(
      new Set(
        rows
          .flatMap((r) => [r.pickupStationId, r.returnStationId])
          .filter((x): x is string => !!x),
      ),
    );
    const stationMap = new Map<string, string>();
    if (stationIds.length > 0) {
      const stations = await this.prisma.station
        .findMany({
          where: { id: { in: stationIds }, organizationId },
          select: { id: true, name: true },
        })
        .catch(() => [] as Array<{ id: string; name: string }>);
      for (const s of stations) stationMap.set(s.id, s.name);
    }

    const bookingIds = rows.map((r) => r.id);
    let handoverQueryFailed = false;
    const handoverRows =
      bookingIds.length === 0
        ? []
        : await this.prisma.bookingHandoverProtocol
            .findMany({
              where: {
                organizationId,
                bookingId: { in: bookingIds },
              },
              select: {
                bookingId: true,
                kind: true,
                performedAt: true,
              },
            })
            .catch(() => {
              handoverQueryFailed = true;
              return [] as Array<{
                bookingId: string;
                kind: 'PICKUP' | 'RETURN';
                performedAt: Date;
              }>;
            });

    const handoverByBooking = new Map<
      string,
      { pickupPerformedAt: Date | null; returnPerformedAt: Date | null }
    >();
    for (const id of bookingIds) {
      handoverByBooking.set(id, {
        pickupPerformedAt: null,
        returnPerformedAt: null,
      });
    }
    for (const h of handoverRows) {
      const entry = handoverByBooking.get(h.bookingId)!;
      if (h.kind === 'PICKUP') entry.pickupPerformedAt = h.performedAt;
      if (h.kind === 'RETURN') entry.returnPerformedAt = h.performedAt;
    }

    const bookingRows: VehicleBookingQueryRow[] = rows.map((r) => {
      const handoverSignals = handoverByBooking.get(r.id)!;
      return {
        id: r.id,
        vehicleId: r.vehicleId,
        organizationId: r.organizationId,
        status: r.status,
        startDate: r.startDate,
        endDate: r.endDate,
        kmIncluded: r.kmIncluded,
        kmDriven: r.kmDriven,
        pickupStationId: r.pickupStationId,
        returnStationId: r.returnStationId,
        customerLabel: formatBookingCustomerLabel(r.customer),
        pickupStationName: r.pickupStationId
          ? stationMap.get(r.pickupStationId) ?? null
          : null,
        returnStationName: r.returnStationId
          ? stationMap.get(r.returnStationId) ?? null
          : null,
        handover: {
          pickupPerformedAt: handoverSignals.pickupPerformedAt,
          returnPerformedAt: handoverSignals.returnPerformedAt,
          completedAt: r.completedAt,
          actualPickupStationId: r.actualPickupStationId,
          actualReturnStationId: r.actualReturnStationId,
        },
      };
    });

    const map = assembleBookingContextMap({
      organizationId,
      vehicleIds,
      bookings: bookingRows,
      evaluationAt,
      organizationTimezone,
    });

    if (handoverQueryFailed) {
      for (const [vehicleId, state] of map.entries()) {
        const hasActiveCandidate = bookingRows.some(
          (b) => b.vehicleId === vehicleId && b.status === 'ACTIVE',
        );
        if (!hasActiveCandidate) continue;
        const reasons = [...state.dataQualityReasons];
        if (!reasons.includes('HANDOVER_QUERY_FAILED')) {
          reasons.push('HANDOVER_QUERY_FAILED');
        }
        map.set(vehicleId, {
          ...state,
          activeBooking: null,
          dataQualityState: 'DEGRADED',
          dataQualityReasons: reasons,
        });
      }
    }

    return map;
  }

  /**
   * V4.6.84 — Resolve the odometer recorded at booking handover (PICKUP).
   * Used to compute a live "kmDriven so far" for ACTIVE bookings by
   * subtracting this value from the current `VehicleLatestState.odometerKm`.
   * Batched, safe on empty input, and resilient to DB errors.
   */
  private async fetchPickupOdometerMap(
    organizationId: string,
    bookingIds: string[],
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (bookingIds.length === 0) return map;
    // V4.6.85 — explicit tenant scope. Booking IDs are already org-scoped
    // upstream, but joining on `booking.organizationId` defends against a
    // future caller that forgets to pre-filter.
    const rows = await this.prisma.bookingHandoverProtocol
      .findMany({
        where: {
          bookingId: { in: bookingIds },
          kind: 'PICKUP',
          booking: { organizationId },
        },
        select: { bookingId: true, odometerKm: true },
      })
      .catch(() => [] as Array<{ bookingId: string; odometerKm: number }>);
    for (const r of rows) {
      if (typeof r.odometerKm === 'number' && Number.isFinite(r.odometerKm)) {
        map.set(r.bookingId, r.odometerKm);
      }
    }
    return map;
  }

  // ── Mapping: RegisteredVehicle (Master Admin) ─────────────────────

  mapToRegisteredVehicle(
    v: any,
    tripStateMap?: Map<string, { state: any }>,
  ) {
    const battery = v.batterySpecs?.[0];
    const tireSetup = v.tireSetups?.[0];
    const measurement = tireSetup?.measurements?.[0];
    const brake = v.brakeSpecs?.[0];
    const state = v.latestState;

    const lastInspection = v.serviceEvents?.find(
      (e: any) => e.eventType === 'GENERAL_INSPECTION',
    );
    const lastOilChange = v.serviceEvents?.find(
      (e: any) => e.eventType === 'OIL_CHANGE',
    );
    const lastBrakePadChange = v.serviceEvents?.find(
      (e: any) => e.eventType === 'BRAKE_SERVICE',
    );

    const tripState = tripStateMap?.get(v.id) ?? null;
    const interpreted = interpretVehicleState(
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

    return {
      id: v.id,
      vehicleName: v.vehicleName ?? `${v.make} ${v.model}`,
      vin: v.vin,
      make: v.make,
      model: v.model,
      year: v.year,
      organizationId: v.organizationId,
      organizationName: v.organization?.companyName ?? '',
      station: v.homeStation?.name ?? '',
      status: VEHICLE_STATUS_MAP[v.status as VehicleStatus] ?? 'Available',
      health: HEALTH_STATUS_MAP[v.healthStatus as HealthStatus] ?? 'Good',
      lastSignal: interpreted.lastSignal,
      online: interpreted.isFresh,
      fuelType: FUEL_TYPE_LABEL[v.fuelType as FuelType] ?? 'Other',
      mileage: v.mileageKm ?? 0,
      licensePlate: v.licensePlate ?? '',
      vehicleType: v.vehicleType ?? '',
      cleaningStatus:
        CLEANING_STATUS_MAP[v.cleaningStatus as CleaningStatus] ?? 'Clean',
      notes: v.notes ?? '',
      batteryType: battery?.batteryType ?? '',
      batteryAmpere: battery?.batteryAmpere?.toString() ?? '',
      batteryVolt: battery?.batteryVolt?.toString() ?? '',
      tireFrontDimension: tireSetup?.frontDimension ?? '',
      tireFrontBrandModel: tireSetup?.brandModelFront ?? '',
      tireFrontSeason: tireSetup?.tireSeason ?? '',
      tireFrontDot: (tireSetup as any)?.dotCodeFront ?? '',
      tireFrontLoadIndex: (tireSetup as any)?.loadIndexFront ?? '',
      tireFrontSpeedIndex: (tireSetup as any)?.speedIndexFront ?? '',
      tireBackDimension: tireSetup?.rearDimension ?? '',
      tireBackBrandModel: tireSetup?.brandModelRear ?? '',
      tireBackSeason: tireSetup?.tireSeason ?? '',
      tireBackDot: (tireSetup as any)?.dotCodeRear ?? '',
      tireBackLoadIndex: (tireSetup as any)?.loadIndexRear ?? '',
      tireBackSpeedIndex: (tireSetup as any)?.speedIndexRear ?? '',
      treadDepthFL: measurement?.frontLeftMm?.toString() ?? '',
      treadDepthFR: measurement?.frontRightMm?.toString() ?? '',
      treadDepthBL: measurement?.rearLeftMm?.toString() ?? '',
      treadDepthBR: measurement?.rearRightMm?.toString() ?? '',
      brakeFrontRotorDiameter: brake?.frontRotorDiameter?.toString() ?? '',
      brakeFrontRotorWidth: brake?.frontRotorWidth?.toString() ?? '',
      brakeFrontPadThickness: brake?.frontPadThickness?.toString() ?? '',
      brakeBackRotorDiameter: brake?.rearRotorDiameter?.toString() ?? '',
      brakeBackRotorWidth: brake?.rearRotorWidth?.toString() ?? '',
      brakeBackPadThickness: brake?.rearPadThickness?.toString() ?? '',
      idleRpm: v.idleRpm?.toString() ?? '',
      maxRpm: v.maxRpm?.toString() ?? '',
      drivetrain: v.driveType ?? '',
      brakeForceDistribution: v.brakeForceFrontPercent
        ? `${v.brakeForceFrontPercent}% front`
        : '',
      frontToRearWeightDistribution: '',
      curbWeight: v.curbWeightKg?.toString() ?? '',
      serviceIntervals: v.serviceIntervalKm
        ? `${v.serviceIntervalKm} km`
        : v.serviceIntervalMonths
          ? `${v.serviceIntervalMonths} months`
          : '',
      serviceIntervalManufacturerKm:
        v.serviceIntervalManufacturerKm?.toString() ?? '',
      serviceIntervalManufacturerMonths:
        v.serviceIntervalManufacturerMonths?.toString() ?? '',
      oilChangeIntervalKm: v.oilChangeIntervalKm?.toString() ?? '',
      oilChangeIntervalMonths: v.oilChangeIntervalMonths?.toString() ?? '',
      operationalStatus: '',
      lastTuev: v.lastTuvDate?.toISOString() ?? '',
      lastBokraft: v.lastBokraftDate?.toISOString() ?? '',
      lastInspection: lastInspection?.eventDate?.toISOString() ?? '',
      lastOilChange: lastOilChange?.eventDate?.toISOString() ?? '',
      lastBrakePadChange: lastBrakePadChange?.eventDate?.toISOString() ?? '',
      lastBrakeRotorChange: '',
      // Interpreted telemetry fields
      signalAgeMs: interpreted.signalAgeMs,
      isFresh: interpreted.isFresh,
      onlineStatus: interpreted.onlineStatus,
      telemetryFreshness: interpreted.telemetryFreshness,
      displayState: interpreted.displayState,
      displayIgnition: interpreted.displayIgnition,
      isLiveTracking: interpreted.isLiveTracking,
      hardwareType: v.hardwareType ?? 'UNKNOWN',
    };
  }

  // ── Mapping: VehicleData (Rental Dashboard) ───────────────────────

  mapToVehicleData(
    v: any,
    tripStateMap?: Map<string, { state: any }>,
    bookingContextMap?: Map<string, VehicleStateEngineBookingStateInput>,
    pickupOdoByBooking?: Map<string, number>,
    fleetContextOptions?: {
      organizationId: string;
      organizationTimezone: string;
    },
  ) {
    const state = v.latestState;
    const leasing = v.leasingRateCents ?? 0;
    const insurance = v.insuranceCostCents ?? 0;
    const tax = v.taxCostCents ?? 0;
    const totalCents = leasing + insurance + tax;
    const isEv =
      v.fuelType === FuelType.ELECTRIC || v.fuelType === FuelType.PLUGIN_HYBRID;

    const tripState = tripStateMap?.get(v.id) ?? null;
    const interpreted = interpretVehicleState(
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

    // V4.6.85 — Single source of truth for status / booking context /
    // telemetry fallbacks. `getFleetMapData` calls the same helper, so
    // the Fleet page, Dashboard tabs and the map marker layer cannot
    // drift from each other anymore.
    // V4.6.90 — `pickupOdoByBooking` is now a required field on the
    // derivation input; we pass an empty map when a caller did not
    // pre-compute it (e.g. `findById`). An empty map is correct for
    // that case because the vehicle has no in-flight booking at that
    // call site; the derivation will fall through the `liveKmDriven`
    // branch safely.
    const bookingState = bookingContextMap?.get(v.id) ?? null;
    const fleetCtx = this.deriveFleetStatusContext({
      vehicle: v,
      state,
      bookingState,
      pickupOdoByBooking: pickupOdoByBooking ?? new Map(),
      organizationId:
        fleetContextOptions?.organizationId ?? v.organizationId ?? undefined,
      organizationTimezone:
        fleetContextOptions?.organizationTimezone ??
        DEFAULT_ORGANIZATION_TIMEZONE,
    });

    // Legacy numeric fallbacks for existing consumers (RentalVehicleTable
    // counters, CSV exports, …). Telemetry-grade code must read the
    // nullable canonical fields below.
    const odometerLegacy = Math.floor(
      fleetCtx.odometerKm ?? v.mileageKm ?? 0,
    );
    const fuelOrEnergyLegacy = isEv
      ? fleetCtx.evSoc ?? 0
      : fleetCtx.fuelPercent ?? 0;

    return {
      id: v.id,
      license: v.licensePlate ?? '',
      make: v.make ?? '',
      model: v.model,
      year: v.year,
      station: v.homeStation?.name ?? '',
      // V4.6.96 — expose canonical station identity so the Settings →
      // Stations vehicle-assignment modal can render the current
      // station of each vehicle without a second round-trip.
      stationId: v.homeStation?.id ?? null,
      stationName: v.homeStation?.name ?? null,
      homeStationId: v.homeStation?.id ?? null,
      currentStationId: v.currentStationId ?? null,
      expectedStationId: v.expectedStationId ?? null,
      fuelType: FUEL_TYPE_LABEL[v.fuelType as FuelType] ?? 'Other',
      // Rental status is derived from open bookings first, then falls back
      // to the admin-managed DB column. Maintenance wins over booking
      // state — a vehicle physically in service is never reported as
      // Rented or Reserved even if a booking row exists for it.
      status: fleetCtx.status,
      cleaningStatus:
        CLEANING_STATUS_MAP[v.cleaningStatus as CleaningStatus] ?? 'Clean',
      healthStatus:
        RENTAL_HEALTH_MAP[v.healthStatus as HealthStatus] ?? 'Good Health',
      online: interpreted.isFresh,
      lastSignal: interpreted.lastSignal,
      // Legacy numeric fields (always numbers) — kept for backward compat.
      odometer: odometerLegacy,
      fuel: Math.min(100, Math.max(0, Math.ceil(fuelOrEnergyLegacy))),
      battery: fleetCtx.evSoc ?? 0,
      speed: state?.speedKmh ?? 0,
      coolant: state?.coolantTempC ?? 0,
      brakes: state?.brakePadPercent ?? 0,
      tires: state?.tireHealthPercent ?? 0,
      engineOil: state?.engineOilPercent ?? 0,
      // V4.6.85 — canonical telemetry, null-preserving.
      odometerKm: fleetCtx.odometerKm,
      fuelPercent: fleetCtx.fuelPercent,
      evSoc: fleetCtx.evSoc,
      isElectric: isEv,
      hvBatteryCapacityKwh: v.hvBatteryCapacityKwh ?? null,
      tankCapacityLiters: v.tankCapacityLiters ?? null,
      fuelLevel: fleetCtx.fuelPercent,
      lat: state?.latitude ?? null,
      lng: state?.longitude ?? null,
      leasingRate: centsToEur(leasing),
      insuranceCost: centsToEur(insurance),
      taxCost: centsToEur(tax),
      totalMonthlyCost: centsToEur(totalCents),
      // Interpreted telemetry fields
      signalAgeMs: interpreted.signalAgeMs,
      isFresh: interpreted.isFresh,
      onlineStatus: interpreted.onlineStatus,
      telemetryFreshness: interpreted.telemetryFreshness,
      displayState: interpreted.displayState,
      displayIgnition: interpreted.displayIgnition,
      isLiveTracking: interpreted.isLiveTracking,
      imageUrl: v.imageUrl ?? null,
      // V4.6.84 — canonical fleet-status context. All fields nullable;
      // the frontend renders graceful fallbacks when nothing is
      // persisted yet.
      reservedBookingId: fleetCtx.bookingDto.reservedBookingId,
      reservedCustomerName: fleetCtx.bookingDto.reservedCustomerName,
      reservedPickupAt: fleetCtx.bookingDto.reservedPickupAt,
      reservedReturnAt: fleetCtx.bookingDto.reservedReturnAt,
      reservedPickupStationName: fleetCtx.bookingDto.reservedPickupStationName,
      reservedIsOverdue: fleetCtx.bookingDto.reservedIsOverdue,
      activeBookingId: fleetCtx.bookingDto.activeBookingId,
      activeCustomerName: fleetCtx.bookingDto.activeCustomerName,
      activeStartAt: fleetCtx.bookingDto.activeStartAt,
      activeReturnAt: fleetCtx.bookingDto.activeReturnAt,
      activeReturnStationName: fleetCtx.bookingDto.activeReturnStationName,
      activeKmIncluded: fleetCtx.bookingDto.activeKmIncluded,
      activeKmDriven: fleetCtx.liveKmDriven,
      activeIsOverdue: fleetCtx.bookingDto.activeIsOverdue,
      maintenanceReason: fleetCtx.maintenanceCtx.maintenanceReason,
      maintenanceReasonCode: fleetCtx.maintenanceCtx.maintenanceReasonCode,
      maintenanceUrgency: fleetCtx.maintenanceCtx.maintenanceUrgency,
    };
  }

  /**
   * V4.6.90 — Explicit input shape for `deriveFleetStatusContext`.
   *
   * Before V4.6.90 the `pickupOdoByBooking` map was a silently optional
   * 4th positional arg — a future caller that forgot to pass it would
   * silently lose the live `kmDriven` delta for every in-flight ACTIVE
   * booking with no visible error. Making the shape explicit and
   * marking every field as required means the TypeScript compiler now
   * flags the mistake at build time instead of at runtime.
   *
   * Callers MUST pre-compute `bookingState` via `buildBookingContextMap`
   * and `pickupOdoByBooking` via `fetchPickupOdometerMap`. Passing an
   * empty map for vehicles without active bookings is correct and safe.
   */
  /**
   * V4.6.85 — Canonical fleet-status context resolver. Delegates to the
   * pure domain builder (`buildVehicleOperationalState`). Shared between
   * the rental dashboard (`/vehicles`) and the map (`/fleet-map`).
   *
   * V4.6.90 — Ghost-state guard emits `ghostStateWarning` from the builder;
   * this wrapper logs it once per derivation for ops traceability.
   */
  // Visible for tests.
  public deriveFleetStatusContext(input: {
    vehicle: {
      id?: string;
      organizationId?: string;
      status: VehicleStatus | string | null | undefined;
      licensePlate?: string | null;
      tankCapacityLiters?: number | null;
    };
    state: {
      odometerKm?: number | null;
      evSoc?: number | null;
      fuelLevelRelative?: number | null;
      fuelLevelAbsolute?: number | null;
      rawPayloadJson?: unknown;
    } | null;
    bookingState: VehicleStateEngineBookingStateInput | null;
    pickupOdoByBooking: Map<string, number>;
    organizationId?: string;
    organizationTimezone?: string;
  }): {
    status: string;
    maintenanceCtx: FleetVehicleMaintenanceContextDto;
    bookingDto: FleetVehicleBookingContextDto;
    liveKmDriven: number | null;
    odometerKm: number | null;
    fuelPercent: number | null;
    evSoc: number | null;
  } {
    const engineInput = buildVehicleStateEngineInput({
      vehicle: {
        id: input.vehicle.id ?? 'unknown',
        organizationId:
          input.organizationId ?? input.vehicle.organizationId ?? 'unknown',
        status: input.vehicle.status ?? VehicleStatus.AVAILABLE,
        licensePlate: input.vehicle.licensePlate,
        tankCapacityLiters: input.vehicle.tankCapacityLiters,
      },
      bookingState: input.bookingState,
      organizationTimezone:
        input.organizationTimezone ?? DEFAULT_ORGANIZATION_TIMEZONE,
      telemetry: input.state,
      pickupOdoByBooking: input.pickupOdoByBooking,
    });
    const engineOutput =
      buildVehicleOperationalStateFromEngineInput(engineInput);
    if (engineOutput.legacy.ghostStateWarning) {
      this.logger.warn(engineOutput.legacy.ghostStateWarning);
    }
    const { ghostStateWarning: _ghost, ...fleetCtx } = engineOutput.legacy;
    return fleetCtx;
  }

  private extractHeading(rawPayload: unknown): number | null {
    if (!rawPayload || typeof rawPayload !== 'object') return null;
    const raw = rawPayload as Record<string, unknown>;

    const directKeys = ['heading', 'bearing', 'course'] as const;
    for (const key of directKeys) {
      const value = raw[key];
      if (typeof value === 'number' && Number.isFinite(value)) return value;
    }

    const nestedCandidates: unknown[] = [
      raw.currentLocationHeading,
      raw.currentLocationCoordinates,
      raw.currentLocationCourse,
      raw.location,
      raw.position,
    ];

    for (const candidate of nestedCandidates) {
      if (!candidate || typeof candidate !== 'object') continue;
      const obj = candidate as Record<string, unknown>;
      const fromValue = obj.value;
      if (typeof fromValue === 'number' && Number.isFinite(fromValue)) return fromValue;
      if (fromValue && typeof fromValue === 'object') {
        const nestedValue = fromValue as Record<string, unknown>;
        for (const key of directKeys) {
          const v = nestedValue[key];
          if (typeof v === 'number' && Number.isFinite(v)) return v;
        }
      }
      for (const key of directKeys) {
        const v = obj[key];
        if (typeof v === 'number' && Number.isFinite(v)) return v;
      }
    }

    return null;
  }

  // ── CRUD ──────────────────────────────────────────────────────────

  async create(
    organizationId: string,
    data: Omit<Prisma.VehicleCreateInput, 'organization'>,
    createdByUserId?: string,
  ): Promise<Vehicle> {
    return this.prisma.vehicle.create({
      data: {
        ...data,
        organization: { connect: { id: organizationId } },
        createdByUserId: createdByUserId ?? null,
      },
    });
  }

  async findByOrganization(
    organizationId: string,
    params?: PaginationParams,
  ): Promise<PaginatedResult<any>> {
    const { skip, take } = parsePagination(params || {});
    const where = this.withOrgScope(organizationId);
    const [data, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: FULL_VEHICLE_INCLUDE,
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    const vehicleIds = data.map((v) => v.id);
    const orgTimezone = await this.resolveOrganizationTimezone(organizationId);
    const [tripStateMap, bookingContextMap] = await Promise.all([
      this.buildTripStateMap(vehicleIds),
      this.buildBookingContextMap(organizationId, vehicleIds, orgTimezone),
    ]);
    const activeBookingIds = Array.from(bookingContextMap.values())
      .map((ctx) => ctx.activeBooking?.id ?? null)
      .filter((id): id is string => !!id);
    const pickupOdoByBooking = await this.fetchPickupOdometerMap(
      organizationId,
      activeBookingIds,
    );

    return buildPaginatedResult(
      data.map((v) =>
        this.mapToVehicleData(
          v,
          tripStateMap,
          bookingContextMap,
          pickupOdoByBooking,
          { organizationId, organizationTimezone: orgTimezone },
        ),
      ),
      total,
      params || {},
    );
  }

  private async resolveOrganizationTimezone(
    organizationId: string,
  ): Promise<string> {
    const org = await this.prisma.organization
      .findUnique({
        where: { id: organizationId },
        select: { timezone: true },
      })
      .catch(() => null);
    return org?.timezone?.trim() || DEFAULT_ORGANIZATION_TIMEZONE;
  }

  async getFleetMapData(organizationId: string): Promise<FleetMapVehicleDto[]> {
    // Try cache first. We intentionally swallow Redis errors — fleet map must
    // never 500 because cache is momentarily unreachable.
    const cacheKey = this.fleetMapCacheKey(organizationId);
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as FleetMapVehicleDto[];
      }
    } catch (err: any) {
      this.logger.debug(`Fleet-map cache read failed (${err?.message ?? err})`);
    }

    const where = this.withOrgScope(organizationId);
    // Hard cap to prevent unbounded queries for very large fleets. The UI
    // paginates/virtualises at 500+ markers anyway. Orgs exceeding this cap
    // should migrate to a clustered / bbox-scoped endpoint.
    const FLEET_MAP_HARD_LIMIT = 500;
    const vehicles = await this.prisma.vehicle.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: FLEET_MAP_HARD_LIMIT,
      select: {
        id: true,
        licensePlate: true,
        vehicleName: true,
        make: true,
        model: true,
        year: true,
        status: true,
        fuelType: true,
        healthStatus: true,
        cleaningStatus: true,
        imageUrl: true,
        tankCapacityLiters: true,
        homeStationId: true,
        currentStationId: true,
        expectedStationId: true,
        homeStation: { select: { id: true, name: true } },
        latestState: {
          select: {
            latitude: true,
            longitude: true,
            lastSeenAt: true,
            speedKmh: true,
            isIgnitionOn: true,
            engineLoad: true,
            tractionBatteryPowerKw: true,
            coolantTempC: true,
            odometerKm: true,
            fuelLevelRelative: true,
            fuelLevelAbsolute: true,
            evSoc: true,
            rawPayloadJson: true,
          },
        },
      },
    });

    const vehicleIdsForMap = vehicles.map((v) => v.id);
    const organizationTimezone =
      await this.resolveOrganizationTimezone(organizationId);
    const [tripStateMap, bookingContextMap] = await Promise.all([
      this.buildTripStateMap(vehicleIdsForMap),
      this.buildBookingContextMap(
        organizationId,
        vehicleIdsForMap,
        organizationTimezone,
      ),
    ]);

    const activeBookingIds = Array.from(bookingContextMap.values())
      .map((ctx) => ctx.activeBooking?.id ?? null)
      .filter((id): id is string => !!id);
    const pickupOdoByBooking = await this.fetchPickupOdometerMap(
      organizationId,
      activeBookingIds,
    );

    const result: FleetMapVehicleDto[] = vehicles.map((vehicle) => {
      const state = vehicle.latestState;
      const tripState = tripStateMap.get(vehicle.id) ?? null;
      const interpreted = interpretVehicleState(
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

      const bookingState = bookingContextMap.get(vehicle.id) ?? null;
      const fleetCtx = this.deriveFleetStatusContext({
        vehicle: { ...vehicle, organizationId },
        state,
        bookingState,
        pickupOdoByBooking,
        organizationId,
        organizationTimezone,
      });
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
        fuelType: FUEL_TYPE_LABEL[vehicle.fuelType as FuelType] ?? 'Other',
        healthStatus:
          RENTAL_HEALTH_MAP[vehicle.healthStatus as HealthStatus] ?? 'Good Health',
        cleaningStatus:
          CLEANING_STATUS_MAP[vehicle.cleaningStatus as CleaningStatus] ?? 'Clean',
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
        heading: this.extractHeading(state?.rawPayloadJson),
        imageUrl: vehicle.imageUrl ?? null,
        odometerKm: fleetCtx.odometerKm,
        fuelPercent: fleetCtx.fuelPercent,
        evSoc: fleetCtx.evSoc,
        isElectric,
        ...fleetCtx.bookingDto,
        activeKmDriven: fleetCtx.liveKmDriven,
        ...fleetCtx.maintenanceCtx,
      };
    });

    try {
      await this.redis.set(
        cacheKey,
        JSON.stringify(result),
        'EX',
        VehiclesService.FLEET_MAP_CACHE_TTL_SECONDS,
      );
    } catch (err: any) {
      this.logger.debug(`Fleet-map cache write failed (${err?.message ?? err})`);
    }

    return result;
  }

  async findById(id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: FULL_VEHICLE_WITH_ORG_INCLUDE,
    });
    if (!vehicle) return null;
    const tripStateMap = await this.buildTripStateMap([vehicle.id]);
    return this.mapToRegisteredVehicle(vehicle, tripStateMap);
  }

  async findOne(organizationId: string, id: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id, ...this.withOrgScope(organizationId) },
      include: FULL_VEHICLE_INCLUDE,
    });
    if (!vehicle) return null;
    const organizationTimezone =
      await this.resolveOrganizationTimezone(organizationId);
    const [tripStateMap, bookingContextMap] = await Promise.all([
      this.buildTripStateMap([vehicle.id]),
      this.buildBookingContextMap(
        organizationId,
        [vehicle.id],
        organizationTimezone,
      ),
    ]);
    const activeBookingIds = Array.from(bookingContextMap.values())
      .map((ctx) => ctx.activeBooking?.id ?? null)
      .filter((id): id is string => !!id);
    const pickupOdoByBooking = await this.fetchPickupOdometerMap(
      organizationId,
      activeBookingIds,
    );
    return this.mapToVehicleData(
      vehicle,
      tripStateMap,
      bookingContextMap,
      pickupOdoByBooking,
      { organizationId, organizationTimezone },
    );
  }

  async findAllPlatform(
    params?: PaginationParams,
  ): Promise<PaginatedResult<any>> {
    const { skip, take } = parsePagination(params || {});
    const [data, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: FULL_VEHICLE_WITH_ORG_INCLUDE,
      }),
      this.prisma.vehicle.count(),
    ]);
    const tripStateMap = await this.buildTripStateMap(
      data.map((v) => v.id),
    );
    return buildPaginatedResult(
      data.map((v) => this.mapToRegisteredVehicle(v, tripStateMap)),
      total,
      params || {},
    );
  }

  async getVehicleWithTelemetry(vehicleId: string, organizationId?: string) {
    const where = organizationId
      ? { id: vehicleId, organizationId }
      : { id: vehicleId };
    const vehicle = await this.prisma.vehicle.findFirst({
      where,
      include: {
        homeStation: true,
        latestState: true,
        dimoVehicle: true,
      },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    const state = vehicle.latestState;
    let latitude = state?.latitude ?? null;
    let longitude = state?.longitude ?? null;

    const tripDetState = await this.prisma.vehicleTripDetectionState
      .findUnique({ where: { vehicleId }, select: { state: true } })
      .catch(() => null);

    const interpreted = interpretVehicleState(
      {
        lastSeenAt: state?.lastSeenAt ?? null,
        speedKmh: state?.speedKmh ?? null,
        isIgnitionOn: state?.isIgnitionOn ?? null,
        engineLoad: state?.engineLoad ?? null,
        tractionBatteryPowerKw: state?.tractionBatteryPowerKw ?? null,
        coolantTempC: state?.coolantTempC ?? null,
        odometerKm: state?.odometerKm ?? null,
      },
      tripDetState,
    );

    const needsFreshGps =
      (latitude == null || longitude == null || interpreted.isLiveTracking) &&
      vehicle.dimoVehicle?.tokenId != null;

    if (needsFreshGps) {
      try {
        const jwt = await this.dimoAuth.getVehicleJwt(
          vehicle.dimoVehicle!.tokenId!,
        );
        const raw = await this.dimoTelemetry.fetchLastSeenLocation(
          jwt,
          vehicle.dimoVehicle!.tokenId!,
        );
        const data = (raw as any)?.data ?? raw;
        const signals = Array.isArray(data?.signalsLatest)
          ? data.signalsLatest[0]
          : data?.signalsLatest;
        if (signals) {
          const loc = signals.currentLocationCoordinates as
            | { value?: { latitude?: number; longitude?: number } }
            | undefined;
          const lat = loc?.value?.latitude;
          const lng = loc?.value?.longitude;
          if (
            typeof lat === 'number' &&
            typeof lng === 'number' &&
            !Number.isNaN(lat) &&
            !Number.isNaN(lng)
          ) {
            latitude = lat;
            longitude = lng;
          }
        }
      } catch {
        // Keep cached values; DIMO fetch failed
      }
    }

    return {
      id: vehicle.id,
      vin: vehicle.vin,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      station: vehicle.homeStation?.name ?? '',
      online: interpreted.isFresh,
      lastSignal: interpreted.lastSignal,
      speed: state?.speedKmh ?? 0,
      odometer: state?.odometerKm ?? vehicle.mileageKm ?? 0,
      fuel: resolveFleetFuelPercent(state, vehicle.tankCapacityLiters),
      battery: state?.evSoc ?? 0,
      coolant: state?.coolantTempC ?? 0,
      brakes: state?.brakePadPercent ?? 0,
      tires: state?.tireHealthPercent ?? 0,
      engineOil: state?.engineOilPercent ?? 0,
      oilLevel: state?.oilLevelRelative ?? 0,
      lvBatteryVoltage: state?.lvBatteryVoltage ?? 0,
      engineLoad: state?.engineLoad ?? 0,
      isIgnitionOn: state?.isIgnitionOn ?? null,
      latitude,
      longitude,
      signalAgeMs: interpreted.signalAgeMs,
      isFresh: interpreted.isFresh,
      onlineStatus: interpreted.onlineStatus,
      telemetryFreshness: interpreted.telemetryFreshness,
      displayState: interpreted.displayState,
      displayIgnition: interpreted.displayIgnition,
      isLiveTracking: interpreted.isLiveTracking,
      displaySpeed: interpreted.displaySpeed,
      displayCoolant: interpreted.displayCoolant,
      displayEngineLoad: interpreted.displayEngineLoad,
      tripDetectionState: interpreted.tripDetectionState,
    };
  }

  // ── Live GPS (direct DIMO proxy, no DB caching) ──────────────────

  async getLiveGps(vehicleId: string, organizationId?: string) {
    const where = organizationId
      ? { id: vehicleId, organizationId }
      : { id: vehicleId };
    const vehicle = await this.prisma.vehicle.findFirst({
      where,
      select: {
        id: true,
        dimoVehicle: { select: { tokenId: true } },
        latestState: { select: { latitude: true, longitude: true } },
      },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    const tokenId = vehicle.dimoVehicle?.tokenId;
    if (!tokenId) {
      return {
        latitude: vehicle.latestState?.latitude ?? null,
        longitude: vehicle.latestState?.longitude ?? null,
        speedKmh: null,
        lastSeenAt: null,
        source: 'cache' as const,
      };
    }

    if (organizationId) {
      await this.dataAuthorizations.ensureDimoTelemetryAuthorization(
        organizationId,
      );
      await this.dataAuthEnforcement.assertDataAuthorization({
        orgId: organizationId,
        vehicleId,
        sourceType: 'DIMO',
        dataCategory: 'GPS_LOCATION',
        purpose: 'LIVE_MAP',
        processorType: 'SYNQDRIVE',
        trackAccess: true,
      });
    }

    try {
      const jwt = await this.dimoAuth.getVehicleJwt(tokenId);
      const raw = await this.dimoTelemetry.fetchLastSeenLocation(jwt, tokenId);
      const data = (raw as any)?.data ?? raw;
      const signals = Array.isArray(data?.signalsLatest)
        ? data.signalsLatest[0]
        : data?.signalsLatest;

      if (!signals) {
        return {
          latitude: vehicle.latestState?.latitude ?? null,
          longitude: vehicle.latestState?.longitude ?? null,
          speedKmh: null,
          lastSeenAt: null,
          source: 'cache' as const,
        };
      }

      const loc = signals.currentLocationCoordinates as
        | { timestamp?: string; value?: { latitude?: number; longitude?: number } }
        | undefined;
      const speedSig = signals.speed as
        | { timestamp?: string; value?: number }
        | undefined;

      const lat = loc?.value?.latitude;
      const lng = loc?.value?.longitude;
      const speedKmh = typeof speedSig?.value === 'number' ? speedSig.value : null;
      const lastSeenAt = signals.lastSeen ?? loc?.timestamp ?? null;

      if (typeof lat === 'number' && typeof lng === 'number' && !Number.isNaN(lat) && !Number.isNaN(lng)) {
        return { latitude: lat, longitude: lng, speedKmh, lastSeenAt, source: 'dimo' as const };
      }

      return {
        latitude: vehicle.latestState?.latitude ?? null,
        longitude: vehicle.latestState?.longitude ?? null,
        speedKmh,
        lastSeenAt,
        source: 'cache' as const,
      };
    } catch (err) {
      this.logger.warn(`Live GPS DIMO fetch failed for ${vehicleId}: ${(err as Error).message}`);
      return {
        latitude: vehicle.latestState?.latitude ?? null,
        longitude: vehicle.latestState?.longitude ?? null,
        speedKmh: null,
        lastSeenAt: null,
        source: 'cache' as const,
      };
    }
  }

  // ── Mutations ─────────────────────────────────────────────────────

  async update(
    id: string,
    data: Prisma.VehicleUpdateInput,
    organizationId?: string,
  ): Promise<Vehicle> {
    const where: Prisma.VehicleWhereUniqueInput = { id };
    if (organizationId) {
      const existing = await this.prisma.vehicle.findFirst({
        where: { id, ...this.withOrgScope(organizationId) },
      });
      if (!existing) throw new NotFoundException('Vehicle not found');
    } else {
      await this.prisma.vehicle.findUniqueOrThrow({ where: { id } });
    }
    return this.prisma.vehicle.update({ where, data });
  }

  async upsertTireData(
    vehicleId: string,
    organizationId: string,
    tires: {
      frontDimension?: string | null;
      rearDimension?: string | null;
      brandModelFront?: string | null;
      brandModelRear?: string | null;
      tireSeason?: string | null;
      loadIndexFront?: string | null;
      speedIndexFront?: string | null;
      loadIndexRear?: string | null;
      speedIndexRear?: string | null;
      dotCodeFront?: string | null;
      dotCodeRear?: string | null;
      treadFL?: number | null;
      treadFR?: number | null;
      treadBL?: number | null;
      treadBR?: number | null;
      tireCondition?: string | null;
    },
  ) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, ...this.withOrgScope(organizationId) },
      select: { id: true },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    return this.tireLifecycleService.upsertSetupAndMeasurement({
      vehicleId,
      organizationId,
      frontDimension: tires.frontDimension ?? null,
      rearDimension: tires.rearDimension ?? null,
      brandModelFront: tires.brandModelFront ?? null,
      brandModelRear: tires.brandModelRear ?? null,
      tireSeason: tires.tireSeason ?? null,
      loadIndexFront: tires.loadIndexFront ?? null,
      speedIndexFront: tires.speedIndexFront ?? null,
      loadIndexRear: tires.loadIndexRear ?? null,
      speedIndexRear: tires.speedIndexRear ?? null,
      dotCodeFront: tires.dotCodeFront ?? null,
      dotCodeRear: tires.dotCodeRear ?? null,
      treadFL: tires.treadFL ?? null,
      treadFR: tires.treadFR ?? null,
      treadBL: tires.treadBL ?? null,
      treadBR: tires.treadBR ?? null,
      tireCondition: tires.tireCondition ?? null,
      source: 'manual_edit',
    });
  }

  async updateCleaningStatus(
    vehicleId: string,
    cleaningStatus: CleaningStatus,
  ): Promise<Vehicle> {
    await this.prisma.vehicle.findUniqueOrThrow({
      where: { id: vehicleId },
    });
    return this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { cleaningStatus },
    });
  }

  async updateHealthStatus(
    vehicleId: string,
    healthStatus: HealthStatus,
  ): Promise<Vehicle> {
    await this.prisma.vehicle.findUniqueOrThrow({
      where: { id: vehicleId },
    });
    return this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { healthStatus },
    });
  }

  async delete(id: string, organizationId?: string): Promise<Vehicle> {
    const where: Prisma.VehicleWhereUniqueInput = { id };
    if (organizationId) {
      await this.prisma.vehicle.findFirstOrThrow({
        where: { id, ...this.withOrgScope(organizationId) },
      });
    } else {
      await this.prisma.vehicle.findUniqueOrThrow({ where: { id } });
    }
    return this.prisma.vehicle.delete({ where });
  }

  /**
   * Deregister reverses a SynqDrive registration.
   * The Vehicle row (+ cascaded SynqDrive operational data) is removed.
   * The underlying DimoVehicle identity is preserved (FK onDelete: SetNull)
   * and reappears in "Non Registered Vehicles" for future re-registration.
   */
  async deregister(vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findUniqueOrThrow({
      where: { id: vehicleId },
      select: {
        id: true,
        vin: true,
        make: true,
        model: true,
        year: true,
        licensePlate: true,
        organizationId: true,
        dimoVehicleId: true,
        status: true,
      },
    });

    await this.prisma.vehicle.delete({ where: { id: vehicleId } });

    this.logger.log(
      `Vehicle deregistered: ${vehicle.make} ${vehicle.model} (${vehicle.vin}) — org=${vehicle.organizationId}, dimoVehicleId=${vehicle.dimoVehicleId ?? 'none'}`,
    );

    return {
      success: true,
      deregisteredVehicle: {
        id: vehicle.id,
        vin: vehicle.vin,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        licensePlate: vehicle.licensePlate,
        dimoVehicleId: vehicle.dimoVehicleId,
      },
    };
  }

  private parseFuelType(input: unknown, fallback: FuelType): FuelType {
    if (input == null || input === '') return fallback;
    if (typeof input === 'string') {
      const k = input.toUpperCase().replace(/\s+/g, '_');
      const alias: Record<string, FuelType> = {
        ...DIMO_FUEL_TYPE_MAP,
        PLUGIN_HYBRID: FuelType.PLUGIN_HYBRID,
        PLUGINHYBRID: FuelType.PLUGIN_HYBRID,
        PHEV: FuelType.PLUGIN_HYBRID,
      };
      return alias[k] ?? fallback;
    }
    return input as FuelType;
  }

  private parseVehicleType(input: unknown): VehicleType | undefined {
    if (input == null || input === '') return undefined;
    if (typeof input !== 'string') return input as VehicleType;
    const k = input.toUpperCase().replace(/\s+/g, '_');
    const map: Record<string, VehicleType> = {
      SEDAN: VehicleType.SEDAN,
      SUV: VehicleType.SUV,
      HATCHBACK: VehicleType.HATCHBACK,
      WAGON: VehicleType.WAGON,
      COUPE: VehicleType.COUPE,
      CONVERTIBLE: VehicleType.CONVERTIBLE,
      VAN: VehicleType.VAN,
      TRUCK: VehicleType.TRUCK,
      MINIVAN: VehicleType.MINIVAN,
      SPORTS: VehicleType.COUPE,
      OTHER: VehicleType.OTHER,
    };
    return map[k];
  }

  async registerFromDimo(
    orgId: string,
    stationId: string | null,
    dimoVehicleId: string,
    extraData?: Partial<Prisma.VehicleCreateInput> & {
      fuelType?: FuelType | string;
      vehicleType?: VehicleType | string;
    },
    manualSpecs?: {
      battery?: {
        batteryType?: string | null;
        batteryAmpere?: number | null;
        batteryVolt?: number | null;
      };
      brakes?: RegistrationBrakeManualSpec;
      tires?: {
        frontDimension?: string | null;
        rearDimension?: string | null;
        brandModelFront?: string | null;
        brandModelRear?: string | null;
        tireSeason?: string | null;
        loadIndexFront?: string | null;
        speedIndexFront?: string | null;
        loadIndexRear?: string | null;
        speedIndexRear?: string | null;
        dotCodeFront?: string | null;
        dotCodeRear?: string | null;
        tireCondition?: string | null;
        initialTreadFrontMm?: number | null;
        initialTreadRearMm?: number | null;
        treadFL?: number | null;
        treadFR?: number | null;
        treadBL?: number | null;
        treadBR?: number | null;
        aiTireSpec?: Record<string, unknown> | null;
      };
    },
    createdByUserId?: string | null,
  ): Promise<Vehicle> {
    const dimoVehicle = await this.prisma.dimoVehicle.findUniqueOrThrow({
      where: { id: dimoVehicleId },
    });

    const defaultFuel: FuelType =
      dimoVehicle.fuelType &&
      DIMO_FUEL_TYPE_MAP[dimoVehicle.fuelType.toUpperCase()]
        ? DIMO_FUEL_TYPE_MAP[dimoVehicle.fuelType.toUpperCase()]
        : FuelType.OTHER;

    const fuelFromExtra = extraData?.fuelType
      ? this.parseFuelType(extraData.fuelType, defaultFuel)
      : defaultFuel;

    const { fuelType: _f, vehicleType: _vt, ...restExtra } = extraData ?? {};
    const vehicleTypeParsed = this.parseVehicleType(extraData?.vehicleType);

    const createData: Prisma.VehicleCreateInput = {
      organization: { connect: { id: orgId } },
      dimoVehicle: { connect: { id: dimoVehicleId } },
      vin: dimoVehicle.vin || `DIMO-${dimoVehicle.externalId}`,
      make: dimoVehicle.make || 'Unknown',
      model: dimoVehicle.model || 'Unknown',
      year: dimoVehicle.year || new Date().getFullYear(),
      fuelType: fuelFromExtra,
      ...(vehicleTypeParsed && { vehicleType: vehicleTypeParsed }),
      ...(stationId && {
        homeStation: { connect: { id: stationId } },
        currentStation: { connect: { id: stationId } },
      }),
      ...restExtra,
    };

    const vehicle = await this.prisma.vehicle.create({
      data: {
        ...createData,
        ...(createdByUserId ? { createdByUserId } : {}),
      },
    });

    // Record DIMO provider consent grant (fire-and-forget — never blocks vehicle creation)
    void this.providerConsent.recordDimoConsent({
      vehicleId: vehicle.id,
      organizationId: orgId,
      dimoExternalId: dimoVehicle.externalId,
      dimoTokenId: dimoVehicle.tokenId ?? null,
      grantedByUserId: createdByUserId ?? null,
      metadataJson: { registeredVin: vehicle.vin, dimoVehicleId },
    });

    if (manualSpecs?.battery) {
      const b = manualSpecs.battery;
      const hasAny =
        (b.batteryType != null && String(b.batteryType).trim() !== '') ||
        b.batteryAmpere != null ||
        b.batteryVolt != null;
      if (hasAny) {
        await this.prisma.vehicleBatterySpec.create({
          data: {
            vehicleId: vehicle.id,
            batteryType: b.batteryType?.trim() || null,
            batteryAmpere: b.batteryAmpere ?? null,
            batteryVolt: b.batteryVolt ?? null,
            sourceType: BatterySourceType.MANUAL,
            sourceConfidence: 1,
          },
        });
      }
    }

    if (manualSpecs?.brakes) {
      const rawBrakes = manualSpecs.brakes;
      const condition = normalizeRegistrationBrakeCondition(rawBrakes.condition);
      const brakesForSpec = applyNewBrakeDefaults(rawBrakes, condition);
      const shouldCreateSpec =
        condition === 'NEW' || hasRegistrationBrakeSpecValues(brakesForSpec);

      if (shouldCreateSpec) {
        await this.prisma.vehicleBrakeReferenceSpec.create({
          data: {
            vehicleId: vehicle.id,
            frontRotorDiameter: brakesForSpec.frontRotorDiameter ?? null,
            frontRotorWidth: brakesForSpec.frontRotorWidth ?? null,
            frontPadThickness: brakesForSpec.frontPadThickness ?? null,
            rearRotorDiameter: brakesForSpec.rearRotorDiameter ?? null,
            rearRotorWidth: brakesForSpec.rearRotorWidth ?? null,
            rearPadThickness: brakesForSpec.rearPadThickness ?? null,
            sourceType: rawBrakes.source?.trim() || 'manual_registration',
          },
        });
      }

      if (shouldInitializeBrakesFromRegistration(rawBrakes)) {
        const latestState = await this.prisma.vehicleLatestState.findUnique({
          where: { vehicleId: vehicle.id },
          select: { odometerKm: true },
        });
        try {
          await this.brakeLifecycleService.initializeFromRegistration({
            vehicleId: vehicle.id,
            brakes: rawBrakes,
            registrationMileageKm: vehicle.mileageKm,
            latestStateOdometerKm: latestState?.odometerKm ?? null,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `Brake registration baseline init failed for vehicle ${vehicle.id}: ${msg}`,
          );
        }
      }
    }

    if (manualSpecs?.tires) {
      const tr = manualSpecs.tires;
      const hasTireInput = [
        tr.frontDimension,
        tr.rearDimension,
        tr.brandModelFront,
        tr.brandModelRear,
        tr.tireSeason,
        tr.loadIndexFront,
        tr.speedIndexFront,
        tr.loadIndexRear,
        tr.speedIndexRear,
        tr.dotCodeFront,
        tr.dotCodeRear,
        tr.tireCondition,
        tr.initialTreadFrontMm,
        tr.initialTreadRearMm,
        tr.treadFL,
        tr.treadFR,
        tr.treadBL,
        tr.treadBR,
      ].some((v) => v != null && String(v).trim() !== '');

      if (hasTireInput) {
        const result = await this.tireLifecycleService.upsertSetupAndMeasurement({
          vehicleId: vehicle.id,
          organizationId: orgId,
          frontDimension: tr.frontDimension ?? null,
          rearDimension: tr.rearDimension ?? null,
          brandModelFront: tr.brandModelFront ?? null,
          brandModelRear: tr.brandModelRear ?? null,
          tireSeason: tr.tireSeason ?? null,
          loadIndexFront: tr.loadIndexFront ?? null,
          speedIndexFront: tr.speedIndexFront ?? null,
          loadIndexRear: tr.loadIndexRear ?? null,
          speedIndexRear: tr.speedIndexRear ?? null,
          dotCodeFront: tr.dotCodeFront ?? null,
          dotCodeRear: tr.dotCodeRear ?? null,
          treadFL: tr.treadFL ?? null,
          treadFR: tr.treadFR ?? null,
          treadBL: tr.treadBL ?? null,
          treadBR: tr.treadBR ?? null,
          tireCondition: tr.tireCondition ?? null,
          source: 'manual_registration',
        });

        if (
          result.setup?.id &&
          (tr.initialTreadFrontMm != null || tr.initialTreadRearMm != null)
        ) {
          await this.prisma.vehicleTireSetup.update({
            where: { id: result.setup.id },
            data: {
              initialTreadFrontMm: tr.initialTreadFrontMm ?? undefined,
              initialTreadRearMm: tr.initialTreadRearMm ?? undefined,
            },
          });
        }

        if (tr.aiTireSpec && result.setup?.id) {
          await this.prisma.vehicleTireSetup.update({
            where: { id: result.setup.id },
            data: { aiTireSpec: tr.aiTireSpec as any },
          });
        }
      }
    }

    await Promise.all([
      this.prisma.vehicleEnrichmentJob.create({
        data: {
          vehicle: { connect: { id: vehicle.id } },
          jobType: EnrichmentJobType.BATTERY,
          status: 'PENDING',
        },
      }),
      this.prisma.vehicleEnrichmentJob.create({
        data: {
          vehicle: { connect: { id: vehicle.id } },
          jobType: EnrichmentJobType.BRAKE,
          status: 'PENDING',
        },
      }),
    ]);

    void this.dataAuthorizations.ensureDimoTelemetryAuthorization(orgId);

    return vehicle;
  }

  async getFleetConnectivity(
    organizationId: string,
    query: FleetConnectivityQueryDto = {},
  ): Promise<FleetConnectivityResponseDto> {
    const generatedAt = new Date().toISOString();
    const nowMs = Date.now();
    const page = query.page ?? 1;
    const limit =
      query.limit ??
      (query.page != null
        ? DEFAULT_FLEET_CONNECTIVITY_LIMIT
        : FLEET_CONNECTIVITY_HARD_LIMIT);

    const vehicles = await this.prisma.vehicle.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: FLEET_CONNECTIVITY_HARD_LIMIT,
      include: {
        dimoVehicle: true,
        latestState: true,
        homeStation: { select: { name: true } },
      },
    });

    const vehicleIds = vehicles.map((v) => v.id);
    const hardwareById = new Map(
      vehicles.map((v) => [v.id, v.hardwareType as string | null]),
    );
    const dimoLinkedById = new Map(
      vehicles.map((v) => [v.id, v.dimoVehicleId != null]),
    );
    const deviceSummaries = await this.deviceConnectionQuery.getFleetSummariesForVehicles(
      organizationId,
      vehicleIds,
      hardwareById,
      dimoLinkedById,
    );

    let mapped = vehicles.map((v) => {
      const summary = deviceSummaries.get(v.id);
      const deviceConnection =
        summary && (summary.lteR1Capable || summary.lastWebhookReceivedAt)
          ? buildFleetDeviceConnectionFields(summary)
          : null;
      return mapFleetConnectivityVehicle(v, nowMs, deviceConnection);
    });

    if (query.status) {
      mapped = mapped.filter((v) => v.connectionStatus === query.status);
    }
    if (query.q?.trim()) {
      mapped = mapped.filter((v) =>
        matchesFleetConnectivitySearch(v, query.q!),
      );
    }

    const summary = buildFleetConnectivitySummary(mapped);
    const paginationResult = paginateFleetConnectivityVehicles(
      mapped,
      page,
      limit,
    );

    return {
      generatedAt,
      thresholds: { ...FLEET_CONNECTIVITY_THRESHOLDS },
      summary,
      pagination: {
        page: paginationResult.page,
        limit: paginationResult.limit,
        total: paginationResult.total,
        totalInOrganization: vehicles.length,
      },
      vehicles: paginationResult.pageItems,
    };
  }

  async getDeviceConnection(organizationId: string, vehicleId: string) {
    return this.deviceConnectionQuery.getVehicleSummary(organizationId, vehicleId, {
      eventLimit: 20,
    });
  }

  async listVehicleComplaints(organizationId: string, vehicleId: string) {
    const v = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { id: true },
    });
    if (!v) throw new NotFoundException('Vehicle not found');
    return this.prisma.vehicleComplaint.findMany({
      where: { vehicleId, organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createVehicleComplaint(
    organizationId: string,
    vehicleId: string,
    createdByUserId: string | undefined,
    body: { description: string; urgency?: string; region?: string | null },
  ) {
    const v = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { id: true },
    });
    if (!v) throw new NotFoundException('Vehicle not found');

    const urgencyRaw = (body.urgency || 'MEDIUM').toUpperCase();
    const urgency =
      urgencyRaw === 'LOW' ||
      urgencyRaw === 'MEDIUM' ||
      urgencyRaw === 'HIGH' ||
      urgencyRaw === 'CRITICAL'
        ? urgencyRaw
        : 'MEDIUM';

    const complaint = await this.prisma.vehicleComplaint.create({
      data: {
        organizationId,
        vehicleId,
        createdByUserId: createdByUserId ?? null,
        description: body.description.trim(),
        urgency: urgency as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
        region: body.region?.trim() || null,
        source: 'MANUAL',
      },
    });

    const taskPriority =
      urgency === 'CRITICAL'
        ? 'CRITICAL'
        : urgency === 'HIGH'
          ? 'HIGH'
          : urgency === 'LOW'
            ? 'LOW'
            : 'NORMAL';

    try {
      await this.prisma.orgTask.create({
        data: {
          organizationId,
          vehicleId,
          title: `Complaint: ${body.description.slice(0, 72)}${body.description.length > 72 ? '…' : ''}`,
          description: body.description,
          category: 'VEHICLE_COMPLAINT',
          status: 'OPEN',
          priority: taskPriority,
        },
      });
    } catch (err: any) {
      this.logger.warn(`Could not create OrgTask for complaint: ${err?.message ?? err}`);
    }

    return complaint;
  }
}
