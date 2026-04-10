import { Injectable, NotFoundException, Inject, Logger } from '@nestjs/common';
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
  TireSeason,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DimoTriggersService } from '@modules/dimo/dimo-triggers.service';
import { DimoAuthService } from '@modules/dimo/dimo-auth.service';
import { DimoTelemetryService } from '@modules/dimo/dimo-telemetry.service';
import dimoConfig from '@config/dimo.config';
import {
  parsePagination,
  buildPaginatedResult,
  PaginationParams,
  PaginatedResult,
} from '@shared/utils/pagination';
import { interpretVehicleState } from './vehicle-state-interpreter';
import { extractConnectivitySnapshot } from '@shared/utils/connectivity-signals';

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

const VEHICLE_STATUS_MAP: Record<VehicleStatus, string> = {
  AVAILABLE: 'Available',
  RENTED: 'Rented',
  IN_SERVICE: 'Maintenance',
  OUT_OF_SERVICE: 'Blocked',
  RESERVED: 'Reserved',
};

const RENTAL_STATUS_MAP: Record<VehicleStatus, string> = {
  AVAILABLE: 'Available',
  RENTED: 'Active Rented',
  RESERVED: 'Reserved',
  IN_SERVICE: 'Maintenance',
  OUT_OF_SERVICE: 'Maintenance',
};

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
  station: true,
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

