import { Injectable, BadRequestException, NotFoundException, Logger, ConflictException } from '@nestjs/common';
import { BookingStatus, Prisma, Station, StationCoordinatesSource, StationStatus, StationType, VehicleStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { StationValidationService } from './station-validation.service';
import {
  STATION_STATUS_LABELS,
  STATION_TYPE_LABELS,
  StationOverviewStatsDto,
  SELECTABLE_STATION_STATUSES,
} from './station.types';
import {
  stationOpeningHoursIsMissing,
  normalizeStationOpeningHoursForRead,
  STATION_OPENING_HOURS_CONTRACT_VERSION,
  getStationOpeningHoursContractMetadataForApi,
} from '@shared/stations/station-opening-hours.validation';
import { CreateStationDto } from './dto/create-station.dto';
import {
  validateStationCreatePayload,
} from './station-create-validation.util';
import {
  assertGenericStationUpdateAllowed,
  buildStationPatchWriteData,
  evaluateStationUpdatePayload,
  type StationUpdatePayload,
} from './station-update-validation.util';
import { UpdateStationDto } from './dto/update-station.dto';
import { ListStationsQueryDto } from './dto/list-stations-query.dto';
import { mapboxAccessToken, parseMapboxForwardGeocodeFeature, resolveGeocodeCountryFilter } from './station-geocode.util';
import {
  normalizeGeofenceRadius,
  resolveStationCoordinatesProvenance,
  stationHasMissingCoordinates,
} from './station-location-masterdata.util';
import type { StationScopeContext } from '@shared/stations/station-scope.types';
import type { StationAccessScope } from '@shared/stations/station-access-scope.types';
import { projectVehicleRuntimeFlags } from '@shared/vehicle-runtime-state/vehicle-runtime-state.resolver';
import { StationVehicleRuntimeLoader } from './station-vehicle-runtime.loader';
import {
  assertStationPositionVersionMatches,
  assertStationUpdatedAtMatches,
  buildStationPositionVersionConflictIssue,
} from '@shared/stations/station-optimistic-concurrency.util';
import { StationConcurrencyErrorCode } from '@shared/stations/station-optimistic-concurrency.constants';
import { StationAccessScopeService } from '@shared/stations/station-access-scope.service';
import {
  evaluateStationGeofenceCapability,
  type StationGeofenceCapabilityResult,
} from '@shared/stations/station-geofence-capability.policy';
import type { StationOperationsDto } from '@shared/stations/station-operations.resolver';
import { StationOperationsService } from './station-operations.service';
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
import { RestoreStationDto } from './dto/restore-station.dto';
import { throwStationDeleteDeprecated } from './station-delete-deprecation.util';
import { lockOrganizationPrimarySlot } from './station-primary-lock.util';
import {
  buildStationSetPrimaryCommandAudit,
  buildStationSetPrimaryConflictIssue,
  evaluateStationSetPrimaryCommand,
  isStationPrimaryUniqueViolation,
} from './station-set-primary-command.util';
import {
  StationSetPrimaryCommandName,
  StationSetPrimaryCommandOutcome,
  type StationSetPrimaryCommandResult,
  type StationSetPrimaryPreflightSnapshot,
} from './station-set-primary-command.types';
import {
  buildStationRestoreCommandAudit,
  evaluateStationRestoreCommand,
} from './station-restore-command.util';
import {
  StationRestoreCommandName,
  StationRestoreCommandOutcome,
  type StationRestoreCommandOptions,
  type StationRestoreCommandResult,
} from './station-restore-command.types';
import {
  evaluateStationRestorePreview,
  parseArchivedCapabilitiesSnapshot,
} from './station-restore-preview.util';
import type { StationRestorePreviewResult } from './station-restore-preview.types';
import {
  buildStationTeamMemberDisplayName,
  formatStationTeamMemberScope,
  membershipMatchesStation,
} from '@shared/stations/station-team-read-model.util';
import { mapStationActivityEntry } from '@shared/stations/station-activity-read-model.util';
import { isStationReadableInAccessScope } from '@shared/stations/station-access-scope.util';
import {
  buildVehicleChangeHomeStationCommandAudit,
  buildVehicleChangeHomeStationVersionConflictIssue,
  evaluateChangeVehicleHomeStationCommand,
} from './vehicle-change-home-station-command.util';
import {
  VehicleChangeHomeStationCommandName,
  VehicleChangeHomeStationCommandOutcome,
  type VehicleChangeHomeStationCommandResult,
} from './vehicle-change-home-station-command.types';
import {
  buildVehicleCorrectCurrentStationCommandAudit,
  buildVehicleCorrectCurrentStationVersionConflictIssue,
  evaluateCorrectVehicleCurrentStationCommand,
  isSameCurrentStationAssignment,
} from './vehicle-correct-current-station-command.util';
import {
  VehicleCorrectCurrentStationCommandIssueCode,
  VehicleCorrectCurrentStationCommandName,
  VehicleCorrectCurrentStationCommandOutcome,
  type VehicleCorrectCurrentStationCommandResult,
} from './vehicle-correct-current-station-command.types';
import {
  evaluateSetStationVehiclesPolicy,
  type StationSetVehiclesListCompleteness,
} from '@shared/stations/station-set-vehicles.policy';
import {
  buildStationSetVehiclesDeprecationMetadata,
  isStationSetVehiclesDisabled,
  throwStationSetVehiclesDisabled,
  throwStationSetVehiclesPolicyBlocked,
} from './station-set-vehicles-deprecation.util';
import { StationDomainAuditService } from './station-domain-audit.service';
import { StationDomainAuditAction } from '@shared/stations/station-domain-audit.constants';

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
  coordinatesSource: StationCoordinatesSource | null;
  coordinatesConfirmedAt: Date | null;
  hasMissingCoordinates: boolean;
  geofenceCapability: StationGeofenceCapabilityResult;
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
  openingHoursContractVersion: number;
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

// Result returned after a bulk vehicle-assignment write.
// @deprecated SET semantics removed — attach-only, no implicit detach.
export interface StationVehicleAssignmentResult {
  stationId: string;
  totalAssigned: number;
  newlyAttached: number;
  detached: number;
  movedFromOtherStations: number;
  deprecation: import('./station-set-vehicles-deprecation.util').StationSetVehiclesDeprecationMetadata;
}

export type { StationOperationsDto } from '@shared/stations/station-operations.resolver';

export interface StationTeamMemberDto {
  membershipId: string;
  userId: string;
  displayName: string;
  /** Archive-preview compatibility alias for displayName. */
  name: string;
  role: string;
  roleLabel: string | null;
  scopeMode: 'ALL_STATIONS' | 'ASSIGNED_STATIONS' | 'THIS_STATION' | 'NO_STATIONS';
  scopeLabel: string;
  assignedStationCount: number;
}

export interface StationTeamDto {
  /** True when membership-based station scope wiring is active for team listing. */
  wired: boolean;
  managerName: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  staff: StationTeamMemberDto[];
  totalCount: number;
}

export interface StationActivityQuery {
  action?: string;
  search?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export interface StationActivityEntryDto {
  id: string;
  action: string;
  actionLabel: string;
  description: string | null;
  changeSummary: string | null;
  actor: {
    id: string | null;
    displayName: string;
  };
  fromLabel: string | null;
  toLabel: string | null;
  createdAt: string;
}

export interface StationActivityReadModel {
  entries: StationActivityEntryDto[];
  filters: {
    actions: string[];
  };
}

@Injectable()
export class StationsService {
  private readonly logger = new Logger(StationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stationValidation: StationValidationService,
    private readonly stationAccessScope: StationAccessScopeService,
    private readonly stationOperations: StationOperationsService,
    private readonly stationVehicleRuntimeLoader: StationVehicleRuntimeLoader,
    private readonly stationDomainAudit: StationDomainAuditService,
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

  getOpeningHoursContract() {
    return getStationOpeningHoursContractMetadataForApi();
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

  async create(
    organizationId: string,
    payload: StationUpsertPayload,
    performedByUserId?: string | null,
  ): Promise<StationDto> {
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
    if (explicitLat && explicitLng) {
      Object.assign(
        writable,
        resolveStationCoordinatesProvenance({ explicitCoordinates: true }),
      );
    } else if (!(explicitLat && explicitLng)) {
      const coords = await this.geocodeAddress({
        address: payload.address ?? null,
        city: payload.city ?? null,
        postalCode: payload.postalCode ?? null,
        country: payload.country ?? null,
      });
      if (coords) {
        if (!explicitLat) writable.latitude = coords.latitude;
        if (!explicitLng) writable.longitude = coords.longitude;
        Object.assign(
          writable,
          resolveStationCoordinatesProvenance({ geocodedCoordinates: true }),
        );
      }
    }

    const station = await this.prisma.$transaction(async (tx) => {
      if (payload.isPrimary) {
        await lockOrganizationPrimarySlot(tx, organizationId);
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
    void this.stationDomainAudit.recordStationCreated({
      organizationId,
      stationId: station.id,
      actorUserId: performedByUserId,
      stationName: station.name,
      performedAt: station.createdAt.toISOString(),
    });
    return this.toDto(station, station._count.vehiclesHome);
  }

  async update(
    organizationId: string,
    id: string,
    payload: StationPatchPayload,
    performedByUserId?: string | null,
  ): Promise<StationDto> {
    const { expectedUpdatedAt, ...patchPayload } = payload;
    const existing = await this.prisma.station.findFirstOrThrow({
      where: { id, organizationId },
    });

    if (expectedUpdatedAt !== undefined) {
      assertStationUpdatedAtMatches({
        expectedUpdatedAt,
        actualUpdatedAt: existing.updatedAt,
        resourceLabel: 'Station master data',
      });
    }

    assertGenericStationUpdateAllowed(patchPayload as StationUpdatePayload, {
      status: existing.status,
      pickupEnabled: existing.pickupEnabled,
      returnEnabled: existing.returnEnabled,
    });

    const updateEvaluation = evaluateStationUpdatePayload(patchPayload as StationUpdatePayload, {
      status: existing.status,
      pickupEnabled: existing.pickupEnabled,
      returnEnabled: existing.returnEnabled,
    });

    const writable = buildStationPatchWriteData(patchPayload as StationUpdatePayload);
    if (patchPayload.radiusMeters !== undefined) {
      const r = patchPayload.radiusMeters;
      if (r === null) {
        writable.radiusMeters = null;
      } else {
        writable.radiusMeters = normalizeGeofenceRadius(r);
      }
    }

    if (payload.name !== undefined) {
      const trimmed = patchPayload.name?.trim();
      if (!trimmed) throw new BadRequestException('Station name cannot be empty');
      writable.name = trimmed;
    }

    if (patchPayload.code) {
      const normalizedCode = patchPayload.code.trim();
      const dup = await this.prisma.station.findFirst({
        where: { organizationId, code: normalizedCode, id: { not: id } },
      });
      if (dup) throw new ConflictException(`Station code "${normalizedCode}" already exists`);
      writable.code = normalizedCode;
    }

    const wantsLatChange = patchPayload.latitude !== undefined;
    const wantsLngChange = patchPayload.longitude !== undefined;
    if (wantsLatChange || wantsLngChange) {
      const nextLat = wantsLatChange ? patchPayload.latitude : existing.latitude;
      const nextLng = wantsLngChange ? patchPayload.longitude : existing.longitude;
      if (nextLat == null && nextLng == null) {
        Object.assign(
          writable,
          resolveStationCoordinatesProvenance({ coordinatesCleared: true }),
        );
      } else if (wantsLatChange && wantsLngChange && nextLat != null && nextLng != null) {
        Object.assign(
          writable,
          resolveStationCoordinatesProvenance({ explicitCoordinates: true }),
        );
      }
    }

    const addressFieldsTouched =
      patchPayload.address !== undefined ||
      patchPayload.city !== undefined ||
      patchPayload.postalCode !== undefined ||
      patchPayload.country !== undefined;
    if (!wantsLatChange && !wantsLngChange && addressFieldsTouched) {
      const coords = await this.geocodeAddress({
        address: patchPayload.address !== undefined ? patchPayload.address : existing.address,
        city: patchPayload.city !== undefined ? patchPayload.city : existing.city,
        postalCode:
          patchPayload.postalCode !== undefined ? patchPayload.postalCode : existing.postalCode,
        country: patchPayload.country !== undefined ? patchPayload.country : existing.country,
      });
      if (coords) {
        writable.latitude = coords.latitude;
        writable.longitude = coords.longitude;
        Object.assign(
          writable,
          resolveStationCoordinatesProvenance({ geocodedCoordinates: true }),
        );
      }
    }

    if (expectedUpdatedAt !== undefined) {
      const updated = await this.prisma.station.updateMany({
        where: { id, organizationId, updatedAt: existing.updatedAt },
        data: writable,
      });
      if (updated.count === 0) {
        throw new ConflictException({
          message: 'Station master data was updated by another request. Reload and retry.',
          code: StationConcurrencyErrorCode.STATION_UPDATED_AT_CONFLICT,
        });
      }
      const station = await this.prisma.station.findFirstOrThrow({
        where: { id, organizationId },
        include: this.stationIncludeCount(),
      });
      void this.stationDomainAudit.recordStationUpdated({
        organizationId,
        stationId: id,
        actorUserId: performedByUserId,
        auditHints: updateEvaluation.auditHints,
        performedAt: station.updatedAt.toISOString(),
      });
      return this.toDto(station, station._count.vehiclesHome);
    }

    const station = await this.prisma.station.update({
      where: { id },
      data: writable,
      include: this.stationIncludeCount(),
    });
    void this.stationDomainAudit.recordStationUpdated({
      organizationId,
      stationId: id,
      actorUserId: performedByUserId,
      auditHints: updateEvaluation.auditHints,
      performedAt: station.updatedAt.toISOString(),
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

    void this.stationDomainAudit.record({
      organizationId: station.organizationId,
      stationId: station.id,
      auditAction: StationDomainAuditAction.ARCHIVED,
      actorUserId: performedByUserId,
      from: station.status,
      to: 'ARCHIVED',
      reason: options.reason ?? null,
      command: StationArchiveCommandName.ARCHIVE,
      performedAt: audit.performedAt,
      meta: {
        successorPrimaryStationId: successorId,
        futurePickupCount: preflight.counts.futurePickupBookings,
        futureReturnCount: preflight.counts.futureReturnBookings,
      },
    });

    if (station.isPrimary && successorId) {
      void this.stationDomainAudit.record({
        organizationId: station.organizationId,
        stationId: successorId,
        auditAction: StationDomainAuditAction.PRIMARY_CHANGED,
        actorUserId: performedByUserId,
        from: false,
        to: true,
        reason: options.reason ?? null,
        command: StationArchiveCommandName.ARCHIVE,
        performedAt: audit.performedAt,
        meta: { trigger: 'ARCHIVE_SUCCESSOR' },
      });
    }

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
    performedByUserId?: string | null,
  ): Promise<StationLifecycleCommandResult<StationDto>> {
    const result = await this.runLifecycleStatusCommand(
      organizationId,
      id,
      StationLifecycleCommandName.ACTIVATE,
      undefined,
      performedByUserId,
    );
    this.persistLifecycleDomainAudit(result, performedByUserId);
    return result;
  }

  async deactivateStation(
    organizationId: string,
    id: string,
    performedByUserId?: string | null,
  ): Promise<StationLifecycleCommandResult<StationDto>> {
    const preflight = await this.countFutureStationBookings(organizationId, id);
    const result = await this.runLifecycleStatusCommand(
      organizationId,
      id,
      StationLifecycleCommandName.DEACTIVATE,
      preflight,
      performedByUserId,
    );
    this.persistLifecycleDomainAudit(result, performedByUserId);
    return result;
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
    performedByUserId?: string | null,
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

  async restore(
    organizationId: string,
    id: string,
    options: StationRestoreCommandOptions | RestoreStationDto,
    scope?: StationScopeContext,
    performedByUserId?: string | null,
  ): Promise<StationRestoreCommandResult<StationDto>> {
    return this.restoreStation(organizationId, id, options, scope, performedByUserId);
  }

  async restoreStation(
    organizationId: string,
    id: string,
    options: StationRestoreCommandOptions | RestoreStationDto,
    scope?: StationScopeContext,
    performedByUserId?: string | null,
  ): Promise<StationRestoreCommandResult<StationDto>> {
    const access = this.stationAccessScope.resolveFromContextOrEmpty(organizationId, scope);
    const station = (await this.stationAccessScope.requireReadableStation(access, id, {
      include: this.stationIncludeCount(),
    })) as Prisma.StationGetPayload<{ include: ReturnType<StationsService['stationIncludeCount']> }>;
    const vehicleHomeCount = station._count.vehiclesHome;

    const preflight = await this.loadStationRestorePreflight(access, station.id);
    const archivedSnapshot = parseArchivedCapabilitiesSnapshot(
      station.archivedCapabilitiesSnapshot,
    );

    const preview = evaluateStationRestorePreview({
      station: {
        id: station.id,
        organizationId: station.organizationId,
        status: station.status,
        isPrimary: station.isPrimary,
        pickupEnabled: station.pickupEnabled,
        returnEnabled: station.returnEnabled,
        afterHoursReturnEnabled: station.afterHoursReturnEnabled,
        keyBoxAvailable: station.keyBoxAvailable,
        archivedAt: station.archivedAt,
        openingHours: station.openingHours,
      },
      archivedCapabilitiesSnapshot: archivedSnapshot,
      counts: preflight.counts,
    });

    const evaluation = evaluateStationRestoreCommand({
      preview,
      options,
      stationStatus: station.status,
    });

    const appliedCapabilities: StationRestoreCommandOptions = {
      pickupEnabled: options.pickupEnabled,
      returnEnabled: options.returnEnabled,
      afterHoursReturnEnabled:
        options.afterHoursReturnEnabled ??
        preview.suggestedCapabilities.afterHoursReturnEnabled,
      keyBoxAvailable:
        options.keyBoxAvailable ?? preview.suggestedCapabilities.keyBoxAvailable,
    };

    const auditBase = {
      stationId: station.id,
      organizationId: station.organizationId,
      previousStatus: station.status,
      nextStatus: 'ACTIVE' as const,
      performedByUserId: performedByUserId ?? null,
      idempotent: evaluation.idempotent,
      appliedCapabilities,
      suggestedCapabilities: preview.suggestedCapabilities,
    };

    if (evaluation.idempotent) {
      return {
        outcome: StationRestoreCommandOutcome.IDEMPOTENT,
        command: StationRestoreCommandName.RESTORE,
        allowed: true,
        station: this.toDto(station, vehicleHomeCount),
        blockingReasons: [],
        warnings: evaluation.warnings,
        requiredActions: evaluation.requiredActions,
        audit: buildStationRestoreCommandAudit(auditBase),
      };
    }

    if (!evaluation.allowed) {
      throw new BadRequestException({
        message:
          evaluation.blockingReasons[0]?.message ??
          'Restore is not allowed for this station',
        code: 'RESTORE_BLOCKED',
        outcome: StationRestoreCommandOutcome.BLOCKED,
        command: StationRestoreCommandName.RESTORE,
        blockingReasons: evaluation.blockingReasons,
        warnings: evaluation.warnings,
        requiredActions: evaluation.requiredActions,
        audit: buildStationRestoreCommandAudit(auditBase),
      });
    }

    const restoredAt = new Date();
    const existingLifecycle =
      station.lifecycleMetadata &&
      typeof station.lifecycleMetadata === 'object' &&
      !Array.isArray(station.lifecycleMetadata)
        ? (station.lifecycleMetadata as Record<string, unknown>)
        : {};

    const updated = (await this.prisma.$transaction(async (tx) =>
      tx.station.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          archivedAt: null,
          isPrimary: false,
          pickupEnabled: appliedCapabilities.pickupEnabled,
          returnEnabled: appliedCapabilities.returnEnabled,
          afterHoursReturnEnabled: appliedCapabilities.afterHoursReturnEnabled ?? false,
          keyBoxAvailable: appliedCapabilities.keyBoxAvailable ?? false,
          archivedCapabilitiesSnapshot: Prisma.JsonNull,
          lifecycleMetadata: {
            ...existingLifecycle,
            lastRestoredAt: restoredAt.toISOString(),
            lastRestoredByUserId: performedByUserId ?? null,
            restoredFromSnapshot: archivedSnapshot,
            restoredCapabilities: appliedCapabilities,
          } as unknown as Prisma.InputJsonValue,
        },
        include: this.stationIncludeCount(),
      }),
    )) as Prisma.StationGetPayload<{ include: ReturnType<StationsService['stationIncludeCount']> }>;

    void this.stationDomainAudit.record({
      organizationId: station.organizationId,
      stationId: station.id,
      auditAction: StationDomainAuditAction.RESTORED,
      actorUserId: performedByUserId,
      from: station.status,
      to: 'ACTIVE',
      command: StationRestoreCommandName.RESTORE,
      performedAt: restoredAt.toISOString(),
      meta: { appliedCapabilities },
    });

    return {
      outcome: StationRestoreCommandOutcome.APPLIED,
      command: StationRestoreCommandName.RESTORE,
      allowed: true,
      station: this.toDto(updated, updated._count.vehiclesHome),
      blockingReasons: [],
      warnings: evaluation.warnings,
      requiredActions: evaluation.requiredActions,
      audit: buildStationRestoreCommandAudit(auditBase),
    };
  }

  async getStationRestorePreview(
    organizationId: string,
    stationId: string,
    scope?: StationScopeContext,
  ): Promise<StationRestorePreviewResult> {
    const access = this.stationAccessScope.resolveFromContextOrEmpty(organizationId, scope);
    const station = await this.stationAccessScope.requireReadableStation(access, stationId, {
      select: {
        id: true,
        organizationId: true,
        status: true,
        isPrimary: true,
        archivedAt: true,
        pickupEnabled: true,
        returnEnabled: true,
        afterHoursReturnEnabled: true,
        keyBoxAvailable: true,
        openingHours: true,
        archivedCapabilitiesSnapshot: true,
      },
    });

    const preflight = await this.loadStationRestorePreflight(access, stationId);
    const archivedSnapshot = parseArchivedCapabilitiesSnapshot(
      station.archivedCapabilitiesSnapshot,
    );

    const preview = evaluateStationRestorePreview({
      station: {
        id: station.id,
        organizationId: station.organizationId,
        status: station.status,
        isPrimary: station.isPrimary,
        pickupEnabled: station.pickupEnabled,
        returnEnabled: station.returnEnabled,
        afterHoursReturnEnabled: station.afterHoursReturnEnabled,
        keyBoxAvailable: station.keyBoxAvailable,
        archivedAt: station.archivedAt,
        openingHours: station.openingHours,
      },
      archivedCapabilitiesSnapshot: archivedSnapshot,
      counts: preflight.counts,
    });

    return {
      stationId: station.id,
      organizationId: station.organizationId,
      status: station.status,
      alreadyActive: station.status === 'ACTIVE',
      openingHours: station.openingHours,
      ...preview,
    };
  }

  private async loadStationRestorePreflight(
    access: StationAccessScope,
    stationId: string,
  ) {
    const station = await this.stationAccessScope.requireReadableStation(access, stationId, {
      select: { id: true, organizationId: true },
    });

    const homeWhere = this.buildArchivePreviewVehicleWhere(access, stationId, 'homeStationId');
    const presentWhere = this.buildArchivePreviewVehicleWhere(access, stationId, 'currentStationId');
    const expectedWhere = this.buildArchivePreviewVehicleWhere(access, stationId, 'expectedStationId');
    const stationBookingWhere = this.stationAccessScope.buildStationBookingsWhere(access, stationId);

    const [homeVehicles, presentVehicles, expectedVehicles, historicalBookings, scopedStaff] =
      await Promise.all([
        this.prisma.vehicle.count({ where: homeWhere }),
        this.prisma.vehicle.count({ where: presentWhere }),
        this.prisma.vehicle.count({ where: expectedWhere }),
        this.prisma.booking.count({ where: stationBookingWhere }),
        this.loadStationScopedStaff(station.organizationId, stationId, 1),
      ]);

    return {
      counts: {
        homeVehicles,
        presentVehicles,
        expectedVehicles,
        historicalBookings,
        scopedStaff: scopedStaff.totalCount,
      },
    };
  }

  async setPrimaryStation(
    organizationId: string,
    id: string,
    performedByUserId?: string | null,
    options?: { expectedUpdatedAt?: string },
  ): Promise<StationSetPrimaryCommandResult<StationDto>> {
    const station = await this.prisma.station.findFirst({
      where: { id, organizationId },
      include: this.stationIncludeCount(),
    });
    if (!station) throw new NotFoundException(`Station ${id} not found`);

    if (options?.expectedUpdatedAt !== undefined) {
      assertStationUpdatedAtMatches({
        expectedUpdatedAt: options.expectedUpdatedAt,
        actualUpdatedAt: station.updatedAt,
        resourceLabel: 'Primary station change',
      });
    }

    const stationUpdatedAtForLock = station.updatedAt;

    const preflight = await this.loadSetPrimaryPreflight(organizationId, station.id);
    const evaluation = evaluateStationSetPrimaryCommand({
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

    const auditBase = {
      stationId: station.id,
      organizationId,
      previousIsPrimary: station.isPrimary,
      nextIsPrimary: true,
      previousStatus: station.status,
      nextStatus: 'ACTIVE' as const,
      performedByUserId: performedByUserId ?? null,
      idempotent: evaluation.idempotent,
      demotedPrimaryStationIds: preflight.otherPrimaryStationIds,
    };

    if (evaluation.idempotent) {
      return {
        outcome: StationSetPrimaryCommandOutcome.IDEMPOTENT,
        command: StationSetPrimaryCommandName.SET_PRIMARY,
        allowed: true,
        station: this.toDto(station, station._count.vehiclesHome),
        blockingReasons: [],
        warnings: evaluation.warnings,
        requiredActions: evaluation.requiredActions,
        audit: buildStationSetPrimaryCommandAudit(auditBase),
      };
    }

    if (!evaluation.allowed) {
      throw new BadRequestException({
        message:
          evaluation.blockingReasons[0]?.message ??
          'SetPrimaryStation is not allowed for this station',
        code: 'SET_PRIMARY_BLOCKED',
        outcome: StationSetPrimaryCommandOutcome.BLOCKED,
        command: StationSetPrimaryCommandName.SET_PRIMARY,
        blockingReasons: evaluation.blockingReasons,
        warnings: evaluation.warnings,
        requiredActions: evaluation.requiredActions,
        audit: buildStationSetPrimaryCommandAudit(auditBase),
      });
    }

    try {
      const { updated, demotedPrimaryStationIds } = await this.prisma.$transaction(async (tx) => {
        await lockOrganizationPrimarySlot(tx, organizationId);

        const demoted = await tx.station.findMany({
          where: {
            organizationId,
            isPrimary: true,
            id: { not: station.id },
            status: { not: 'ARCHIVED' },
          },
          select: { id: true },
        });

        if (demoted.length > 0) {
          await tx.station.updateMany({
            where: {
              organizationId,
              isPrimary: true,
              id: { not: station.id },
            },
            data: { isPrimary: false },
          });
        }

        const updatedResult = await tx.station.updateMany({
          where: { id, organizationId, updatedAt: stationUpdatedAtForLock },
          data: { isPrimary: true, status: 'ACTIVE' },
        });
        if (updatedResult.count === 0) {
          throw new ConflictException({
            message: 'Primary station change conflict. Reload and retry.',
            code: StationConcurrencyErrorCode.STATION_UPDATED_AT_CONFLICT,
          });
        }

        const updatedStation = await tx.station.findFirstOrThrow({
          where: { id, organizationId },
          include: this.stationIncludeCount(),
        });

        return {
          updated: updatedStation,
          demotedPrimaryStationIds: demoted.map((row) => row.id),
        };
      });

      const audit = buildStationSetPrimaryCommandAudit({
        ...auditBase,
        demotedPrimaryStationIds,
      });

      void this.stationDomainAudit.record({
        organizationId,
        stationId: station.id,
        auditAction: StationDomainAuditAction.PRIMARY_CHANGED,
        actorUserId: performedByUserId,
        from: station.isPrimary,
        to: true,
        command: StationSetPrimaryCommandName.SET_PRIMARY,
        performedAt: audit.performedAt,
      });

      for (const demotedStationId of demotedPrimaryStationIds) {
        void this.stationDomainAudit.record({
          organizationId,
          stationId: demotedStationId,
          auditAction: StationDomainAuditAction.PRIMARY_CHANGED,
          actorUserId: performedByUserId,
          from: true,
          to: false,
          command: StationSetPrimaryCommandName.SET_PRIMARY,
          performedAt: audit.performedAt,
          meta: { promotedStationId: station.id },
        });
      }

      return {
        outcome: StationSetPrimaryCommandOutcome.APPLIED,
        command: StationSetPrimaryCommandName.SET_PRIMARY,
        allowed: true,
        station: this.toDto(updated, updated._count.vehiclesHome),
        blockingReasons: [],
        warnings: evaluation.warnings,
        requiredActions: evaluation.requiredActions,
        audit: buildStationSetPrimaryCommandAudit({
          ...auditBase,
          demotedPrimaryStationIds,
        }),
      };
    } catch (error) {
      if (isStationPrimaryUniqueViolation(error)) {
        const conflict = buildStationSetPrimaryConflictIssue();
        throw new ConflictException({
          message: conflict.message,
          code: conflict.code,
          outcome: StationSetPrimaryCommandOutcome.BLOCKED,
          command: StationSetPrimaryCommandName.SET_PRIMARY,
          blockingReasons: [conflict],
          audit: buildStationSetPrimaryCommandAudit(auditBase),
        });
      }
      throw error;
    }
  }

  private async loadSetPrimaryPreflight(
    organizationId: string,
    stationId: string,
  ): Promise<StationSetPrimaryPreflightSnapshot> {
    const [station, primaries] = await Promise.all([
      this.prisma.station.findFirst({
        where: { id: stationId, organizationId },
        select: { id: true, organizationId: true, status: true, isPrimary: true },
      }),
      this.prisma.station.findMany({
        where: {
          organizationId,
          isPrimary: true,
          status: { not: 'ARCHIVED' },
        },
        select: { id: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    ]);

    if (!station) {
      throw new NotFoundException(`Station ${stationId} not found`);
    }

    const otherPrimaryStationIds = primaries
      .map((row) => row.id)
      .filter((rowId) => rowId !== stationId);

    return {
      stationId: station.id,
      organizationId: station.organizationId,
      status: station.status,
      isPrimary: station.isPrimary,
      nonArchivedPrimaryCount: primaries.length,
      otherPrimaryStationIds,
    };
  }

  /**
   * @deprecated Hard delete is not a product operation. Returns HTTP 410 with
   * `STATION_DELETE_DEPRECATED` — use `archiveStation()` instead.
   * Physical deletes remain limited to internal platform-admin prune tooling.
   */
  async delete(organizationId: string, id: string): Promise<never> {
    const station = await this.prisma.station.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!station) throw new NotFoundException(`Station ${id} not found`);
    throwStationDeleteDeprecated();
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

    const onSiteVehicles = await this.prisma.vehicle.findMany({
      where: {
        ...stationVehicleWhere,
        currentStationId: stationId,
      },
      select: {
        id: true,
        homeStationId: true,
        currentStationId: true,
        expectedStationId: true,
        status: true,
        cleaningStatus: true,
        latestState: {
          select: {
            lastSeenAt: true,
            odometerKm: true,
            speedKmh: true,
            isIgnitionOn: true,
          },
        },
      },
    });

    const vehiclesWithHealthWarnings = await (async () => {
      if (onSiteVehicles.length === 0) return 0;
      const runtimeSnapshots = await this.stationVehicleRuntimeLoader.loadRuntimeSnapshots(
        organizationId,
        onSiteVehicles,
      );
      return runtimeSnapshots.reduce((count, snapshot) => {
        const flags = projectVehicleRuntimeFlags(snapshot, {
          evaluatedAt: new Date().toISOString(),
        });
        return flags.known && flags.hasHealthWarning ? count + 1 : count;
      }, 0);
    })();

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
      vehiclesWithHealthWarnings,
      todayPickups,
      todayReturns,
      upcomingPickups,
      upcomingReturns,
      openTasks,
      capacity,
      capacityUsagePercent,
      hasMissingCoordinates: station.latitude == null || station.longitude == null,
      hasMissingOpeningHours: stationOpeningHoursIsMissing(station.openingHours),
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
    options: { at?: string } = {},
  ): Promise<StationOperationsDto> {
    return this.stationOperations.resolveForStation(organizationId, stationId, scope, options);
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
        organizationRole: {
          select: { name: true },
        },
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

    const matched = memberships.filter((membership) =>
      membershipMatchesStation(membership, stationId),
    );

    const items = matched.slice(0, limit).map((membership) => {
      const scope = formatStationTeamMemberScope(membership, stationId);
      return {
        membershipId: membership.id,
        userId: membership.user.id,
        displayName: buildStationTeamMemberDisplayName(membership.user),
        name: buildStationTeamMemberDisplayName(membership.user),
        role: membership.role,
        roleLabel: membership.roleLabel ?? membership.organizationRole?.name ?? null,
        scopeMode: scope.scopeMode,
        scopeLabel: scope.scopeLabel,
        assignedStationCount: scope.assignedStationCount,
      };
    });

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

    const staffResult = await this.loadStationScopedStaff(organizationId, stationId, 100);

    return {
      wired: true,
      managerName: station.managerName,
      contactPerson: station.managerName,
      phone: station.phone,
      email: station.email,
      staff: staffResult.items,
      totalCount: staffResult.totalCount,
    };
  }

  async getStationActivity(
    organizationId: string,
    stationId: string,
    scope?: StationScopeContext,
    query: StationActivityQuery = {},
  ): Promise<StationActivityReadModel> {
    const access = this.stationAccessScope.resolveFromContextOrEmpty(organizationId, scope);
    await this.stationAccessScope.requireReadableStation(access, stationId, {
      select: { id: true },
    });

    const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
    const where = this.stationAccessScope.buildStationActivityWhere(access, stationId);
    const createdAt: { gte?: Date; lte?: Date } = {};
    if (query.from) {
      const parsed = new Date(query.from);
      if (!Number.isNaN(parsed.getTime())) createdAt.gte = parsed;
    }
    if (query.to) {
      const parsed = new Date(query.to);
      if (!Number.isNaN(parsed.getTime())) createdAt.lte = parsed;
    }

    const entries = await this.prisma.activityLog.findMany({
      where: {
        ...where,
        ...(query.action ? { action: query.action as never } : {}),
        ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
        ...(query.search?.trim()
          ? {
              OR: [
                { description: { contains: query.search.trim(), mode: 'insensitive' } },
                { changeSummary: { contains: query.search.trim(), mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    const mapped = entries.map((entry) => mapStationActivityEntry(entry));
    const actions = Array.from(new Set(mapped.map((entry) => entry.action))).sort();

    return {
      entries: mapped,
      filters: { actions },
    };
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
    expectedVersion?: number,
  ) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: {
        id: true,
        homeStationId: true,
        currentStationId: true,
        expectedStationId: true,
        stationPositionVersion: true,
      },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    if (expectedVersion !== undefined) {
      assertStationPositionVersionMatches({
        expectedVersion,
        actualVersion: vehicle.stationPositionVersion,
        resourceLabel: 'Vehicle station assignment',
      });
    }

    await this.stationValidation.assertVehicleStationAssignment(
      organizationId,
      vehicleId,
      stationId,
      target,
    );

    const versionForUpdate = expectedVersion ?? vehicle.stationPositionVersion;
    const updateResult = await this.prisma.vehicle.updateMany({
      where: {
        id: vehicleId,
        organizationId,
        stationPositionVersion: versionForUpdate,
      },
      data: {
        homeStationId: target === 'home' ? stationId : undefined,
        currentStationId: target === 'home' || target === 'current' ? stationId : undefined,
        expectedStationId: target === 'expected' ? stationId : undefined,
        stationPositionVersion: { increment: 1 },
      },
    });

    if (updateResult.count === 0) {
      throw new ConflictException({
        message: buildStationPositionVersionConflictIssue().message,
        code: StationConcurrencyErrorCode.STATION_POSITION_VERSION_CONFLICT,
      });
    }

    return this.prisma.vehicle.findFirstOrThrow({
      where: { id: vehicleId, organizationId },
      select: {
        id: true,
        homeStationId: true,
        currentStationId: true,
        expectedStationId: true,
        stationPositionVersion: true,
      },
    });
  }

  async updateVehicleCurrentStation(
    organizationId: string,
    vehicleId: string,
    currentStationId: string | null,
    expectedStationId?: string | null,
    expectedVersion?: number,
  ) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: {
        id: true,
        stationPositionVersion: true,
      },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    if (expectedVersion !== undefined) {
      assertStationPositionVersionMatches({
        expectedVersion,
        actualVersion: vehicle.stationPositionVersion,
        resourceLabel: 'Vehicle current location correction',
      });
    }

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

    const versionForUpdate = expectedVersion ?? vehicle.stationPositionVersion;
    const updateResult = await this.prisma.vehicle.updateMany({
      where: {
        id: vehicleId,
        organizationId,
        stationPositionVersion: versionForUpdate,
      },
      data: {
        currentStationId,
        ...(expectedStationId !== undefined ? { expectedStationId } : {}),
        stationPositionVersion: { increment: 1 },
      },
    });

    if (updateResult.count === 0) {
      throw new ConflictException({
        message: buildStationPositionVersionConflictIssue().message,
        code: StationConcurrencyErrorCode.STATION_POSITION_VERSION_CONFLICT,
      });
    }

    return this.prisma.vehicle.findFirstOrThrow({
      where: { id: vehicleId, organizationId },
      select: {
        id: true,
        homeStationId: true,
        currentStationId: true,
        expectedStationId: true,
        stationPositionVersion: true,
      },
    });
  }

  async changeVehicleHomeStation(
    organizationId: string,
    input: {
      vehicleId: string;
      newHomeStationId: string | null;
      expectedVersion: number;
      reason?: string | null;
    },
    performedByUserId?: string | null,
  ): Promise<VehicleChangeHomeStationCommandResult> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: input.vehicleId, organizationId },
      select: {
        id: true,
        homeStationId: true,
        currentStationId: true,
        expectedStationId: true,
        stationPositionVersion: true,
        status: true,
      },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    if (input.expectedVersion !== vehicle.stationPositionVersion) {
      throw new ConflictException({
        message: buildVehicleChangeHomeStationVersionConflictIssue().message,
        code: 'STATION_POSITION_VERSION_CONFLICT',
        outcome: VehicleChangeHomeStationCommandOutcome.BLOCKED,
        command: VehicleChangeHomeStationCommandName.CHANGE_HOME_STATION,
        blockingReasons: [buildVehicleChangeHomeStationVersionConflictIssue()],
        audit: buildVehicleChangeHomeStationCommandAudit({
          organizationId,
          vehicleId: vehicle.id,
          fromHomeStationId: vehicle.homeStationId,
          toHomeStationId: input.newHomeStationId,
          previousStationPositionVersion: vehicle.stationPositionVersion,
          nextStationPositionVersion: vehicle.stationPositionVersion,
          reason: input.reason,
          performedByUserId,
          idempotent: false,
        }),
      });
    }

    const evaluation = evaluateChangeVehicleHomeStationCommand({
      currentHomeStationId: vehicle.homeStationId,
      newHomeStationId: input.newHomeStationId,
      vehicleStatus: vehicle.status,
    });

    const auditBase = {
      organizationId,
      vehicleId: vehicle.id,
      fromHomeStationId: vehicle.homeStationId,
      toHomeStationId: input.newHomeStationId,
      previousStationPositionVersion: vehicle.stationPositionVersion,
      nextStationPositionVersion: vehicle.stationPositionVersion,
      reason: input.reason,
      performedByUserId,
      idempotent: evaluation.idempotent,
    };

    if (evaluation.idempotent) {
      return {
        outcome: VehicleChangeHomeStationCommandOutcome.IDEMPOTENT,
        command: VehicleChangeHomeStationCommandName.CHANGE_HOME_STATION,
        allowed: true,
        vehicle: {
          id: vehicle.id,
          homeStationId: vehicle.homeStationId,
          currentStationId: vehicle.currentStationId,
          expectedStationId: vehicle.expectedStationId,
          stationPositionVersion: vehicle.stationPositionVersion,
          status: vehicle.status,
        },
        blockingReasons: [],
        warnings: evaluation.warnings,
        audit: buildVehicleChangeHomeStationCommandAudit(auditBase),
      };
    }

    if (input.newHomeStationId) {
      await this.stationValidation.assertVehicleStationAssignment(
        organizationId,
        input.vehicleId,
        input.newHomeStationId,
        'home',
      );
    }

    const updateResult = await this.prisma.vehicle.updateMany({
      where: {
        id: vehicle.id,
        organizationId,
        stationPositionVersion: input.expectedVersion,
      },
      data: {
        homeStationId: input.newHomeStationId,
        stationPositionVersion: { increment: 1 },
      },
    });

    if (updateResult.count === 0) {
      throw new ConflictException({
        message: buildVehicleChangeHomeStationVersionConflictIssue().message,
        code: 'STATION_POSITION_VERSION_CONFLICT',
        outcome: VehicleChangeHomeStationCommandOutcome.BLOCKED,
        command: VehicleChangeHomeStationCommandName.CHANGE_HOME_STATION,
        blockingReasons: [buildVehicleChangeHomeStationVersionConflictIssue()],
        audit: buildVehicleChangeHomeStationCommandAudit(auditBase),
      });
    }

    const updated = await this.prisma.vehicle.findFirst({
      where: { id: vehicle.id, organizationId },
      select: {
        id: true,
        homeStationId: true,
        currentStationId: true,
        expectedStationId: true,
        stationPositionVersion: true,
        status: true,
      },
    });
    if (!updated) {
      throw new NotFoundException('Vehicle not found');
    }

    void this.stationDomainAudit.recordForStations(
      [vehicle.homeStationId, input.newHomeStationId],
      {
        organizationId,
        auditAction: StationDomainAuditAction.HOME_STATION_CHANGED,
        actorUserId: performedByUserId,
        vehicleId: vehicle.id,
        from: vehicle.homeStationId,
        to: input.newHomeStationId,
        reason: input.reason ?? null,
        command: VehicleChangeHomeStationCommandName.CHANGE_HOME_STATION,
        performedAt: new Date().toISOString(),
      },
    );

    return {
      outcome: VehicleChangeHomeStationCommandOutcome.APPLIED,
      command: VehicleChangeHomeStationCommandName.CHANGE_HOME_STATION,
      allowed: true,
      vehicle: updated,
      blockingReasons: [],
      warnings: evaluation.warnings,
      audit: buildVehicleChangeHomeStationCommandAudit({
        ...auditBase,
        nextStationPositionVersion: updated.stationPositionVersion,
        idempotent: false,
      }),
    };
  }

  async correctVehicleCurrentStation(
    organizationId: string,
    input: {
      vehicleId: string;
      currentStationId: string | null;
      source: 'MANUAL';
      reason: string;
      expectedVersion: number;
    },
    performedByUserId?: string | null,
  ): Promise<VehicleCorrectCurrentStationCommandResult> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: input.vehicleId, organizationId },
      select: {
        id: true,
        homeStationId: true,
        currentStationId: true,
        expectedStationId: true,
        currentStationSource: true,
        currentStationConfirmedAt: true,
        stationPositionVersion: true,
        status: true,
      },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const toSnapshot = (
      row: typeof vehicle,
    ): VehicleCorrectCurrentStationCommandResult['vehicle'] => ({
      id: row.id,
      homeStationId: row.homeStationId,
      currentStationId: row.currentStationId,
      expectedStationId: row.expectedStationId,
      currentStationSource: row.currentStationSource,
      currentStationConfirmedAt: row.currentStationConfirmedAt?.toISOString() ?? null,
      stationPositionVersion: row.stationPositionVersion,
      status: row.status,
    });

    if (input.expectedVersion !== vehicle.stationPositionVersion) {
      throw new ConflictException({
        message: buildVehicleCorrectCurrentStationVersionConflictIssue().message,
        code: VehicleCorrectCurrentStationCommandIssueCode.STATION_POSITION_VERSION_CONFLICT,
        outcome: VehicleCorrectCurrentStationCommandOutcome.BLOCKED,
        command: VehicleCorrectCurrentStationCommandName.CORRECT_CURRENT_STATION,
        blockingReasons: [buildVehicleCorrectCurrentStationVersionConflictIssue()],
        audit: buildVehicleCorrectCurrentStationCommandAudit({
          organizationId,
          vehicleId: vehicle.id,
          fromCurrentStationId: vehicle.currentStationId,
          toCurrentStationId: input.currentStationId,
          source: input.source,
          previousStationPositionVersion: vehicle.stationPositionVersion,
          nextStationPositionVersion: vehicle.stationPositionVersion,
          reason: input.reason,
          performedByUserId,
          idempotent: false,
        }),
      });
    }

    if (isSameCurrentStationAssignment(vehicle.currentStationId, input.currentStationId)) {
      const idempotentEvaluation = evaluateCorrectVehicleCurrentStationCommand({
        currentStationId: vehicle.currentStationId,
        newCurrentStationId: input.currentStationId,
        vehicleStatus: vehicle.status,
        source: input.source,
      });

      return {
        outcome: VehicleCorrectCurrentStationCommandOutcome.IDEMPOTENT,
        command: VehicleCorrectCurrentStationCommandName.CORRECT_CURRENT_STATION,
        allowed: true,
        vehicle: toSnapshot(vehicle),
        blockingReasons: [],
        warnings: idempotentEvaluation.warnings,
        audit: buildVehicleCorrectCurrentStationCommandAudit({
          organizationId,
          vehicleId: vehicle.id,
          fromCurrentStationId: vehicle.currentStationId,
          toCurrentStationId: input.currentStationId,
          source: input.source,
          previousStationPositionVersion: vehicle.stationPositionVersion,
          nextStationPositionVersion: vehicle.stationPositionVersion,
          reason: input.reason,
          performedByUserId,
          idempotent: true,
        }),
      };
    }

    const targetStation = input.currentStationId
      ? await this.prisma.station.findFirst({
          where: { id: input.currentStationId, organizationId },
          select: { id: true, status: true },
        })
      : null;

    if (input.currentStationId && !targetStation) {
      throw new NotFoundException('Station not found');
    }

    const evaluation = evaluateCorrectVehicleCurrentStationCommand({
      currentStationId: vehicle.currentStationId,
      newCurrentStationId: input.currentStationId,
      vehicleStatus: vehicle.status,
      source: input.source,
      targetStationStatus: targetStation?.status ?? null,
    });

    const auditBase = {
      organizationId,
      vehicleId: vehicle.id,
      fromCurrentStationId: vehicle.currentStationId,
      toCurrentStationId: input.currentStationId,
      source: input.source,
      previousStationPositionVersion: vehicle.stationPositionVersion,
      nextStationPositionVersion: vehicle.stationPositionVersion,
      reason: input.reason,
      performedByUserId,
      idempotent: evaluation.idempotent,
    };

    if (evaluation.idempotent) {
      return {
        outcome: VehicleCorrectCurrentStationCommandOutcome.IDEMPOTENT,
        command: VehicleCorrectCurrentStationCommandName.CORRECT_CURRENT_STATION,
        allowed: true,
        vehicle: toSnapshot(vehicle),
        blockingReasons: [],
        warnings: evaluation.warnings,
        audit: buildVehicleCorrectCurrentStationCommandAudit(auditBase),
      };
    }

    if (!evaluation.allowed) {
      throw new BadRequestException({
        message:
          evaluation.blockingReasons[0]?.message ??
          'CorrectVehicleCurrentStation is not allowed for this vehicle',
        code: 'CORRECT_CURRENT_STATION_BLOCKED',
        outcome: VehicleCorrectCurrentStationCommandOutcome.BLOCKED,
        command: VehicleCorrectCurrentStationCommandName.CORRECT_CURRENT_STATION,
        blockingReasons: evaluation.blockingReasons,
        warnings: evaluation.warnings,
        audit: buildVehicleCorrectCurrentStationCommandAudit(auditBase),
      });
    }

    const confirmedAt = new Date();
    const updateResult = await this.prisma.vehicle.updateMany({
      where: {
        id: vehicle.id,
        organizationId,
        stationPositionVersion: input.expectedVersion,
      },
      data: input.currentStationId
        ? {
            currentStationId: input.currentStationId,
            currentStationSource: input.source,
            currentStationConfirmedAt: confirmedAt,
            currentStationConfirmedByUserId: performedByUserId ?? null,
            stationPositionVersion: { increment: 1 },
          }
        : {
            currentStationId: null,
            currentStationSource: null,
            currentStationConfirmedAt: null,
            currentStationConfirmedByUserId: null,
            stationPositionVersion: { increment: 1 },
          },
    });

    if (updateResult.count === 0) {
      throw new ConflictException({
        message: buildVehicleCorrectCurrentStationVersionConflictIssue().message,
        code: VehicleCorrectCurrentStationCommandIssueCode.STATION_POSITION_VERSION_CONFLICT,
        outcome: VehicleCorrectCurrentStationCommandOutcome.BLOCKED,
        command: VehicleCorrectCurrentStationCommandName.CORRECT_CURRENT_STATION,
        blockingReasons: [buildVehicleCorrectCurrentStationVersionConflictIssue()],
        audit: buildVehicleCorrectCurrentStationCommandAudit(auditBase),
      });
    }

    const updated = await this.prisma.vehicle.findFirst({
      where: { id: vehicle.id, organizationId },
      select: {
        id: true,
        homeStationId: true,
        currentStationId: true,
        expectedStationId: true,
        currentStationSource: true,
        currentStationConfirmedAt: true,
        stationPositionVersion: true,
        status: true,
      },
    });
    if (!updated) {
      throw new NotFoundException('Vehicle not found');
    }

    void this.stationDomainAudit.recordForStations(
      [vehicle.currentStationId, input.currentStationId],
      {
        organizationId,
        auditAction: StationDomainAuditAction.CURRENT_STATION_CORRECTED,
        actorUserId: performedByUserId,
        vehicleId: vehicle.id,
        from: vehicle.currentStationId,
        to: input.currentStationId,
        reason: input.reason,
        command: VehicleCorrectCurrentStationCommandName.CORRECT_CURRENT_STATION,
        performedAt: new Date().toISOString(),
        meta: { source: input.source },
      },
    );

    return {
      outcome: VehicleCorrectCurrentStationCommandOutcome.APPLIED,
      command: VehicleCorrectCurrentStationCommandName.CORRECT_CURRENT_STATION,
      allowed: true,
      vehicle: toSnapshot(updated),
      blockingReasons: [],
      warnings: evaluation.warnings,
      audit: buildVehicleCorrectCurrentStationCommandAudit({
        ...auditBase,
        nextStationPositionVersion: updated.stationPositionVersion,
        idempotent: false,
      }),
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Vehicle ↔ station assignment
  // ─────────────────────────────────────────────────────────────

  /**
   * @deprecated Attach-only compatibility shim. SET semantics (implicit detach
   * from partial lists, currentStationId coupling) are removed. Use
   * `changeVehicleHomeStation` per vehicle instead.
   */
  async setStationVehicles(
    organizationId: string,
    stationId: string,
    vehicleIds: string[],
    options?: { listCompleteness?: StationSetVehiclesListCompleteness },
  ): Promise<StationVehicleAssignmentResult> {
    if (isStationSetVehiclesDisabled()) {
      throwStationSetVehiclesDisabled();
    }

    const deprecation = buildStationSetVehiclesDeprecationMetadata();
    const station = await this.prisma.station.findFirst({
      where: { id: stationId, organizationId },
      select: { id: true },
    });
    if (!station) throw new NotFoundException(`Station ${stationId} not found`);

    const requested = Array.from(
      new Set((vehicleIds ?? []).filter((id) => typeof id === 'string' && id.length > 0)),
    );

    const previouslyHere = await this.prisma.vehicle.findMany({
      where: { organizationId, homeStationId: stationId },
      select: { id: true },
    });
    const stationHomeVehicleIds = previouslyHere.map((v) => v.id);

    const policy = evaluateSetStationVehiclesPolicy({
      disabledByFlag: false,
      stationHomeVehicleIds,
      requestedVehicleIds: requested,
      listCompleteness: options?.listCompleteness,
    });
    if (!policy.allowed) {
      throwStationSetVehiclesPolicyBlocked(policy.blockingReasons);
    }

    const requestedVehicles = requested.length
      ? await this.prisma.vehicle.findMany({
          where: { id: { in: requested }, organizationId },
          select: { id: true, homeStationId: true, currentStationId: true, expectedStationId: true },
        })
      : [];

    if (requestedVehicles.length !== requested.length) {
      throw new BadRequestException(
        'One or more vehicles do not belong to this organization',
      );
    }

    const idsToAttach = requestedVehicles
      .filter((v) => v.homeStationId !== stationId)
      .map((v) => v.id);
    const movedFromOtherStations = requestedVehicles.filter(
      (v) => v.homeStationId !== null && v.homeStationId !== stationId,
    ).length;
    const newlyAttached = requestedVehicles.filter((v) => v.homeStationId === null).length;

    if (idsToAttach.length === 0) {
      return {
        stationId,
        totalAssigned: stationHomeVehicleIds.length,
        newlyAttached: 0,
        detached: 0,
        movedFromOtherStations: 0,
        deprecation,
      };
    }

    await this.prisma.$transaction(
      idsToAttach.map((vehicleId) =>
        this.prisma.vehicle.update({
          where: { id: vehicleId, organizationId },
          data: {
            homeStationId: stationId,
            stationPositionVersion: { increment: 1 },
          },
        }),
      ),
    );

    const attachedStillHere = await this.prisma.vehicle.count({
      where: { organizationId, homeStationId: stationId },
    });

    return {
      stationId,
      totalAssigned: attachedStillHere,
      newlyAttached,
      detached: 0,
      movedFromOtherStations,
      deprecation,
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
  private persistLifecycleDomainAudit(
    result: StationLifecycleCommandResult<StationDto>,
    performedByUserId?: string | null,
  ): void {
    if (result.outcome !== StationLifecycleCommandOutcome.APPLIED) return;

    const auditAction =
      result.command === StationLifecycleCommandName.ACTIVATE
        ? StationDomainAuditAction.ACTIVATED
        : StationDomainAuditAction.DEACTIVATED;

    void this.stationDomainAudit.record({
      organizationId: result.audit.organizationId,
      stationId: result.audit.stationId,
      auditAction,
      actorUserId: performedByUserId,
      from: result.audit.previousStatus,
      to: result.audit.nextStatus,
      command: result.audit.command,
      performedAt: result.audit.performedAt,
      meta: {
        futurePickupCount: result.audit.futurePickupCount,
        futureReturnCount: result.audit.futureReturnCount,
      },
    });
  }

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
      return parseMapboxForwardGeocodeFeature(json.features?.[0]);
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
        data: {
          latitude: coords.latitude,
          longitude: coords.longitude,
          ...resolveStationCoordinatesProvenance({ geocodedCoordinates: true }),
        },
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
      coordinatesSource: row.coordinatesSource,
      coordinatesConfirmedAt: row.coordinatesConfirmedAt,
      hasMissingCoordinates: stationHasMissingCoordinates(row.latitude, row.longitude),
      geofenceCapability: evaluateStationGeofenceCapability({
        latitude: row.latitude,
        longitude: row.longitude,
        radiusMeters: row.radiusMeters,
      }),
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
      openingHours: normalizeStationOpeningHoursForRead(row.openingHours) as Prisma.JsonValue,
      openingHoursContractVersion: STATION_OPENING_HOURS_CONTRACT_VERSION,
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
      } else {
        data.radiusMeters = normalizeGeofenceRadius(r);
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
