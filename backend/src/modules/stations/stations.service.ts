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
import {
  validateStationCreatePayload,
} from './station-create-validation.util';
import {
  assertGenericStationUpdateAllowed,
  buildStationPatchWriteData,
  type StationUpdatePayload,
} from './station-update-validation.util';
import { UpdateStationDto } from './dto/update-station.dto';
import { ListStationsQueryDto } from './dto/list-stations-query.dto';
import { mapboxAccessToken, resolveGeocodeCountryFilter } from './station-geocode.util';
import type { StationScopeContext } from '@shared/stations/station-scope.types';
import type { StationAccessScope } from '@shared/stations/station-access-scope.types';
import { StationAccessScopeService } from '@shared/stations/station-access-scope.service';
import {
  buildStationLifecycleCommandAudit,
  evaluateStationLifecycleCommand,
} from './station-lifecycle-command.util';
import {
  StationLifecycleCommandName,
  StationLifecycleCommandOutcome,
  type StationLifecycleCommandResult,
} from './station-lifecycle-command.types';
import {
  buildArchivePreviewListSection,
  evaluateStationArchivePreview,
} from './station-archive-preview.util';
import {
  STATION_ARCHIVE_PREVIEW_LIST_LIMIT,
  type StationArchivePreviewResult,
} from './station-archive-preview.types';
import {
  buildArchivedCapabilitiesSnapshot,
  buildStationArchiveCommandAudit,
  evaluateStationArchiveCommand,
} from './station-archive-command.util';
import {
  StationArchiveCommandName,
  StationArchiveCommandOutcome,
  type StationArchiveCommandOptions,
  type StationArchiveCommandResult,
} from './station-archive-command.types';
import { ArchiveStationDto } from './dto/archive-station.dto';
import { parseStationIds } from '@shared/stations/station-scope.util';
import { isStationReadableInAccessScope } from '@shared/stations/station-access-scope.util';