@Injectable()
export class VehiclesService {
  private readonly logger = new Logger(VehiclesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dimoTriggers: DimoTriggersService,
    private readonly dimoAuth: DimoAuthService,
    private readonly dimoTelemetry: DimoTelemetryService,
    @Inject(dimoConfig.KEY) private readonly dimoConf: ConfigType<typeof dimoConfig>,
  ) {}

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
      station: v.station?.name ?? '',
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
  ) {
    const state = v.latestState;
    const leasing = v.leasingRateCents ?? 0;
    const insurance = v.insuranceCostCents ?? 0;
    const tax = v.taxCostCents ?? 0;
    const totalCents = leasing + insurance + tax;
    const fuelPercent = this.resolveFuelPercent(state, v.tankCapacityLiters);
    const isEv =
      v.fuelType === FuelType.ELECTRIC || v.fuelType === FuelType.PLUGIN_HYBRID;
    const fuelOrEnergyPct = isEv ? (state?.evSoc ?? 0) : fuelPercent;

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
      license: v.licensePlate ?? '',
      make: v.make ?? '',
      model: v.model,
      year: v.year,
      station: v.station?.name ?? '',
      fuelType: FUEL_TYPE_LABEL[v.fuelType as FuelType] ?? 'Other',
      status: RENTAL_STATUS_MAP[v.status as VehicleStatus] ?? 'Available',
      cleaningStatus:
        CLEANING_STATUS_MAP[v.cleaningStatus as CleaningStatus] ?? 'Clean',
      healthStatus:
        RENTAL_HEALTH_MAP[v.healthStatus as HealthStatus] ?? 'Good Health',
      online: interpreted.isFresh,
      lastSignal: interpreted.lastSignal,
      odometer: Math.floor(state?.odometerKm ?? v.mileageKm ?? 0),
      fuel: Math.min(100, Math.max(0, Math.ceil(fuelOrEnergyPct))),
      battery: state?.evSoc ?? 0,
      speed: state?.speedKmh ?? 0,
      coolant: state?.coolantTempC ?? 0,
      brakes: state?.brakePadPercent ?? 0,
      tires: state?.tireHealthPercent ?? 0,
      engineOil: state?.engineOilPercent ?? 0,
      isElectric: v.fuelType === 'ELECTRIC' || v.fuelType === 'PLUGIN_HYBRID',
      hvBatteryCapacityKwh: v.hvBatteryCapacityKwh ?? null,
      tankCapacityLiters: v.tankCapacityLiters ?? null,
      fuelLevel: fuelPercent || null,
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
      displayState: interpreted.displayState,
      displayIgnition: interpreted.displayIgnition,
      isLiveTracking: interpreted.isLiveTracking,
      imageUrl: v.imageUrl ?? null,
    };
  }

  /**
   * Resolve the best fuel percentage from VehicleLatestState.
   *
   * DIMO provides two fuel signals that update independently:
   *   - powertrainFuelSystemRelativeLevel  (percentage, not all vehicles report it)
   *   - powertrainFuelSystemAbsoluteLevel  (liters, often more current or the only signal)
   *
   * Strategy:
   *  1. If relative % exists and is at least as fresh as absolute → use it.
   *  2. If absolute is newer, try to infer tank capacity from the last known pair.
   *  3. If relative is never reported (null), calculate % from absolute using
   *     the vehicle's stored tankCapacityLiters or a 50 L default.
   */
  private resolveFuelPercent(
    state: any,
    tankCapacityLiters?: number | null,
  ): number {
    if (!state) return 0;

    const relPct = state.fuelLevelRelative as number | null;
    const absLiters = state.fuelLevelAbsolute as number | null;

    if (relPct == null && absLiters == null) return 0;
    if (absLiters == null) return relPct ?? 0;

    const raw = state.rawPayloadJson as Record<string, any> | null;

    if (relPct != null && relPct > 0 && raw) {
      const relTs = this.signalTimestamp(raw.powertrainFuelSystemRelativeLevel);
      const absTs = this.signalTimestamp(raw.powertrainFuelSystemAbsoluteLevel);

      if (!absTs || !relTs || absTs <= relTs) return relPct;

      const relVal = this.signalValue(raw.powertrainFuelSystemRelativeLevel);
      const absVal = this.signalValue(raw.powertrainFuelSystemAbsoluteLevel);
      if (relVal != null && absVal != null && relVal > 0 && absVal > 0) {
        const timeDiffMs = absTs.getTime() - relTs.getTime();
        if (timeDiffMs < 6 * 60 * 60 * 1000) {
          const inferredCapacity = absVal / (relVal / 100);
          if (inferredCapacity > 10 && inferredCapacity < 200) {
            return Math.round(
              Math.min(100, (absLiters / inferredCapacity) * 100) * 10,
            ) / 10;
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

  private signalTimestamp(signal: unknown): Date | null {
    if (!signal || typeof signal !== 'object') return null;
    const t = (signal as Record<string, unknown>).timestamp;
    if (typeof t === 'string') return new Date(t);
    return null;
  }

  private signalValue(signal: unknown): number | null {
    if (!signal || typeof signal !== 'object') return null;
    const v = (signal as Record<string, unknown>).value;
    return typeof v === 'number' && !Number.isNaN(v) ? v : null;
  }

  // ── CRUD ──────────────────────────────────────────────────────────

  async create(
    organizationId: string,
    data: Omit<Prisma.VehicleCreateInput, 'organization'>,
  ): Promise<Vehicle> {
    return this.prisma.vehicle.create({
      data: { ...data, organization: { connect: { id: organizationId } } },
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

    const tripStateMap = await this.buildTripStateMap(
      data.map((v) => v.id),
    );

    return buildPaginatedResult(
      data.map((v) => this.mapToVehicleData(v, tripStateMap)),
      total,
      params || {},
    );
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
    const tripStateMap = await this.buildTripStateMap([vehicle.id]);
    return this.mapToVehicleData(vehicle, tripStateMap);
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

  async getVehicleWithTelemetry(vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: {
        station: true,
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
      station: vehicle.station?.name ?? '',
      online: interpreted.isFresh,
      lastSignal: interpreted.lastSignal,
      speed: state?.speedKmh ?? 0,
      odometer: state?.odometerKm ?? vehicle.mileageKm ?? 0,
      fuel: this.resolveFuelPercent(state, vehicle.tankCapacityLiters),
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

  async getLiveGps(vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
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
    },
  ) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, ...this.withOrgScope(organizationId) },
      include: { tireSetups: { where: { removedAt: null }, orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    const hasTireFields =
      tires.frontDimension || tires.rearDimension ||
      tires.brandModelFront || tires.brandModelRear ||
      tires.treadFL != null || tires.treadFR != null ||
      tires.treadBL != null || tires.treadBR != null;

    if (!hasTireFields) return { setup: null, measurement: null };

    const frontAvg =
      tires.treadFL != null && tires.treadFR != null
        ? (tires.treadFL + tires.treadFR) / 2
        : (tires.treadFL ?? tires.treadFR ?? null);
    const rearAvg =
      tires.treadBL != null && tires.treadBR != null
        ? (tires.treadBL + tires.treadBR) / 2
        : (tires.treadBL ?? tires.treadBR ?? null);
    const overallAvg =
      frontAvg != null && rearAvg != null
        ? (frontAvg + rearAvg) / 2
        : (frontAvg ?? rearAvg ?? null);

    const existingSetup = vehicle.tireSetups[0] ?? null;

    const setup = existingSetup
      ? await this.prisma.vehicleTireSetup.update({
          where: { id: existingSetup.id },
          data: {
            frontDimension: tires.frontDimension?.trim() || existingSetup.frontDimension,
            rearDimension: tires.rearDimension?.trim() || existingSetup.rearDimension,
            brandModelFront: tires.brandModelFront?.trim() || existingSetup.brandModelFront,
            brandModelRear: tires.brandModelRear?.trim() || existingSetup.brandModelRear,
            tireSeason: this.parseTireSeason(tires.tireSeason) ?? existingSetup.tireSeason,
            ...(tires.loadIndexFront != null ? { loadIndexFront: tires.loadIndexFront.trim() || null } : {}),
            ...(tires.speedIndexFront != null ? { speedIndexFront: tires.speedIndexFront.trim() || null } : {}),
            ...(tires.loadIndexRear != null ? { loadIndexRear: tires.loadIndexRear.trim() || null } : {}),
            ...(tires.speedIndexRear != null ? { speedIndexRear: tires.speedIndexRear.trim() || null } : {}),
            ...(tires.dotCodeFront != null ? { dotCodeFront: tires.dotCodeFront.trim() || null } : {}),
            ...(tires.dotCodeRear != null ? { dotCodeRear: tires.dotCodeRear.trim() || null } : {}),
            initialTreadFrontMm: existingSetup.initialTreadFrontMm ?? frontAvg,
            initialTreadRearMm: existingSetup.initialTreadRearMm ?? rearAvg,
            initialTreadDepthMm: existingSetup.initialTreadDepthMm ?? overallAvg,
          },
        })
      : await this.prisma.vehicleTireSetup.create({
          data: {
            vehicleId,
            organizationId,
            frontDimension: tires.frontDimension?.trim() || null,
            rearDimension: tires.rearDimension?.trim() || null,
            brandModelFront: tires.brandModelFront?.trim() || null,
            brandModelRear: tires.brandModelRear?.trim() || null,
            tireSeason: this.parseTireSeason(tires.tireSeason),
            loadIndexFront: tires.loadIndexFront?.trim() || null,
            speedIndexFront: tires.speedIndexFront?.trim() || null,
            loadIndexRear: tires.loadIndexRear?.trim() || null,
            speedIndexRear: tires.speedIndexRear?.trim() || null,
            dotCodeFront: tires.dotCodeFront?.trim() || null,
            dotCodeRear: tires.dotCodeRear?.trim() || null,
            initialTreadFrontMm: frontAvg,
            initialTreadRearMm: rearAvg,
            initialTreadDepthMm: overallAvg,
            installedAt: new Date(),
          },
        });

    let measurement = null;
    const hasMeasurements =
      tires.treadFL != null || tires.treadFR != null ||
      tires.treadBL != null || tires.treadBR != null;

    if (hasMeasurements) {
      const latestOdo = await this.prisma.vehicleLatestState.findUnique({
        where: { vehicleId },
        select: { odometerKm: true },
      });
      measurement = await this.prisma.vehicleTireTreadMeasurement.create({
        data: {
          vehicleId,
          tireSetupId: setup.id,
          frontLeftMm: tires.treadFL ?? null,
          frontRightMm: tires.treadFR ?? null,
          rearLeftMm: tires.treadBL ?? null,
          rearRightMm: tires.treadBR ?? null,
          odometerAtMeasurement: latestOdo?.odometerKm ?? null,
          measuredAt: new Date(),
          source: existingSetup ? 'manual_edit' : 'manual_registration',
        },
      });
    }

    return { setup, measurement };
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

  private parseTireSeason(label: string | null | undefined): TireSeason {
    if (!label) return TireSeason.ALL_SEASON;
    const s = label.toUpperCase().replace(/[^A-Z]/g, '_');
    if (s === 'SUMMER') return TireSeason.SUMMER;
    if (s === 'WINTER') return TireSeason.WINTER;
    if (s === 'ALL_SEASON' || s === 'ALL SEASON') return TireSeason.ALL_SEASON;
    if (s === 'TRACK') return TireSeason.TRACK;
    return TireSeason.ALL_SEASON;
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
      brakes?: {
        frontRotorDiameter?: number | null;
        frontRotorWidth?: number | null;
        frontPadThickness?: number | null;
        rearRotorDiameter?: number | null;
        rearRotorWidth?: number | null;
        rearPadThickness?: number | null;
      };
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
      ...(stationId && { station: { connect: { id: stationId } } }),
      ...restExtra,
    };

    const vehicle = await this.prisma.vehicle.create({ data: createData });

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
      const br = manualSpecs.brakes;
      const hasAny = [
        br.frontRotorDiameter,
        br.frontRotorWidth,
        br.frontPadThickness,
        br.rearRotorDiameter,
        br.rearRotorWidth,
        br.rearPadThickness,
      ].some((v) => v != null && !Number.isNaN(Number(v)));
      if (hasAny) {
        await this.prisma.vehicleBrakeReferenceSpec.create({
          data: {
            vehicleId: vehicle.id,
            frontRotorDiameter: br.frontRotorDiameter ?? null,
            frontRotorWidth: br.frontRotorWidth ?? null,
            frontPadThickness: br.frontPadThickness ?? null,
            rearRotorDiameter: br.rearRotorDiameter ?? null,
            rearRotorWidth: br.rearRotorWidth ?? null,
            rearPadThickness: br.rearPadThickness ?? null,
            sourceType: 'MANUAL',
          },
        });
      }
    }

    if (manualSpecs?.tires) {
      const tr = manualSpecs.tires;
      const hasTireSetup =
        tr.frontDimension ||
        tr.rearDimension ||
        tr.brandModelFront ||
        tr.brandModelRear ||
        tr.initialTreadFrontMm != null ||
        tr.initialTreadRearMm != null ||
        tr.treadFL != null ||
        tr.treadFR != null ||
        tr.treadBL != null ||
        tr.treadBR != null;

      if (hasTireSetup) {
        // Derive initial tread from per-corner measurements if not supplied directly
        const frontAvg =
          tr.initialTreadFrontMm ??
          (tr.treadFL != null && tr.treadFR != null
            ? (tr.treadFL + tr.treadFR) / 2
            : (tr.treadFL ?? tr.treadFR ?? null));
        const rearAvg =
          tr.initialTreadRearMm ??
          (tr.treadBL != null && tr.treadBR != null
            ? (tr.treadBL + tr.treadBR) / 2
            : (tr.treadBL ?? tr.treadBR ?? null));
        const overallAvg =
          frontAvg != null && rearAvg != null
            ? (frontAvg + rearAvg) / 2
            : (frontAvg ?? rearAvg ?? null);

        const tireSetup = await this.prisma.vehicleTireSetup.create({
          data: {
            vehicleId: vehicle.id,
            organizationId: orgId,
            frontDimension: tr.frontDimension?.trim() || null,
            rearDimension: tr.rearDimension?.trim() || null,
            brandModelFront: tr.brandModelFront?.trim() || null,
            brandModelRear: tr.brandModelRear?.trim() || null,
            tireSeason: this.parseTireSeason(tr.tireSeason),
            loadIndexFront: tr.loadIndexFront?.trim() || null,
            speedIndexFront: tr.speedIndexFront?.trim() || null,
            loadIndexRear: tr.loadIndexRear?.trim() || null,
            speedIndexRear: tr.speedIndexRear?.trim() || null,
            dotCodeFront: tr.dotCodeFront?.trim() || null,
            dotCodeRear: tr.dotCodeRear?.trim() || null,
            tireCondition: tr.tireCondition === 'NEW_INSTALLED' ? 'NEW_INSTALLED'
              : tr.tireCondition === 'ALREADY_MOUNTED' ? 'ALREADY_MOUNTED'
              : 'UNKNOWN',
            initialTreadFrontMm: frontAvg,
            initialTreadRearMm: rearAvg,
            initialTreadDepthMm: overallAvg,
            installedAt: new Date(),
            ...(tr.aiTireSpec ? { aiTireSpec: tr.aiTireSpec as any } : {}),
          },
        });

        // Create the tread measurement record if any corner value present
        const hasMeasurements =
          tr.treadFL != null ||
          tr.treadFR != null ||
          tr.treadBL != null ||
          tr.treadBR != null;

        if (hasMeasurements) {
          const regOdo = await this.prisma.vehicleLatestState.findUnique({
            where: { vehicleId: vehicle.id },
            select: { odometerKm: true },
          });
          await this.prisma.vehicleTireTreadMeasurement.create({
            data: {
              vehicleId: vehicle.id,
              tireSetupId: tireSetup.id,
              frontLeftMm: tr.treadFL ?? null,
              frontRightMm: tr.treadFR ?? null,
              rearLeftMm: tr.treadBL ?? null,
              rearRightMm: tr.treadBR ?? null,
              odometerAtMeasurement: regOdo?.odometerKm ?? null,
              measuredAt: new Date(),
              source: 'manual_registration',
            },
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

    const tokenId = dimoVehicle.tokenId;
    if (tokenId != null) {
      try {
        const base = (this.dimoConf as any).webhookBaseUrl || 'http://localhost:3001';
        const callbackUrl = base.replace(/\/$/, '') + '/api/v1/webhooks/dimo';
        const webhookId = await this.dimoTriggers.ensureWebhookRegistered(callbackUrl);
        if (webhookId) {
          await this.dimoTriggers.registerAllTriggersForVehicle(webhookId, tokenId);
        }
      } catch (err: any) {
        this.logger.warn(`DIMO trigger subscription failed for new vehicle: ${err.message}`);
      }
    }

    return vehicle;
  }

  async getFleetConnectivity(organizationId: string) {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: {
        dimoVehicle: true,
        latestState: true,
        station: { select: { name: true } },
      },
    });

    const now = Date.now();
    const items = vehicles.map((v) => {
      const dv = v.dimoVehicle;
      const ls = v.latestState;
      const raw = (dv?.rawJson ?? {}) as Record<string, any>;
      const aftermarket = raw?.aftermarketDevice as { serial?: string; pairedAt?: string } | undefined;
      const synthetic = raw?.syntheticDevice as { tokenId?: number } | undefined;

      const hasAftermarket = aftermarket?.serial != null;
      const hasSynthetic = synthetic?.tokenId != null;
      const connectionType = hasAftermarket ? 'Aftermarket Device' : hasSynthetic ? 'Synthetic Device' : dv ? 'DIMO' : 'Not Connected';
      const sourceType = hasAftermarket ? 'OBD-II' : hasSynthetic ? 'API / Software' : dv ? 'DIMO Platform' : null;

      const lastSeenAt = ls?.lastSeenAt ?? dv?.lastSignal ?? null;
      const lastSyncedAt = dv?.syncedAt ?? null;

      const rawSignals = (ls?.rawPayloadJson ?? null) as Record<string, unknown> | null;
      const conn = extractConnectivitySnapshot(rawSignals ?? undefined);

      let freshnessLabel = 'Unknown';
      let diffMs = -1;
      if (lastSeenAt) {
        diffMs = now - new Date(lastSeenAt).getTime();
        const mins = diffMs / 60000;
        if (mins < 5) freshnessLabel = 'Live';
        else if (mins < 60) freshnessLabel = `${Math.round(mins)} min ago`;
        else if (mins < 1440) freshnessLabel = `${Math.round(mins / 60)}h ago`;
        else freshnessLabel = `${Math.round(mins / 1440)}d ago`;
      }

      let connectionStatus: 'online' | 'standby' | 'offline' | 'not_connected';
      let statusNote: string;

      if (!dv) {
        connectionStatus = 'not_connected';
        statusNote = 'Vehicle is not linked to a DIMO data source';
      } else if (diffMs >= 0 && diffMs < 900000) {
        connectionStatus = 'online';
        statusNote = 'Signals are being received normally';
      } else if (diffMs >= 0 && diffMs < 86400000) {
        connectionStatus = 'standby';
        statusNote = 'No very recent activity — vehicle may be parked or inactive';
      } else if (diffMs >= 86400000) {
        const days = Math.round(diffMs / 86400000);
        connectionStatus = 'offline';
        statusNote = days > 7
          ? 'No signals for an extended period — connection may be lost or device may no longer be sending data'
          : 'No recent signals — connection may be interrupted';
      } else {
        connectionStatus = 'offline';
        statusNote = 'No signal data available';
      }

      return {
        vehicleId: v.id,
        vin: v.vin,
        licensePlate: v.licensePlate ?? null,
        make: v.make,
        model: v.model,
        year: v.year,
        station: v.station?.name ?? null,
        connectionType,
        sourceType,
        provider: 'DIMO',
        deviceSerial: aftermarket?.serial ?? null,
        syntheticTokenId: synthetic?.tokenId ?? null,
        dimoTokenId: dv?.tokenId ?? null,
        connectionStatus,
        statusNote,
        online: connectionStatus === 'online',
        lastSeenAt: lastSeenAt?.toISOString?.() ?? (typeof lastSeenAt === 'string' ? lastSeenAt : null),
        lastSyncedAt: lastSyncedAt?.toISOString() ?? null,
        freshnessLabel,
        pairedAt: aftermarket?.pairedAt ?? dv?.createdAt?.toISOString() ?? null,
        latitude: ls?.latitude ?? null,
        longitude: ls?.longitude ?? null,
        odometerKm: ls?.odometerKm != null ? Math.floor(ls.odometerKm) : null,
        hasTelemetry: ls != null,
        obdIsPluggedIn: conn.obdIsPluggedIn,
        jammingDetectedCount: conn.jammingDetectedCount,
        jammingIncidents: conn.jammingIncidents,
      };
    });

    const online = items.filter((i) => i.connectionStatus === 'online').length;
    const standby = items.filter((i) => i.connectionStatus === 'standby').length;
    const offline = items.filter((i) => i.connectionStatus === 'offline').length;
    const notConnected = items.filter((i) => i.connectionStatus === 'not_connected').length;

    return {
      summary: {
        total: items.length,
        online,
        standby,
        offline,
        notConnected,
      },
      vehicles: items,
    };
  }

  async listVehicleComplaints(organizationId: string, vehicleId: string) {
    const v = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { id: true },
    });
    if (!v) throw new NotFoundException('Vehicle not found');
    return this.prisma.vehicleComplaint.findMany({
      where: { vehicleId },
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
        ? 'URGENT'
        : urgency === 'HIGH'
          ? 'HIGH'
          : urgency === 'LOW'
            ? 'LOW'
            : 'MEDIUM';

    try {
      await this.prisma.orgTask.create({
        data: {
          organizationId,
          vehicleId,
          title: `Complaint: ${body.description.slice(0, 72)}${body.description.length > 72 ? '…' : ''}`,
          description: body.description,
          category: 'VEHICLE_COMPLAINT',
          status: 'OPEN',
          priority: taskPriority as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT',
        },
      });
    } catch (err: any) {
      this.logger.warn(`Could not create OrgTask for complaint: ${err?.message ?? err}`);
    }

    return complaint;
  }
}
