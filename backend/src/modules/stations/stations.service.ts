import { Injectable, BadRequestException, NotFoundException, Logger, ConflictException } from '@nestjs/common';
import { BookingStatus, Prisma, Station, StationStatus, StationType, VehicleStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { StationValidationService } from './station-validation.service';
import {
  STATION_STATUS_LABELS,
  STATION_TYPE_LABELS,
  StationOverviewStatsDto,
  openingHoursIsMissing,
  SELECTABLE_STATION_STATUSES,
} from './station.types';
import { CreateStationDto } from './dto/create-station.dto';
import { UpdateStationDto } from './dto/update-station.dto';
import { ListStationsQueryDto } from './dto/list-stations-query.dto';
import { mapboxAccessToken, resolveGeocodeCountryFilter } from './station-geocode.util';
import type { StationScopeContext } from '@shared/stations/station-scope.types';
import type { StationAccessScope } from '@shared/stations/station-access-scope.types';
import { StationAccessScopeService } from '@shared/stations/station-access-scope.service';
import {
  buildScopedStationWhere,
  buildScopedVehicleHomeWhere,
} from '@shared/stations/stations-read-scope.util';

const STATION_STATUS_VALUES: StationStatus[] = ['ACTIVE', 'INACTIVE', 'ARCHIVED'];

// ---------- Input payload contracts (accepted by controller) ----------

export interface StationUpsertPayload extends CreateStationDto {}
export interface StationPatchPayload extends UpdateStationDto {}

// ---------- Output DTO returned to the frontend ----------

export interface StationDto {
  id: string;
  name: string;
  code: string | null;
  status: StationStatus;
  statusLabel: string;
  type: StationType;
  typeLabel: string;
  isPrimary: boolean;
  address: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  radiusMeters: number | null;
  geofenceRadiusMeters: number | null;
  phone: string | null;
  email: string | null;
  managerName: string | null;
  contactPerson: string | null;
  pickupEnabled: boolean;
  returnEnabled: boolean;
  afterHoursReturnEnabled: boolean;
  keyBoxAvailable: boolean;
  capacity: number | null;
  openingHours: Prisma.JsonValue | null;
  holidayRules: Prisma.JsonValue | null;
  handoverInstructions: string | null;
  returnInstructions: string | null;
  notes: string | null;
  internalNotes: string | null;
  googlePlaceId: string | null;
  archivedAt: Date | null;
  vehicleCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface StationsStatsDto {
  totalStations: number;
  activeStations: number;
  inactiveStations: number;
  totalVehicles: number;
  unassignedVehicles: number;
  stations: Array<{
    id: string;
    name: string;
    city: string | null;
    status: StationStatus;
    statusLabel: string;
    vehicleCount: number;
  }>;
}

export interface StationPlaceSuggestion {
  placeId: string;
  mainText: string;
  secondaryText: string;
  description: string;
}

export interface StationPlaceDetails {
  name: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  googleMapsUrl: string | null;
}

// Result of the one-shot coordinate backfill (admin-side recovery flow for
// stations that were created before the auto-geocoder was wired in, or where
// the address lookup happened to return no result the first time).
export interface StationGeocodingBackfillResult {
  totalChecked: number;
  totalGeocoded: number;
  totalFailed: number;
  totalSkipped: number;
  results: Array<{
    stationId: string;
    stationName: string;
    status: 'geocoded' | 'failed' | 'skipped';
    latitude: number | null;
    longitude: number | null;
    reason?: string;
  }>;
}

// Result returned after a bulk vehicle-assignment write. The operation has
// SET semantics: after it returns the station's vehicle list is exactly
// the set of `vehicleIds` that was supplied.
export interface StationVehicleAssignmentResult {
  stationId: string;
  totalAssigned: number;
  newlyAttached: number;
  detached: number;
  movedFromOtherStations: number;
}

export interface StationOperationsDto {
  pickupEnabled: boolean;
  returnEnabled: boolean;
  afterHoursReturnEnabled: boolean;
  keyBoxAvailable: boolean;
  capacity: number | null;
  radiusMeters: number | null;
  geofenceRadiusMeters: number | null;
  openingHours: Prisma.JsonValue | null;
  holidayRules: Prisma.JsonValue | null;
  handoverInstructions: string | null;
  returnInstructions: string | null;
  timezone: string | null;
}

export interface StationTeamDto {
  managerName: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  staff: Array<{ id: string; name: string; role: string | null }>;
}

export interface StationActivityEntryDto {
  id: string;
  action: string;
  description: string;
  userName: string;
  createdAt: string;
}

@Injectable()
export class StationsService {
  private readonly logger = new Logger(StationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stationValidation: StationValidationService,
    private readonly stationAccessScope: StationAccessScopeService,
  ) {}

  private stationIncludeCount() {
    return { _count: { select: { vehiclesHome: true } } };
  }

  // ─────────────────────────────────────────────────────────────
  // CRUD
  // ─────────────────────────────────────────────────────────────

  async findAll(
    organizationId: string,
    query?: ListStationsQueryDto,
    scope?: StationScopeContext,
  ): Promise<StationDto[]> {
    const access = this.stationAccessScope.resolveFromContextOrEmpty(organizationId, scope);
    const extra: Prisma.StationWhereInput = {};
    if (query?.status) extra.status = query.status;
    if (query?.type) extra.type = query.type;
    if (query?.selectableOnly === 'true') {
      extra.status = { in: SELECTABLE_STATION_STATUSES };
      extra.pickupEnabled = true;
    }

    const where = this.stationAccessScope.buildStationWhere(access, extra);

    const stations = await this.prisma.station.findMany({
      where,
      include: this.stationIncludeCount(),
      orderBy: [{ isPrimary: 'desc' }, { status: 'asc' }, { name: 'asc' }],
    });
    return stations.map((s) => this.toDto(s, s._count.vehiclesHome));
  }

  async findOne(
    organizationId: string,
    id: string,
    scope?: StationScopeContext,
  ): Promise<StationDto> {
    const where = buildScopedStationWhere(organizationId, scope, { id });
    const station = await this.prisma.station.findFirst({
      where,
      include: this.stationIncludeCount(),
    });
    if (!station) throw new NotFoundException(`Station ${id} not found`);
    return this.toDto(station, station._count.vehiclesHome);
  }

  async create(organizationId: string, payload: StationUpsertPayload): Promise<StationDto> {
    const name = payload.name?.trim();
    if (!name) throw new BadRequestException('Station name is required');

    if (payload.code) {
      const dup = await this.prisma.station.findFirst({
        where: { organizationId, code: payload.code.trim() },
      });
      if (dup) throw new ConflictException(`Station code "${payload.code}" already exists`);
    }

    const writable = this.buildWriteData(payload);

    const explicitLat = payload.latitude !== undefined && payload.latitude !== null;
    const explicitLng = payload.longitude !== undefined && payload.longitude !== null;
    if (!(explicitLat && explicitLng)) {
      const coords = await this.geocodeAddress({
        address: payload.address ?? null,
        city: payload.city ?? null,
        postalCode: payload.postalCode ?? null,
        country: payload.country ?? null,
      });
      if (coords) {
        if (!explicitLat) writable.latitude = coords.latitude;
        if (!explicitLng) writable.longitude = coords.longitude;
      }
    }

    const station = await this.prisma.$transaction(async (tx) => {
      if (payload.isPrimary) {
        await tx.station.updateMany({
          where: { organizationId, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      return tx.station.create({
        data: {
          ...writable,
          name,
          organization: { connect: { id: organizationId } },
        } as Prisma.StationCreateInput,
        include: this.stationIncludeCount(),
      });
    });
    return this.toDto(station, station._count.vehiclesHome);
  }

  async update(
    organizationId: string,
    id: string,
    payload: StationPatchPayload,
  ): Promise<StationDto> {
    const existing = await this.prisma.station.findFirstOrThrow({
      where: { id, organizationId },
    });

    const writable = this.buildWriteData(payload);
    if (payload.name !== undefined) {
      const trimmed = payload.name?.trim();
      if (!trimmed) throw new BadRequestException('Station name cannot be empty');
      writable.name = trimmed;
    }

    // V4.7.07 — Re-geocode on update when:
    //   1) the caller did not explicitly set latitude/longitude in the
    //      payload (undefined → leave alone, an explicit `null` is treated
    //      as "user wants to clear coords" and is respected), AND
    //   2) at least one address component is being changed by this PATCH.
    // We resolve against the merged address (payload values shadow the
    // existing record) so partial updates still work — e.g. only changing
    // the postal code re-geocodes against the (existing street + new PLZ).
    const wantsLatChange = payload.latitude !== undefined;
    const wantsLngChange = payload.longitude !== undefined;
    const addressFieldsTouched =
      payload.address !== undefined ||
      payload.city !== undefined ||
      payload.postalCode !== undefined ||
      payload.country !== undefined;
    if (!wantsLatChange && !wantsLngChange && addressFieldsTouched) {
      const coords = await this.geocodeAddress({
        address: payload.address !== undefined ? payload.address : existing.address,
        city: payload.city !== undefined ? payload.city : existing.city,
        postalCode:
          payload.postalCode !== undefined ? payload.postalCode : existing.postalCode,
        country: payload.country !== undefined ? payload.country : existing.country,
      });
      if (coords) {
        writable.latitude = coords.latitude;
        writable.longitude = coords.longitude;
      }
    }

    const station = await this.prisma.$transaction(async (tx) => {
      if (payload.isPrimary === true) {
        await tx.station.updateMany({
          where: { organizationId, isPrimary: true, id: { not: id } },
          data: { isPrimary: false },
        });
      }
      return tx.station.update({
        where: { id },
        data: writable,
        include: this.stationIncludeCount(),
      });
    });
    return this.toDto(station, station._count.vehiclesHome);
  }

  async archive(organizationId: string, id: string): Promise<StationDto> {
    const station = await this.prisma.station.findFirst({ where: { id, organizationId } });
    if (!station) throw new NotFoundException(`Station ${id} not found`);
    if (station.status === 'ARCHIVED') return this.findOne(organizationId, id);

    const updated = await this.prisma.station.update({
      where: { id },
      data: {
        status: 'ARCHIVED',
        archivedAt: new Date(),
        isPrimary: false,
        pickupEnabled: false,
        returnEnabled: false,
      },
      include: this.stationIncludeCount(),
    });
    return this.toDto(updated, updated._count.vehiclesHome);
  }

  async restore(organizationId: string, id: string): Promise<StationDto> {
    const station = await this.prisma.station.findFirst({ where: { id, organizationId } });
    if (!station) throw new NotFoundException(`Station ${id} not found`);

    const updated = await this.prisma.station.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        archivedAt: null,
        pickupEnabled: true,
        returnEnabled: true,
      },
      include: this.stationIncludeCount(),
    });
    return this.toDto(updated, updated._count.vehiclesHome);
  }

  async setPrimaryStation(organizationId: string, id: string): Promise<StationDto> {
    const station = await this.prisma.station.findFirst({ where: { id, organizationId } });
    if (!station) throw new NotFoundException(`Station ${id} not found`);
    if (station.status === 'ARCHIVED') {
      throw new BadRequestException('Archived stations cannot be set as primary');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.station.updateMany({
        where: { organizationId, isPrimary: true },
        data: { isPrimary: false },
      });
      return tx.station.update({
        where: { id },
        data: { isPrimary: true, status: 'ACTIVE' },
        include: this.stationIncludeCount(),
      });
    });
    return this.toDto(updated, updated._count.vehiclesHome);
  }

  /** @deprecated Prefer archive() — kept for backward compatibility */
  async delete(organizationId: string, id: string): Promise<{ id: string; unassignedVehicles: number; archived: boolean }> {
    const station = await this.prisma.station.findFirst({
      where: { id, organizationId },
      include: { _count: { select: { vehiclesHome: true, pickupBookings: true, returnBookings: true } } },
    });
    if (!station) throw new NotFoundException(`Station ${id} not found`);

    const hasLinks =
      station._count.vehiclesHome > 0 ||
      station._count.pickupBookings > 0 ||
      station._count.returnBookings > 0;

    if (hasLinks) {
      await this.archive(organizationId, id);
      return { id, unassignedVehicles: 0, archived: true };
    }

    await this.prisma.station.delete({ where: { id } });
    return { id, unassignedVehicles: 0, archived: false };
  }

  // ─────────────────────────────────────────────────────────────
  // Stats for dashboard header / sidebar
  // ─────────────────────────────────────────────────────────────

  async getStationStats(
    organizationId: string,
    scope?: StationScopeContext,
  ): Promise<StationsStatsDto> {
    const access = this.stationAccessScope.resolveFromContextOrEmpty(organizationId, scope);

    const [stations, unassignedVehicles] = await Promise.all([
      this.prisma.station.findMany({
        where: this.stationAccessScope.buildStationWhere(access, {
          status: { not: 'ARCHIVED' },
        }),
        include: { _count: { select: { vehiclesHome: true } } },
        orderBy: [{ isPrimary: 'desc' }, { status: 'asc' }, { name: 'asc' }],
      }),
      this.countUnassignedVehicles(access),
    ]);

    const totalVehicles = stations.reduce((sum, s) => sum + s._count.vehiclesHome, 0);
    const activeStations = stations.filter((s) => s.status === 'ACTIVE').length;

    return {
      totalStations: stations.length,
      activeStations,
      inactiveStations: stations.filter((s) => s.status === 'INACTIVE').length,
      totalVehicles,
      unassignedVehicles,
      stations: stations.map((s) => ({
        id: s.id,
        name: s.name,
        city: s.city ?? null,
        status: s.status,
        statusLabel: STATION_STATUS_LABELS[s.status],
        vehicleCount: s._count.vehiclesHome,
      })),
    };
  }

  async getStationOverviewStats(
    organizationId: string,
    stationId: string,
    scope?: StationScopeContext,
  ): Promise<StationOverviewStatsDto> {
    const station = await this.prisma.station.findFirst({
      where: buildScopedStationWhere(organizationId, scope, { id: stationId }),
    });
    if (!station) throw new NotFoundException(`Station ${stationId} not found`);

    const stationVehicleWhere: Prisma.VehicleWhereInput = {
      organizationId,
      OR: [{ homeStationId: stationId }, { currentStationId: stationId }],
    };

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);

    const activeBookingStatuses: BookingStatus[] = ['CONFIRMED', 'ACTIVE', 'PENDING'];

    const stationVehicleIds = (
      await this.prisma.vehicle.findMany({
        where: stationVehicleWhere,
        select: { id: true },
      })
    ).map((v) => v.id);

    const stationBookingIds = (
      await this.prisma.booking.findMany({
        where: {
          organizationId,
          OR: [{ pickupStationId: stationId }, { returnStationId: stationId }],
        },
        select: { id: true },
        take: 500,
      })
    ).map((b) => b.id);

    const [
      totalVehicles,
      availableVehicles,
      bookedVehicles,
      inServiceVehicles,
      todayPickups,
      todayReturns,
      upcomingPickups,
      upcomingReturns,
    ] = await Promise.all([
      this.prisma.vehicle.count({ where: stationVehicleWhere }),
      this.prisma.vehicle.count({
        where: { ...stationVehicleWhere, status: VehicleStatus.AVAILABLE },
      }),
      this.prisma.vehicle.count({
        where: { ...stationVehicleWhere, status: VehicleStatus.RENTED },
      }),
      this.prisma.vehicle.count({
        where: {
          ...stationVehicleWhere,
          status: { in: [VehicleStatus.IN_SERVICE, VehicleStatus.OUT_OF_SERVICE] },
        },
      }),
      this.prisma.booking.count({
        where: {
          organizationId,
          pickupStationId: stationId,
          startDate: { gte: startOfToday, lt: endOfToday },
          status: { in: activeBookingStatuses },
        },
      }),
      this.prisma.booking.count({
        where: {
          organizationId,
          returnStationId: stationId,
          endDate: { gte: startOfToday, lt: endOfToday },
          status: { in: activeBookingStatuses },
        },
      }),
      this.prisma.booking.count({
        where: {
          organizationId,
          pickupStationId: stationId,
          startDate: { gte: endOfToday },
          status: { in: activeBookingStatuses },
        },
      }),
      this.prisma.booking.count({
        where: {
          organizationId,
          returnStationId: stationId,
          endDate: { gte: endOfToday },
          status: { in: activeBookingStatuses },
        },
      }),
    ]);

    let openTasks = 0;
    if (stationVehicleIds.length || stationBookingIds.length) {
      openTasks = await this.prisma.orgTask.count({
        where: {
          organizationId,
          status: { in: ['OPEN', 'IN_PROGRESS'] },
          OR: [
            ...(stationVehicleIds.length
              ? [{ vehicleId: { in: stationVehicleIds } }]
              : []),
            ...(stationBookingIds.length
              ? [{ bookingId: { in: stationBookingIds } }]
              : []),
          ],
        },
      });
    }

    const capacity = station.capacity ?? null;
    const capacityUsagePercent =
      capacity != null && capacity > 0
        ? Math.min(100, Math.round((totalVehicles / capacity) * 100))
        : null;

    return {
      totalVehicles,
      availableVehicles,
      bookedVehicles,
      inServiceVehicles,
      vehiclesWithHealthWarnings: null,
      todayPickups,
      todayReturns,
      upcomingPickups,
      upcomingReturns,
      openTasks,
      capacity,
      capacityUsagePercent,
      hasMissingCoordinates: station.latitude == null || station.longitude == null,
      hasMissingOpeningHours: openingHoursIsMissing(station.openingHours),
      hasMissingPickupReturnRules: !station.pickupEnabled && !station.returnEnabled,
    };
  }

  async getStationFleet(
    organizationId: string,
    stationId: string,
    scope?: StationScopeContext,
  ) {
    await this.findOne(organizationId, stationId, scope);
    return this.prisma.vehicle.findMany({
      where: {
        organizationId,
        OR: [{ homeStationId: stationId }, { currentStationId: stationId }],
      },
      select: {
        id: true,
        vehicleName: true,
        make: true,
        model: true,
        licensePlate: true,
        status: true,
        homeStationId: true,
        currentStationId: true,
        expectedStationId: true,
      },
      orderBy: [{ status: 'asc' }, { licensePlate: 'asc' }],
    });
  }

  async getStationBookings(
    organizationId: string,
    stationId: string,
    scope?: StationScopeContext,
  ) {
    await this.findOne(organizationId, stationId, scope);
    const bookings = await this.prisma.booking.findMany({
      where: {
        organizationId,
        OR: [{ pickupStationId: stationId }, { returnStationId: stationId }],
      },
      include: {
        customer: { select: { firstName: true, lastName: true } },
        vehicle: { select: { vehicleName: true, make: true, model: true, licensePlate: true } },
      },
      orderBy: { startDate: 'desc' },
      take: 100,
    });
    return bookings.map((b) => ({
      id: b.id,
      status: b.status,
      startDate: b.startDate.toISOString(),
      endDate: b.endDate.toISOString(),
      pickupStationId: b.pickupStationId,
      returnStationId: b.returnStationId,
      isOneWayRental: b.isOneWayRental,
      customerName: `${b.customer.firstName} ${b.customer.lastName}`.trim(),
      vehicleLabel:
        b.vehicle.vehicleName ||
        `${b.vehicle.make} ${b.vehicle.model}`.trim() ||
        b.vehicle.licensePlate ||
        '',
    }));
  }

  async getStationOperations(
    organizationId: string,
    stationId: string,
    scope?: StationScopeContext,
  ): Promise<StationOperationsDto> {
    const station = await this.prisma.station.findFirst({
      where: buildScopedStationWhere(organizationId, scope, { id: stationId }),
      select: {
        pickupEnabled: true,
        returnEnabled: true,
        afterHoursReturnEnabled: true,
        keyBoxAvailable: true,
        capacity: true,
        radiusMeters: true,
        openingHours: true,
        holidayRules: true,
        handoverInstructions: true,
        returnInstructions: true,
        timezone: true,
      },
    });
    if (!station) throw new NotFoundException(`Station ${stationId} not found`);

    return {
      pickupEnabled: station.pickupEnabled,
      returnEnabled: station.returnEnabled,
      afterHoursReturnEnabled: station.afterHoursReturnEnabled,
      keyBoxAvailable: station.keyBoxAvailable,
      capacity: station.capacity,
      radiusMeters: station.radiusMeters,
      geofenceRadiusMeters: station.radiusMeters,
      openingHours: station.openingHours,
      holidayRules: station.holidayRules,
      handoverInstructions: station.handoverInstructions,
      returnInstructions: station.returnInstructions,
      timezone: station.timezone,
    };
  }

  async getStationTeam(
    organizationId: string,
    stationId: string,
    scope?: StationScopeContext,
  ): Promise<StationTeamDto> {
    const station = await this.prisma.station.findFirst({
      where: buildScopedStationWhere(organizationId, scope, { id: stationId }),
      select: {
        managerName: true,
        phone: true,
        email: true,
      },
    });
    if (!station) throw new NotFoundException(`Station ${stationId} not found`);

    return {
      managerName: station.managerName,
      contactPerson: station.managerName,
      phone: station.phone,
      email: station.email,
      staff: [],
    };
  }

  async getStationActivity(
    organizationId: string,
    stationId: string,
    scope?: StationScopeContext,
    limit = 50,
  ): Promise<StationActivityEntryDto[]> {
    await this.findOne(organizationId, stationId, scope);

    const entries = await this.prisma.activityLog.findMany({
      where: {
        organizationId,
        entity: 'STATION',
        entityId: stationId,
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
      include: { user: { select: { name: true, email: true } } },
    });

    return entries.map((entry) => ({
      id: entry.id,
      action: entry.action,
      description: entry.description,
      userName: entry.user?.name || entry.user?.email || '',
      createdAt: entry.createdAt.toISOString(),
    }));
  }

  private async countUnassignedVehicles(access: StationAccessScope): Promise<number> {
    if (access.readableStationIds !== null) {
      return 0;
    }

    return this.prisma.vehicle.count({
      where: { organizationId: access.orgId, homeStationId: null },
    });
  }

  async assignVehicleToStation(
    organizationId: string,
    stationId: string,
    vehicleId: string,
    target: 'home' | 'current' | 'expected' = 'home',
  ) {
    await this.stationValidation.assertVehicleStationAssignment(
      organizationId,
      vehicleId,
      stationId,
      target,
    );

    const data: Prisma.VehicleUpdateInput = {};
    if (target === 'home') {
      data.homeStation = { connect: { id: stationId } };
      data.currentStation = { connect: { id: stationId } };
    } else if (target === 'current') {
      data.currentStation = { connect: { id: stationId } };
    } else {
      data.expectedStation = { connect: { id: stationId } };
    }

    return this.prisma.vehicle.update({
      where: { id: vehicleId },
      data,
      select: {
        id: true,
        homeStationId: true,
        currentStationId: true,
        expectedStationId: true,
      },
    });
  }

  async updateVehicleCurrentStation(
    organizationId: string,
    vehicleId: string,
    currentStationId: string | null,
    expectedStationId?: string | null,
  ) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    if (currentStationId) {
      await this.stationValidation.assertVehicleStationAssignment(
        organizationId,
        vehicleId,
        currentStationId,
        'current',
      );
    }
    if (expectedStationId) {
      await this.stationValidation.assertVehicleStationAssignment(
        organizationId,
        vehicleId,
        expectedStationId,
        'expected',
      );
    }

    return this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        currentStationId,
        ...(expectedStationId !== undefined ? { expectedStationId } : {}),
      },
      select: {
        id: true,
        homeStationId: true,
        currentStationId: true,
        expectedStationId: true,
      },
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Vehicle ↔ station assignment
  // ─────────────────────────────────────────────────────────────

  /**
   * SET semantics: after this call returns, the station's vehicle list is
   * exactly `vehicleIds`. Vehicles that were previously at this station and
   * are NOT in the list get detached (stationId → null). Vehicles in the
   * list that were elsewhere — including vehicles currently assigned to a
   * different station — are moved to this station.
   *
   * All vehicleIds must belong to the same organization as the station;
   * unknown / cross-tenant ids are rejected with 400 to keep the response
   * deterministic for the UI.
   */
  async setStationVehicles(
    organizationId: string,
    stationId: string,
    vehicleIds: string[],
  ): Promise<StationVehicleAssignmentResult> {
    const station = await this.prisma.station.findFirst({
      where: { id: stationId, organizationId },
      select: { id: true },
    });
    if (!station) throw new NotFoundException(`Station ${stationId} not found`);

    const requested = Array.from(new Set((vehicleIds ?? []).filter((id) => typeof id === 'string' && id.length > 0)));

    // Validate that every requested vehicle belongs to this org. Doing the
    // lookup once also tells us how many are already on this station (so
    // we can return accurate "newlyAttached" / "movedFromOtherStations"
    // counters) without an extra round-trip.
    const requestedVehicles = requested.length
      ? await this.prisma.vehicle.findMany({
          where: { id: { in: requested }, organizationId },
          select: { id: true, homeStationId: true },
        })
      : [];

    if (requestedVehicles.length !== requested.length) {
      throw new BadRequestException(
        'One or more vehicles do not belong to this organization',
      );
    }

    const previouslyHere = await this.prisma.vehicle.findMany({
      where: { organizationId, homeStationId: stationId },
      select: { id: true },
    });
    const previousIds = new Set(previouslyHere.map((v) => v.id));
    const requestedSet = new Set(requested);

    const idsToDetach = previouslyHere
      .filter((v) => !requestedSet.has(v.id))
      .map((v) => v.id);
    const idsToAttach = requestedVehicles
      .filter((v) => v.homeStationId !== stationId)
      .map((v) => v.id);
    const movedFromOtherStations = requestedVehicles.filter(
      (v) => v.homeStationId !== null && v.homeStationId !== stationId,
    ).length;
    const newlyAttached = requestedVehicles.filter(
      (v) => v.homeStationId === null,
    ).length;

    if (idsToDetach.length === 0 && idsToAttach.length === 0) {
      return {
        stationId,
        totalAssigned: previousIds.size,
        newlyAttached: 0,
        detached: 0,
        movedFromOtherStations: 0,
      };
    }

    await this.prisma.$transaction([
      ...(idsToDetach.length
        ? [
            this.prisma.vehicle.updateMany({
              where: { id: { in: idsToDetach }, organizationId },
              data: { homeStationId: null, currentStationId: null },
            }),
          ]
        : []),
      ...(idsToAttach.length
        ? [
            this.prisma.vehicle.updateMany({
              where: { id: { in: idsToAttach }, organizationId },
              data: { homeStationId: stationId, currentStationId: stationId },
            }),
          ]
        : []),
    ]);

    return {
      stationId,
      totalAssigned: requested.length,
      newlyAttached,
      detached: idsToDetach.length,
      movedFromOtherStations,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Mapbox forward-geocoding (address → lat/lng)
  // ─────────────────────────────────────────────────────────────
  // Used both by create/update (auto-fill) and by the one-shot backfill
  // endpoint. Public Mapbox token is sufficient for forward geocoding;
  // we reuse `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` (same env that powers the
  // existing `MapboxService` and frontend reverse-geocoding).
  //
  // Cost profile: Mapbox grants 100k forward-geocoding requests / month
  // on the free tier. Since stations are long-lived and addresses change
  // rarely, this is effectively a one-time cost per station. For a much
  // deeper write-up see the planning doc / chat thread.

  /**
   * Resolve a station address to `{latitude, longitude}` via Mapbox forward
   * geocoding. Returns `null` on any failure mode (missing token, missing
   * address parts, no result, network error). Never throws.
   */
  private async geocodeAddress(input: {
    address: string | null | undefined;
    city: string | null | undefined;
    postalCode: string | null | undefined;
    country: string | null | undefined;
  }): Promise<{ latitude: number; longitude: number } | null> {
    const token = mapboxAccessToken();
    if (!token) return null;

    // We need at least the street (`address`) plus one of city/postal to
    // get a meaningful match. Anything thinner returns very low-confidence
    // results that would actually hurt the geofence (think: a centroid of
    // the entire country). Fail closed.
    const streetPart = (input.address ?? '').trim();
    const cityPart = (input.city ?? '').trim();
    const postalPart = (input.postalCode ?? '').trim();
    const countryPart = (input.country ?? '').trim();
    if (!streetPart) return null;
    if (!cityPart && !postalPart) return null;

    const queryParts = [streetPart, postalPart, cityPart, countryPart].filter(
      (s) => s.length > 0,
    );
    const query = queryParts.join(', ');

    const countryFilter = resolveGeocodeCountryFilter(countryPart);

    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/` +
      `${encodeURIComponent(query)}.json` +
      `?${countryFilter ? `country=${countryFilter}&` : ''}` +
      `types=address,postcode,place` +
      `&limit=1` +
      `&language=de` +
      `&access_token=${token}`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        this.logger.warn(`Mapbox geocoding HTTP ${res.status} for "${query}"`);
        return null;
      }
      const json = (await res.json()) as {
        features?: Array<{ center?: [number, number]; relevance?: number }>;
      };
      const feature = json.features?.[0];
      if (!feature?.center || feature.center.length !== 2) {
        this.logger.warn(`Mapbox geocoding: no result for "${query}"`);
        return null;
      }
      // Mapbox confidence floor — anything below 0.5 means the geocoder
      // had to guess heavily (e.g. fell back to the city centroid). That's
      // actively harmful for a 100m geofence so we reject it.
      if (typeof feature.relevance === 'number' && feature.relevance < 0.5) {
        this.logger.warn(
          `Mapbox geocoding: low-confidence result (${feature.relevance}) for "${query}"`,
        );
        return null;
      }
      const [lng, lat] = feature.center;
      if (
        typeof lat !== 'number' ||
        typeof lng !== 'number' ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lng)
      ) {
        return null;
      }
      return { latitude: lat, longitude: lng };
    } catch (err) {
      this.logger.warn(
        `Mapbox geocoding failed for "${query}": ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * One-shot recovery flow: geocode every station in the org that is
   * missing coordinates but has an address. Throttled to 300 ms between
   * lookups (Mapbox free tier permits 600/min; we stay polite). Returns
   * a per-station summary so the UI can show what changed.
   */
  async backfillCoordinates(organizationId: string): Promise<StationGeocodingBackfillResult> {
    const candidates = await this.prisma.station.findMany({
      where: {
        organizationId,
        OR: [{ latitude: null }, { longitude: null }],
      },
      orderBy: { name: 'asc' },
    });

    const result: StationGeocodingBackfillResult = {
      totalChecked: candidates.length,
      totalGeocoded: 0,
      totalFailed: 0,
      totalSkipped: 0,
      results: [],
    };

    for (let i = 0; i < candidates.length; i++) {
      const s = candidates[i];

      // Skip stations that don't even have a usable address — geocoding
      // those would either return nothing or produce a wildly wrong
      // centroid (see the relevance check in `geocodeAddress`).
      const hasMinimalAddress =
        (s.address ?? '').trim().length > 0 &&
        ((s.city ?? '').trim().length > 0 || (s.postalCode ?? '').trim().length > 0);
      if (!hasMinimalAddress) {
        result.totalSkipped++;
        result.results.push({
          stationId: s.id,
          stationName: s.name,
          status: 'skipped',
          latitude: null,
          longitude: null,
          reason: 'Adresse unvollständig',
        });
        continue;
      }

      // 300ms throttle between Mapbox requests so a tenant with hundreds
      // of stations doesn't trip the rate limiter or look like a bot. We
      // skip the wait before the first request to keep small backfills
      // (1–2 stations) snappy.
      if (i > 0) await this.delay(300);

      const coords = await this.geocodeAddress({
        address: s.address,
        city: s.city,
        postalCode: s.postalCode,
        country: s.country,
      });

      if (!coords) {
        result.totalFailed++;
        result.results.push({
          stationId: s.id,
          stationName: s.name,
          status: 'failed',
          latitude: null,
          longitude: null,
          reason: 'Mapbox lieferte kein Ergebnis',
        });
        continue;
      }

      await this.prisma.station.update({
        where: { id: s.id },
        data: { latitude: coords.latitude, longitude: coords.longitude },
      });
      result.totalGeocoded++;
      result.results.push({
        stationId: s.id,
        stationName: s.name,
        status: 'geocoded',
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
    }

    this.logger.log(
      `Backfill for org ${organizationId}: checked=${result.totalChecked}, ` +
        `geocoded=${result.totalGeocoded}, failed=${result.totalFailed}, ` +
        `skipped=${result.totalSkipped}`,
    );
    return result;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ─────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────

  private toDto(row: Station, vehicleCount: number): StationDto {
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      status: row.status,
      statusLabel: STATION_STATUS_LABELS[row.status],
      type: row.type,
      typeLabel: STATION_TYPE_LABELS[row.type],
      isPrimary: row.isPrimary,
      address: row.address,
      addressLine1: row.address,
      addressLine2: row.addressLine2,
      city: row.city,
      postalCode: row.postalCode,
      country: row.country,
      latitude: row.latitude,
      longitude: row.longitude,
      timezone: row.timezone,
      radiusMeters: row.radiusMeters,
      geofenceRadiusMeters: row.radiusMeters,
      phone: row.phone,
      email: row.email,
      managerName: row.managerName,
      contactPerson: row.managerName,
      pickupEnabled: row.pickupEnabled,
      returnEnabled: row.returnEnabled,
      afterHoursReturnEnabled: row.afterHoursReturnEnabled,
      keyBoxAvailable: row.keyBoxAvailable,
      capacity: row.capacity,
      openingHours: row.openingHours,
      holidayRules: row.holidayRules,
      handoverInstructions: row.handoverInstructions,
      returnInstructions: row.returnInstructions,
      notes: row.notes,
      internalNotes: row.internalNotes,
      googlePlaceId: row.googlePlaceId,
      archivedAt: row.archivedAt,
      vehicleCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  // Geofence radius is bounded so we can't accidentally store a negative
  // value (would invert the haversine check) or an absurd value (e.g.
  // city-wide 50km — that defeats the "is this car parked at the depot?"
  // intent and would always evaluate to true).
  private readonly RADIUS_MIN_M = 25;
  private readonly RADIUS_MAX_M = 5000;

  private buildWriteData(payload: StationPatchPayload): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    const passthrough: Array<keyof StationPatchPayload> = [
      'address',
      'addressLine2',
      'city',
      'postalCode',
      'country',
      'latitude',
      'longitude',
      'timezone',
      'phone',
      'email',
      'managerName',
      'openingHours',
      'holidayRules',
      'handoverInstructions',
      'returnInstructions',
      'notes',
      'internalNotes',
      'googlePlaceId',
      'code',
      'type',
      'isPrimary',
      'pickupEnabled',
      'returnEnabled',
      'afterHoursReturnEnabled',
      'keyBoxAvailable',
      'capacity',
    ];
    for (const key of passthrough) {
      const v = payload[key];
      if (v !== undefined) data[key] = v === '' ? null : v;
    }

    if (payload.radiusMeters !== undefined) {
      const r = payload.radiusMeters;
      if (r === null) {
        data.radiusMeters = null;
      } else if (typeof r !== 'number' || !Number.isFinite(r)) {
        throw new BadRequestException('radiusMeters must be a finite number or null');
      } else {
        const rounded = Math.round(r);
        if (rounded < this.RADIUS_MIN_M || rounded > this.RADIUS_MAX_M) {
          throw new BadRequestException(
            `radiusMeters must be between ${this.RADIUS_MIN_M} and ${this.RADIUS_MAX_M} meters`,
          );
        }
        data.radiusMeters = rounded;
      }
    }

    if (payload.status !== undefined) {
      if (!STATION_STATUS_VALUES.includes(payload.status as StationStatus)) {
        throw new BadRequestException(`Invalid station status: ${payload.status}`);
      }
      data.status = payload.status;
      if (payload.status === 'ARCHIVED') {
        data.archivedAt = new Date();
      } else if (payload.status === 'ACTIVE') {
        data.archivedAt = null;
      }
    }

    return data;
  }
}