const STATION_STATUS_VALUES: StationStatus[] = ['ACTIVE', 'INACTIVE', 'ARCHIVED'];
const FUTURE_BOOKING_STATUSES: BookingStatus[] = ['PENDING', 'CONFIRMED', 'ACTIVE'];
const OPEN_HANDOVER_STATUSES: BookingStatus[] = ['CONFIRMED', 'ACTIVE'];

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
    const access = this.stationAccessScope.resolveFromContextOrEmpty(organizationId, scope);
    const station = await this.prisma.station.findFirst({
      where: this.stationAccessScope.buildStationWhere(access, { id }),
      include: this.stationIncludeCount(),
    });
    if (!station) {
      throw new NotFoundException(`Station ${id} not found`);
    }
    return this.toDto(station, station._count.vehiclesHome);
  }

  async create(organizationId: string, payload: StationUpsertPayload): Promise<StationDto> {
    validateStationCreatePayload(payload);
    const name = payload.name?.trim();
    if (!name) throw new BadRequestException('Station name is required');

    const normalizedCode = payload.code?.trim();
    if (normalizedCode) {
      const dup = await this.prisma.station.findFirst({
        where: { organizationId, code: normalizedCode },
      });
      if (dup) throw new ConflictException(`Station code "${normalizedCode}" already exists`);
    }

    const writable = this.buildWriteData(payload);
    if (normalizedCode) writable.code = normalizedCode;

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

    assertGenericStationUpdateAllowed(payload as StationUpdatePayload, {
      status: existing.status,
      pickupEnabled: existing.pickupEnabled,
      returnEnabled: existing.returnEnabled,
    });

    const writable = buildStationPatchWriteData(payload as StationUpdatePayload);
    if (payload.radiusMeters !== undefined) {
      const r = payload.radiusMeters;
      if (r === null) {
        writable.radiusMeters = null;
      } else if (typeof r !== 'number' || !Number.isFinite(r)) {
        throw new BadRequestException('radiusMeters must be a finite number or null');
      } else {
        const rounded = Math.round(r);
        if (rounded < this.RADIUS_MIN_M || rounded > this.RADIUS_MAX_M) {
          throw new BadRequestException(
            `radiusMeters must be between ${this.RADIUS_MIN_M} and ${this.RADIUS_MAX_M} meters`,
          );
        }
        writable.radiusMeters = rounded;
      }
    }

    if (payload.name !== undefined) {
      const trimmed = payload.name?.trim();
      if (!trimmed) throw new BadRequestException('Station name cannot be empty');
      writable.name = trimmed;
    }

    if (payload.code) {
      const normalizedCode = payload.code.trim();
      const dup = await this.prisma.station.findFirst({
        where: { organizationId, code: normalizedCode, id: { not: id } },
      });
      if (dup) throw new ConflictException(`Station code "${normalizedCode}" already exists`);
      writable.code = normalizedCode;
    }

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

    const station = await this.prisma.station.update({
      where: { id },
      data: writable,
      include: this.stationIncludeCount(),
    });
    return this.toDto(station, station._count.vehiclesHome);
  }

  async archive(
    organizationId: string,
    id: string,
    options: StationArchiveCommandOptions | ArchiveStationDto = {},
    scope?: StationScopeContext,
    performedByUserId?: string | null,
  ): Promise<StationArchiveCommandResult<StationDto>> {
    return this.archiveStation(organizationId, id, options, scope, performedByUserId);
  }

  async archiveStation(
    organizationId: string,
    id: string,
    options: StationArchiveCommandOptions | ArchiveStationDto = {},
    scope?: StationScopeContext,
    performedByUserId?: string | null,
  ): Promise<StationArchiveCommandResult<StationDto>> {
    const access = this.stationAccessScope.resolveFromContextOrEmpty(organizationId, scope);
    const station = (await this.stationAccessScope.requireReadableStation(access, id, {
      include: this.stationIncludeCount(),
    })) as Prisma.StationGetPayload<{ include: ReturnType<StationsService['stationIncludeCount']> }>;
    const vehicleHomeCount = station._count.vehiclesHome;

    const preflight = await this.loadStationArchivePreflight(access, station.id);
    const preview = evaluateStationArchivePreview({
      snapshot: {
        stationId: station.id,
        organizationId: station.organizationId,
        status: station.status,
        isPrimary: station.isPrimary,
        archivedAt: station.archivedAt,
        pickupEnabled: station.pickupEnabled,
        returnEnabled: station.returnEnabled,
        afterHoursReturnEnabled: station.afterHoursReturnEnabled,
        keyBoxAvailable: station.keyBoxAvailable,
        successorCandidates: preflight.successorCandidates,
      },
      counts: preflight.counts,
    });

    const successorId = options.successorPrimaryStationId?.trim() || null;
    let successorPrimaryStationStatus: StationStatus | null = null;
    if (successorId) {
      const successor = await this.prisma.station.findFirst({
        where: { id: successorId, organizationId },
        select: { status: true },
      });
      successorPrimaryStationStatus = successor?.status ?? null;
    }

    const evaluation = evaluateStationArchiveCommand({
      preview,
      options,
      station: {
        id: station.id,
        status: station.status,
        isPrimary: station.isPrimary,
      },
      successorPrimaryStationStatus,
    });

    const auditBase = {
      stationId: station.id,
      organizationId: station.organizationId,
      previousStatus: station.status,
      nextStatus: 'ARCHIVED' as const,
      performedByUserId: performedByUserId ?? null,
      idempotent: evaluation.idempotent,
      successorPrimaryStationId: successorId,
      acknowledgedFutureBookings: options.acknowledgeFutureBookings === true,
      futurePickupCount: preflight.counts.futurePickupBookings,
      futureReturnCount: preflight.counts.futureReturnBookings,
    };

    if (evaluation.idempotent) {
      return {
        outcome: StationArchiveCommandOutcome.IDEMPOTENT,
        command: StationArchiveCommandName.ARCHIVE,
        allowed: true,
        station: this.toDto(station, vehicleHomeCount),
        blockingReasons: [],
        warnings: evaluation.warnings,
        requiredActions: evaluation.requiredActions,
        audit: buildStationArchiveCommandAudit(auditBase),
      };
    }

    if (!evaluation.allowed) {
      throw new BadRequestException({
        message:
          evaluation.blockingReasons[0]?.message ??
          'Archive is not allowed for this station',
        code: 'ARCHIVE_BLOCKED',
        outcome: StationArchiveCommandOutcome.BLOCKED,
        command: StationArchiveCommandName.ARCHIVE,
        blockingReasons: evaluation.blockingReasons,
        warnings: evaluation.warnings,
        requiredActions: evaluation.requiredActions,
        audit: buildStationArchiveCommandAudit(auditBase),
      });
    }

    const archivedAt = new Date();
    const archivedCapabilitiesSnapshot = buildArchivedCapabilitiesSnapshot({
      pickupEnabled: station.pickupEnabled,
      returnEnabled: station.returnEnabled,
      afterHoursReturnEnabled: station.afterHoursReturnEnabled,
      keyBoxAvailable: station.keyBoxAvailable,
      isPrimary: station.isPrimary,
      archivedAt,
      archivedByUserId: performedByUserId ?? null,
      reason: options.reason ?? null,
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      if (station.isPrimary && successorId) {
        await tx.station.updateMany({
          where: { organizationId, isPrimary: true },
          data: { isPrimary: false },
        });
        await tx.station.update({
          where: { id: successorId },
          data: { isPrimary: true, status: 'ACTIVE' },
        });
      }

      return tx.station.update({
        where: { id },
        data: {
          status: 'ARCHIVED',
          archivedAt,
          isPrimary: false,
          pickupEnabled: false,
          returnEnabled: false,
          archivedCapabilitiesSnapshot,
          lifecycleMetadata: {
            lastArchiveReason: options.reason?.trim() || 'USER_REQUEST',
            lastArchivedAt: archivedAt.toISOString(),
            lastArchivedByUserId: performedByUserId ?? null,
          },
        },
        include: this.stationIncludeCount(),
      });
    });

    const audit = buildStationArchiveCommandAudit({
      ...auditBase,
      archivedCapabilitiesSnapshot,
    });

    return {
      outcome: StationArchiveCommandOutcome.APPLIED,
      command: StationArchiveCommandName.ARCHIVE,
      allowed: true,
      station: this.toDto(updated, updated._count.vehiclesHome),
      blockingReasons: [],
      warnings: evaluation.warnings,
      requiredActions: evaluation.requiredActions,
      audit,
    };
  }

  private async loadStationArchivePreflight(
    access: StationAccessScope,
    stationId: string,
  ) {
    const station = await this.stationAccessScope.requireReadableStation(access, stationId, {
      select: {
        id: true,
        organizationId: true,
        isPrimary: true,
      },
    });

    const now = new Date();
    const futurePickupWhere = this.stationAccessScope.buildStationPickupBookingsWhere(
      access,
      stationId,
      {
        status: { in: FUTURE_BOOKING_STATUSES },
        startDate: { gt: now },
      },
    );
    const futureReturnWhere = this.stationAccessScope.buildStationReturnBookingsWhere(
      access,
      stationId,
      {
        status: { in: FUTURE_BOOKING_STATUSES },
        endDate: { gt: now },
      },
    );
    const homeWhere = this.buildArchivePreviewVehicleWhere(access, stationId, 'homeStationId');
    const presentWhere = this.buildArchivePreviewVehicleWhere(access, stationId, 'currentStationId');
    const expectedWhere = this.buildArchivePreviewVehicleWhere(access, stationId, 'expectedStationId');
    const plannedTransferWhere: Prisma.VehicleWhereInput = {
      ...expectedWhere,
      OR: [{ currentStationId: null }, { currentStationId: { not: stationId } }],
    };
    const stationBookingWhere = this.stationAccessScope.buildStationBookingsWhere(access, stationId);
    const stationVehicleWhere = this.stationAccessScope.buildStationLinkedVehicleWhere(
      access,
      stationId,
    );
    const openPickupHandoverWhere: Prisma.BookingWhereInput = {
      organizationId: access.orgId,
      status: { in: OPEN_HANDOVER_STATUSES },
      OR: [{ pickupStationId: stationId }, { actualPickupStationId: stationId }],
      handoverProtocols: { none: { kind: 'PICKUP' } },
    };
    const openReturnHandoverWhere: Prisma.BookingWhereInput = {
      organizationId: access.orgId,
      status: { in: OPEN_HANDOVER_STATUSES },
      OR: [{ returnStationId: stationId }, { actualReturnStationId: stationId }],
      handoverProtocols: { none: { kind: 'RETURN' } },
    };

    const successorCandidates = station.isPrimary
      ? await this.prisma.station.findMany({
          where: {
            organizationId: station.organizationId,
            status: 'ACTIVE',
            id: { not: stationId },
          },
          select: { id: true, name: true, code: true },
          orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
          take: STATION_ARCHIVE_PREVIEW_LIST_LIMIT,
        })
      : [];

    const [
      homeVehicles,
      presentVehicles,
      expectedVehicles,
      plannedTransfers,
      futurePickupBookings,
      futureReturnBookings,
      openPickupHandovers,
      openReturnHandovers,
      activeBookings,
      openTasks,
      scopedStaff,
    ] = await Promise.all([
      this.prisma.vehicle.count({ where: homeWhere }),
      this.prisma.vehicle.count({ where: presentWhere }),
      this.prisma.vehicle.count({ where: expectedWhere }),
      this.prisma.vehicle.count({ where: plannedTransferWhere }),
      this.prisma.booking.count({ where: futurePickupWhere }),
      this.prisma.booking.count({ where: futureReturnWhere }),
      this.prisma.booking.count({ where: openPickupHandoverWhere }),
      this.prisma.booking.count({ where: openReturnHandoverWhere }),
      this.prisma.booking.count({
        where: { ...stationBookingWhere, status: 'ACTIVE' },
      }),
      this.countStationOpenTasks(access, stationId, stationVehicleWhere, stationBookingWhere),
      this.loadStationScopedStaff(station.organizationId, stationId, STATION_ARCHIVE_PREVIEW_LIST_LIMIT),
    ]);

    return {
      successorCandidates,
      counts: {
        homeVehicles,
        presentVehicles,
        expectedVehicles,
        futurePickupBookings,
        futureReturnBookings,
        openHandovers: openPickupHandovers + openReturnHandovers,
        scopedStaff: scopedStaff.totalCount,
        openTasks,
        plannedTransfers,
        activeBookings,
      },
    };
  }

  async activateStation(
    organizationId: string,
    id: string,
  ): Promise<StationLifecycleCommandResult<StationDto>> {
    return this.runLifecycleStatusCommand(
      organizationId,
      id,
      StationLifecycleCommandName.ACTIVATE,
    );
  }

  async deactivateStation(
    organizationId: string,
    id: string,
  ): Promise<StationLifecycleCommandResult<StationDto>> {
    const preflight = await this.countFutureStationBookings(organizationId, id);
    return this.runLifecycleStatusCommand(
      organizationId,
      id,
      StationLifecycleCommandName.DEACTIVATE,
      preflight,
    );
  }

  private async countFutureStationBookings(
    organizationId: string,
    stationId: string,
  ): Promise<{ futurePickupCount: number; futureReturnCount: number }> {
    const now = new Date();
    const [futurePickupCount, futureReturnCount] = await Promise.all([
      this.prisma.booking.count({
        where: {
          organizationId,
          pickupStationId: stationId,
          status: { in: FUTURE_BOOKING_STATUSES },
          startDate: { gt: now },
        },
      }),
      this.prisma.booking.count({
        where: {
          organizationId,
          returnStationId: stationId,
          status: { in: FUTURE_BOOKING_STATUSES },
          endDate: { gt: now },
        },
      }),
    ]);
    return { futurePickupCount, futureReturnCount };
  }

  private async runLifecycleStatusCommand(
    organizationId: string,
    id: string,
    command: typeof StationLifecycleCommandName.ACTIVATE | typeof StationLifecycleCommandName.DEACTIVATE,
    preflight?: { futurePickupCount: number; futureReturnCount: number },
  ): Promise<StationLifecycleCommandResult<StationDto>> {
    const station = await this.prisma.station.findFirst({
      where: { id, organizationId },
      include: this.stationIncludeCount(),
    });
    if (!station) throw new NotFoundException(`Station ${id} not found`);

    const evaluation = evaluateStationLifecycleCommand({
      command,
      station: {
        id: station.id,
        status: station.status,
        isPrimary: station.isPrimary,
        pickupEnabled: station.pickupEnabled,
        returnEnabled: station.returnEnabled,
        archivedAt: station.archivedAt,
      },
      preflight,
    });

    const nextStatus =
      command === StationLifecycleCommandName.ACTIVATE ? 'ACTIVE' : 'INACTIVE';

    const audit = buildStationLifecycleCommandAudit({
      command,
      stationId: station.id,
      organizationId,
      previousStatus: station.status,
      nextStatus,
      idempotent: evaluation.idempotent,
      preflight,
    });

    if (!evaluation.allowed) {
      throw new BadRequestException({
        message:
          evaluation.blockingReasons[0]?.message ??
          `${command} is not allowed for this station`,
        code: `${command}_BLOCKED`,
        outcome: StationLifecycleCommandOutcome.BLOCKED,
        command,
        blockingReasons: evaluation.blockingReasons,
        warnings: evaluation.warnings,
        requiredActions: evaluation.requiredActions,
        audit,
      });
    }

    if (evaluation.idempotent) {
      return {
        outcome: StationLifecycleCommandOutcome.IDEMPOTENT,
        command,
        allowed: true,
        station: this.toDto(station, station._count.vehiclesHome),
        blockingReasons: [],
        warnings: evaluation.warnings,
        requiredActions: evaluation.requiredActions,
        audit,
      };
    }

    const updated = await this.prisma.station.update({
      where: { id },
      data: { status: evaluation.enforcedMutations?.status ?? nextStatus },
      include: this.stationIncludeCount(),
    });

    return {
      outcome: StationLifecycleCommandOutcome.APPLIED,
      command,
      allowed: true,
      station: this.toDto(updated, updated._count.vehiclesHome),
      blockingReasons: [],
      warnings: evaluation.warnings,
      requiredActions: evaluation.requiredActions,
      audit,
    };
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

  /** @deprecated Prefer archiveStation() — kept for backward compatibility */
  async delete(organizationId: string, id: string): Promise<{ id: string; unassignedVehicles: number; archived: boolean }> {
    const station = await this.prisma.station.findFirst({
      where: { id, organizationId },
    });
    if (!station) throw new NotFoundException(`Station ${id} not found`);

    await this.archiveStation(organizationId, id, { acknowledgeFutureBookings: true });
    return { id, unassignedVehicles: 0, archived: true };
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
    const access = this.stationAccessScope.resolveFromContextOrEmpty(organizationId, scope);
    const station = await this.stationAccessScope.requireReadableStation(access, stationId, {
      select: {
        capacity: true,
        latitude: true,
        longitude: true,
        openingHours: true,
        pickupEnabled: true,
        returnEnabled: true,
        status: true,
      },
    });

    const stationVehicleWhere = this.stationAccessScope.buildStationLinkedVehicleWhere(
      access,
      stationId,
    );

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
        where: this.stationAccessScope.buildStationBookingsWhere(access, stationId),
        select: { id: true },
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
        where: this.stationAccessScope.buildStationPickupBookingsWhere(access, stationId, {
          startDate: { gte: startOfToday, lt: endOfToday },
          status: { in: activeBookingStatuses },
        }),
      }),
      this.prisma.booking.count({
        where: this.stationAccessScope.buildStationReturnBookingsWhere(access, stationId, {
          endDate: { gte: startOfToday, lt: endOfToday },
          status: { in: activeBookingStatuses },
        }),
      }),
      this.prisma.booking.count({
        where: this.stationAccessScope.buildStationPickupBookingsWhere(access, stationId, {
          startDate: { gte: endOfToday },
          status: { in: activeBookingStatuses },
        }),
      }),
      this.prisma.booking.count({
        where: this.stationAccessScope.buildStationReturnBookingsWhere(access, stationId, {
          endDate: { gte: endOfToday },
          status: { in: activeBookingStatuses },
        }),
      }),
    ]);

    const openTasks = await this.prisma.orgTask.count({
      where: this.stationAccessScope.buildStationOpenTasksWhere(
        access,
        stationId,
        stationVehicleIds,
        stationBookingIds,
      ),
    });

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
    const access = this.stationAccessScope.resolveFromContextOrEmpty(organizationId, scope);
    await this.stationAccessScope.requireReadableStation(access, stationId, {
      select: { id: true },
    });

    return this.prisma.vehicle.findMany({
      where: this.stationAccessScope.buildStationFleetWhere(access, stationId),
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
    const access = this.stationAccessScope.resolveFromContextOrEmpty(organizationId, scope);
    await this.stationAccessScope.requireReadableStation(access, stationId, {
      select: { id: true, status: true },
    });

    const bookings = await this.prisma.booking.findMany({
      where: this.stationAccessScope.buildStationBookingsWhere(access, stationId),
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
    const access = this.stationAccessScope.resolveFromContextOrEmpty(organizationId, scope);
    const station = await this.stationAccessScope.requireReadableStation(access, stationId, {
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

  async getStationArchivePreview(
    organizationId: string,
    stationId: string,
    scope?: StationScopeContext,
  ): Promise<StationArchivePreviewResult> {
    const access = this.stationAccessScope.resolveFromContextOrEmpty(organizationId, scope);
    const station = await this.stationAccessScope.requireReadableStation(access, stationId, {
      select: {
        id: true,
        organizationId: true,
        name: true,
        code: true,
        status: true,
        isPrimary: true,
        archivedAt: true,
        pickupEnabled: true,
        returnEnabled: true,
        afterHoursReturnEnabled: true,
        keyBoxAvailable: true,
      },
    });

    const limit = STATION_ARCHIVE_PREVIEW_LIST_LIMIT;
    const now = new Date();
    const successorCandidates = station.isPrimary
      ? await this.prisma.station.findMany({
          where: {
            organizationId,
            status: 'ACTIVE',
            id: { not: stationId },
          },
          select: { id: true, name: true, code: true },
          orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
          take: limit,
        })
      : [];

    const homeWhere = this.buildArchivePreviewVehicleWhere(access, stationId, 'homeStationId');
    const presentWhere = this.buildArchivePreviewVehicleWhere(access, stationId, 'currentStationId');
    const expectedWhere = this.buildArchivePreviewVehicleWhere(access, stationId, 'expectedStationId');
    const plannedTransferWhere: Prisma.VehicleWhereInput = {
      ...expectedWhere,
      OR: [
        { currentStationId: null },
        { currentStationId: { not: stationId } },
      ],
    };

    const futurePickupWhere = this.stationAccessScope.buildStationPickupBookingsWhere(
      access,
      stationId,
      {
        status: { in: FUTURE_BOOKING_STATUSES },
        startDate: { gt: now },
      },
    );
    const futureReturnWhere = this.stationAccessScope.buildStationReturnBookingsWhere(
      access,
      stationId,
      {
        status: { in: FUTURE_BOOKING_STATUSES },
        endDate: { gt: now },
      },
    );

    const openPickupHandoverWhere: Prisma.BookingWhereInput = {
      organizationId,
      status: { in: OPEN_HANDOVER_STATUSES },
      OR: [{ pickupStationId: stationId }, { actualPickupStationId: stationId }],
      handoverProtocols: { none: { kind: 'PICKUP' } },
    };
    const openReturnHandoverWhere: Prisma.BookingWhereInput = {
      organizationId,
      status: { in: OPEN_HANDOVER_STATUSES },
      OR: [{ returnStationId: stationId }, { actualReturnStationId: stationId }],
      handoverProtocols: { none: { kind: 'RETURN' } },
    };

    const stationVehicleWhere = this.stationAccessScope.buildStationLinkedVehicleWhere(
      access,
      stationId,
    );
    const stationBookingWhere = this.stationAccessScope.buildStationBookingsWhere(access, stationId);

    const [
      homeVehiclesCount,
      presentVehiclesCount,
      expectedVehiclesCount,
      plannedTransfersCount,
      futurePickupCount,
      futureReturnCount,
      openPickupHandoverCount,
      openReturnHandoverCount,
      activeBookingCount,
      homeVehicles,
      presentVehicles,
      expectedVehicles,
      plannedTransfers,
      futurePickupBookings,
      futureReturnBookings,
      openPickupHandovers,
      openReturnHandovers,
      openTasksCount,
      openTasks,
    ] = await Promise.all([
      this.prisma.vehicle.count({ where: homeWhere }),
      this.prisma.vehicle.count({ where: presentWhere }),
      this.prisma.vehicle.count({ where: expectedWhere }),
      this.prisma.vehicle.count({ where: plannedTransferWhere }),
      this.prisma.booking.count({ where: futurePickupWhere }),
      this.prisma.booking.count({ where: futureReturnWhere }),
      this.prisma.booking.count({ where: openPickupHandoverWhere }),
      this.prisma.booking.count({ where: openReturnHandoverWhere }),
      this.prisma.booking.count({
        where: {
          ...stationBookingWhere,
          status: 'ACTIVE',
        },
      }),
      this.prisma.vehicle.findMany({
        where: homeWhere,
        select: {
          id: true,
          vehicleName: true,
          licensePlate: true,
          status: true,
        },
        orderBy: [{ licensePlate: 'asc' }],
        take: limit,
      }),
      this.prisma.vehicle.findMany({
        where: presentWhere,
        select: {
          id: true,
          vehicleName: true,
          licensePlate: true,
          status: true,
        },
        orderBy: [{ licensePlate: 'asc' }],
        take: limit,
      }),
      this.prisma.vehicle.findMany({
        where: expectedWhere,
        select: {
          id: true,
          vehicleName: true,
          licensePlate: true,
          status: true,
        },
        orderBy: [{ licensePlate: 'asc' }],
        take: limit,
      }),
      this.prisma.vehicle.findMany({
        where: plannedTransferWhere,
        select: {
          id: true,
          vehicleName: true,
          licensePlate: true,
          status: true,
        },
        orderBy: [{ licensePlate: 'asc' }],
        take: limit,
      }),
      this.prisma.booking.findMany({
        where: futurePickupWhere,
        include: {
          customer: { select: { firstName: true, lastName: true } },
          vehicle: { select: { vehicleName: true, make: true, model: true, licensePlate: true } },
        },
        orderBy: { startDate: 'asc' },
        take: limit,
      }),
      this.prisma.booking.findMany({
        where: futureReturnWhere,
        include: {
          customer: { select: { firstName: true, lastName: true } },
          vehicle: { select: { vehicleName: true, make: true, model: true, licensePlate: true } },
        },
        orderBy: { endDate: 'asc' },
        take: limit,
      }),
      this.prisma.booking.findMany({
        where: openPickupHandoverWhere,
        include: {
          customer: { select: { firstName: true, lastName: true } },
          vehicle: { select: { vehicleName: true, make: true, model: true, licensePlate: true } },
        },
        orderBy: { startDate: 'asc' },
        take: limit,
      }),
      this.prisma.booking.findMany({
        where: openReturnHandoverWhere,
        include: {
          customer: { select: { firstName: true, lastName: true } },
          vehicle: { select: { vehicleName: true, make: true, model: true, licensePlate: true } },
        },
        orderBy: { endDate: 'asc' },
        take: limit,
      }),
      this.countStationOpenTasks(access, stationId, stationVehicleWhere, stationBookingWhere),
      this.loadStationOpenTasks(access, stationId, stationVehicleWhere, stationBookingWhere, limit),
    ]);

    const scopedStaff = await this.loadStationScopedStaff(organizationId, stationId, limit);
    const openHandoverCount = openPickupHandoverCount + openReturnHandoverCount;

    const previewEvaluation = evaluateStationArchivePreview({
      snapshot: {
        stationId: station.id,
        organizationId: station.organizationId,
        status: station.status,
        isPrimary: station.isPrimary,
        archivedAt: station.archivedAt,
        pickupEnabled: station.pickupEnabled,
        returnEnabled: station.returnEnabled,
        afterHoursReturnEnabled: station.afterHoursReturnEnabled,
        keyBoxAvailable: station.keyBoxAvailable,
        successorCandidates,
      },
      counts: {
        homeVehicles: homeVehiclesCount,
        presentVehicles: presentVehiclesCount,
        expectedVehicles: expectedVehiclesCount,
        futurePickupBookings: futurePickupCount,
        futureReturnBookings: futureReturnCount,
        openHandovers: openHandoverCount,
        scopedStaff: scopedStaff.totalCount,
        openTasks: openTasksCount,
        plannedTransfers: plannedTransfersCount,
        activeBookings: activeBookingCount,
      },
    });

    const commandEvaluation = evaluateStationArchiveCommand({
      preview: previewEvaluation,
      options: {},
      station: {
        id: station.id,
        status: station.status,
        isPrimary: station.isPrimary,
      },
    });

    const openHandoverItems = [
      ...openPickupHandovers.map((booking) =>
        this.mapArchivePreviewHandoverItem(booking, 'PICKUP', booking.startDate),
      ),
      ...openReturnHandovers.map((booking) =>
        this.mapArchivePreviewHandoverItem(booking, 'RETURN', booking.endDate),
      ),
    ].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

    const previewSections = {
      homeVehicles: buildArchivePreviewListSection(homeVehicles, homeVehiclesCount, limit),
      presentVehicles: buildArchivePreviewListSection(presentVehicles, presentVehiclesCount, limit),
      expectedVehicles: buildArchivePreviewListSection(expectedVehicles, expectedVehiclesCount, limit),
      futurePickupBookings: buildArchivePreviewListSection(
        futurePickupBookings.map((booking) => this.mapArchivePreviewBookingItem(booking)),
        futurePickupCount,
        limit,
      ),
      futureReturnBookings: buildArchivePreviewListSection(
        futureReturnBookings.map((booking) => this.mapArchivePreviewBookingItem(booking)),
        futureReturnCount,
        limit,
      ),
      openHandovers: buildArchivePreviewListSection(
        openHandoverItems.slice(0, limit),
        openHandoverCount,
        limit,
      ),
      scopedStaff: buildArchivePreviewListSection(
        scopedStaff.items,
        scopedStaff.totalCount,
        limit,
      ),
      openTasks: buildArchivePreviewListSection(openTasks, openTasksCount, limit),
      plannedTransfers: buildArchivePreviewListSection(
        plannedTransfers,
        plannedTransfersCount,
        limit,
      ),
    };

    const partial = Object.values(previewSections).some((section) => section.truncated);

    return {
      stationId: station.id,
      organizationId: station.organizationId,
      status: station.status,
      alreadyArchived: station.status === 'ARCHIVED',
      isPrimary: station.isPrimary,
      primaryStatus: {
        isPrimary: station.isPrimary,
        successorCandidates,
      },
      capabilities: {
        pickupEnabled: station.pickupEnabled,
        returnEnabled: station.returnEnabled,
        afterHoursReturnEnabled: station.afterHoursReturnEnabled,
        keyBoxAvailable: station.keyBoxAvailable,
      },
      partial,
      preview: previewSections,
      archiveAllowed: commandEvaluation.allowed,
      idempotent: commandEvaluation.idempotent,
      blockingReasons: commandEvaluation.blockingReasons,
      warnings: commandEvaluation.warnings,
      requiredFollowUpActions: commandEvaluation.requiredActions,
      affectedCounts: previewEvaluation.affectedCounts,
    };
  }

  private buildArchivePreviewVehicleWhere(
    access: StationAccessScope,
    stationId: string,
    field: 'homeStationId' | 'currentStationId' | 'expectedStationId',
  ): Prisma.VehicleWhereInput {
    if (!isStationReadableInAccessScope(access, stationId)) {
      return { organizationId: access.orgId, id: { in: [] } };
    }

    return {
      organizationId: access.orgId,
      [field]: stationId,
    };
  }

  private async countStationOpenTasks(
    access: StationAccessScope,
    stationId: string,
    stationVehicleWhere: Prisma.VehicleWhereInput,
    stationBookingWhere: Prisma.BookingWhereInput,
  ): Promise<number> {
    const stationVehicleIds = (
      await this.prisma.vehicle.findMany({
        where: stationVehicleWhere,
        select: { id: true },
      })
    ).map((vehicle) => vehicle.id);
    const stationBookingIds = (
      await this.prisma.booking.findMany({
        where: stationBookingWhere,
        select: { id: true },
      })
    ).map((booking) => booking.id);

    return this.prisma.orgTask.count({
      where: this.stationAccessScope.buildStationOpenTasksWhere(
        access,
        stationId,
        stationVehicleIds,
        stationBookingIds,
      ),
    });
  }

  private async loadStationOpenTasks(
    access: StationAccessScope,
    stationId: string,
    stationVehicleWhere: Prisma.VehicleWhereInput,
    stationBookingWhere: Prisma.BookingWhereInput,
    limit: number,
  ) {
    const stationVehicleIds = (
      await this.prisma.vehicle.findMany({
        where: stationVehicleWhere,
        select: { id: true },
      })
    ).map((vehicle) => vehicle.id);
    const stationBookingIds = (
      await this.prisma.booking.findMany({
        where: stationBookingWhere,
        select: { id: true },
      })
    ).map((booking) => booking.id);

    return this.prisma.orgTask.findMany({
      where: this.stationAccessScope.buildStationOpenTasksWhere(
        access,
        stationId,
        stationVehicleIds,
        stationBookingIds,
      ),
      select: {
        id: true,
        title: true,
        status: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  private async loadStationScopedStaff(
    organizationId: string,
    stationId: string,
    limit: number,
  ) {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: {
        organizationId,
        status: 'ACTIVE',
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    const matched = memberships.filter((membership) => {
      const assignedIds = parseStationIds(membership.stationIds);
      if (assignedIds.includes(stationId)) return true;
      const legacyScope = membership.stationScope?.trim();
      return legacyScope === stationId;
    });

    const items = matched.slice(0, limit).map((membership) => ({
      membershipId: membership.id,
      userId: membership.user.id,
      name:
        `${membership.user.firstName ?? ''} ${membership.user.lastName ?? ''}`.trim() ||
        membership.user.email ||
        membership.user.id,
      role: membership.role,
    }));

    return {
      totalCount: matched.length,
      items,
    };
  }

  private mapArchivePreviewBookingItem(booking: {
    id: string;
    status: BookingStatus;
    startDate: Date;
    endDate: Date;
    customer: { firstName: string | null; lastName: string | null };
    vehicle: {
      vehicleName: string | null;
      make: string | null;
      model: string | null;
      licensePlate: string | null;
    };
  }) {
    return {
      id: booking.id,
      status: booking.status,
      startDate: booking.startDate.toISOString(),
      endDate: booking.endDate.toISOString(),
      customerName: `${booking.customer.firstName ?? ''} ${booking.customer.lastName ?? ''}`.trim(),
      vehicleLabel:
        booking.vehicle.vehicleName ||
        `${booking.vehicle.make ?? ''} ${booking.vehicle.model ?? ''}`.trim() ||
        booking.vehicle.licensePlate ||
        '',
    };
  }

  private mapArchivePreviewHandoverItem(
    booking: {
      id: string;
      status: BookingStatus;
      customer: { firstName: string | null; lastName: string | null };
      vehicle: {
        vehicleName: string | null;
        make: string | null;
        model: string | null;
        licensePlate: string | null;
      };
    },
    kind: 'PICKUP' | 'RETURN',
    scheduledAt: Date,
  ) {
    return {
      bookingId: booking.id,
      kind,
      status: booking.status,
      scheduledAt: scheduledAt.toISOString(),
      customerName: `${booking.customer.firstName ?? ''} ${booking.customer.lastName ?? ''}`.trim(),
      vehicleLabel:
        booking.vehicle.vehicleName ||
        `${booking.vehicle.make ?? ''} ${booking.vehicle.model ?? ''}`.trim() ||
        booking.vehicle.licensePlate ||
        '',
    };
  }

  async getStationTeam(
    organizationId: string,
    stationId: string,
    scope?: StationScopeContext,
  ): Promise<StationTeamDto> {
    const access = this.stationAccessScope.resolveFromContextOrEmpty(organizationId, scope);
    const station = await this.stationAccessScope.requireReadableStation(access, stationId, {
      select: {
        managerName: true,
        phone: true,
        email: true,
      },
    });

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
    const access = this.stationAccessScope.resolveFromContextOrEmpty(organizationId, scope);
    await this.stationAccessScope.requireReadableStation(access, stationId, {
      select: { id: true },
    });

    const entries = await this.prisma.activityLog.findMany({
      where: this.stationAccessScope.buildStationActivityWhere(access, stationId),
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
