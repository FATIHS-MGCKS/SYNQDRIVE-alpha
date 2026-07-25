import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { VehiclesService } from '@modules/vehicles/vehicles.service';
import { classifyVehicleDetailProviderError } from '@modules/vehicles/observability/vehicle-detail-log.util';
import { interpretVehicleState } from '@modules/vehicles/vehicle-state-interpreter';
import type { TelemetryFreshness } from '@modules/vehicles/vehicle-state-interpreter';
import type { TelemetryTimestampEvidence } from '@modules/vehicles/telemetry-freshness.resolver';
import { resolveTelemetryFreshness } from '@modules/vehicles/telemetry-freshness.resolver';
import type { AiExecutionContext } from '../../execution/ai-execution-context.types';
import {
  assertAiLocationAccess,
  assertAiToolExecutionAllowed,
  resolveAiVehicleAccess,
} from '../../execution/ai-execution-context.access';
import type { AiDomainError } from '../../evidence/ai-domain-error.types';
import type { AiDomainQueryOutcome } from '../../evidence/ai-domain-error.types';
import {
  buildAiDomainQueryOutcome,
  buildPartialAiDomainQueryOutcome,
  createIntegrationNotConnectedError,
  createIntegrationTemporarilyUnavailableError,
  createTimeoutError,
  createVehicleNotFoundError,
} from '../../evidence/ai-domain-error.factory';
import { mapTelemetryToAiEvidenceSemantics } from '../../evidence/ai-evidence-telemetry.mapper';
import type { MappedTelemetryAiSemantics } from '../../evidence/ai-evidence-telemetry.types';
import { createObservedAiEvidence } from '../../evidence/ai-evidence.factory';
import type { AiEvidence } from '../../evidence/ai-evidence.types';
import { buildAiVehicleDisplayName } from '../../vehicle-resolution/ai-vehicle-resolution.hints';
import { AiDataAuthorizationProbeAdapter } from '../ai-data-authorization.probe';
import { AiPrismaVehicleScopeResolver } from '../ai-prisma-vehicle-scope.resolver';
import type {
  AiGetVehicleLocationData,
  AiGetVehicleLocationInput,
  AiGetVehicleLocationSource,
} from './ai-get-vehicle-location.types';
import { AI_GET_VEHICLE_LOCATION_TOOL } from './ai-get-vehicle-location.types';

interface LoadedVehicleLocationRow {
  vehicleId: string;
  organizationId: string;
  licensePlate: string | null;
  vehicleName: string | null;
  make: string;
  model: string;
  year: number;
  tokenId: number | null;
  latestState: {
    latitude: number | null;
    longitude: number | null;
    speedKmh: number | null;
    isIgnitionOn: boolean | null;
    engineLoad: number | null;
    tractionBatteryPowerKw: number | null;
    coolantTempC: number | null;
    odometerKm: number | null;
    lastSeenAt: Date | null;
    sourceTimestamp: Date | null;
    providerFetchedAt: Date | null;
    updatedAt: Date;
  } | null;
  dimoLastSignal: Date | null;
  tripDetectionState: string | null;
}

interface ResolvedCoordinates {
  latitude: number | null;
  longitude: number | null;
  speedKmh: number | null;
  observedAt: string | null;
  source: AiGetVehicleLocationSource;
  providerOutage: boolean;
  warnings: string[];
}

@Injectable()
export class AiGetVehicleLocationTool {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vehicles: VehiclesService,
    private readonly vehicleScopeResolver: AiPrismaVehicleScopeResolver,
    private readonly dataAuthorizationProbe: AiDataAuthorizationProbeAdapter,
  ) {}

  async execute(
    context: AiExecutionContext | null | undefined,
    input: AiGetVehicleLocationInput,
    nowMs: number = Date.now(),
  ): Promise<AiDomainQueryOutcome<AiGetVehicleLocationData>> {
    const tenantId = context?.organizationId ?? 'unknown';

    const toolGate = assertAiToolExecutionAllowed(context);
    if (toolGate !== true) {
      return this.blockedOutcome(tenantId, toolGate);
    }

    const verifiedContext = context as AiExecutionContext;
    const vehicleAccess = await resolveAiVehicleAccess(
      verifiedContext,
      { vehicleId: input.vehicleId },
      this.vehicleScopeResolver,
    );
    if ('code' in vehicleAccess) {
      return this.blockedOutcome(tenantId, vehicleAccess);
    }

    const locationGate = await assertAiLocationAccess(
      verifiedContext,
      this.dataAuthorizationProbe,
      vehicleAccess.vehicleId,
    );
    if (locationGate !== true) {
      return this.blockedOutcome(tenantId, locationGate);
    }

    const row = await this.loadVehicleRow(
      verifiedContext.organizationId,
      vehicleAccess.vehicleId,
    );
    if (!row) {
      return this.blockedOutcome(
        tenantId,
        createVehicleNotFoundError({
          organizationId: verifiedContext.organizationId,
          entityId: vehicleAccess.vehicleId,
          entityKind: 'vehicle',
          correlationId: verifiedContext.correlationId,
          internalDetail: 'ai.get_vehicle_location.vehicle_not_found',
        }),
      );
    }

    if (row.organizationId !== verifiedContext.organizationId) {
      return this.blockedOutcome(
        tenantId,
        createVehicleNotFoundError({
          organizationId: verifiedContext.organizationId,
          entityId: vehicleAccess.vehicleId,
          entityKind: 'vehicle',
          correlationId: verifiedContext.correlationId,
          internalDetail: 'ai.get_vehicle_location.organization_mismatch',
        }),
      );
    }

    const hasProviderLink = row.tokenId != null && row.tokenId > 0;
    if (!hasProviderLink) {
      return this.buildOutcome({
        tenantId,
        row,
        coords: this.emptyCoordinates(),
        semantics: mapTelemetryToAiEvidenceSemantics({
          tenantId,
          entityId: row.vehicleId,
          timestampEvidence: this.buildTimestampEvidence(row),
          hasProviderLink: false,
          signalSupported: true,
          nowMs,
        }),
        errors: [
          createIntegrationNotConnectedError({
            entityId: row.vehicleId,
            entityKind: 'vehicle',
            internalDetail: 'ai.get_vehicle_location.dimo_not_connected',
          }),
        ],
        nowMs,
      });
    }

    const interpreted = interpretVehicleState(
      {
        lastSeenAt: row.latestState?.lastSeenAt ?? null,
        speedKmh: row.latestState?.speedKmh ?? null,
        isIgnitionOn: row.latestState?.isIgnitionOn ?? null,
        engineLoad: row.latestState?.engineLoad ?? null,
        tractionBatteryPowerKw: row.latestState?.tractionBatteryPowerKw ?? null,
        coolantTempC: row.latestState?.coolantTempC ?? null,
        odometerKm: row.latestState?.odometerKm ?? null,
      },
      row.tripDetectionState ? { state: row.tripDetectionState as never } : null,
    );

    const timestampEvidence = this.buildTimestampEvidence(row);
    const canonicalFreshness = resolveTelemetryFreshness(timestampEvidence, nowMs).freshness;
    const snapshotCoords = this.coordsFromLatestState(row);

    let coords = snapshotCoords;
    let providerErrors: AiDomainError[] = [];

    if (
      this.shouldFetchLiveGps({
        hasToken: hasProviderLink,
        latitude: snapshotCoords.latitude,
        longitude: snapshotCoords.longitude,
        isLiveTracking: interpreted.isLiveTracking,
        canonicalFreshness,
      })
    ) {
      const liveResult = await this.fetchLiveCoordinates(
        row.vehicleId,
        verifiedContext.organizationId,
        snapshotCoords,
      );
      coords = liveResult.coords;
      providerErrors = liveResult.errors;
    }

    const hasCoordinates =
      typeof coords.latitude === 'number' &&
      typeof coords.longitude === 'number' &&
      !Number.isNaN(coords.latitude) &&
      !Number.isNaN(coords.longitude);

    const semantics = mapTelemetryToAiEvidenceSemantics({
      tenantId,
      entityId: row.vehicleId,
      timestampEvidence,
      hasProviderLink,
      signalSupported: true,
      providerOutage: coords.providerOutage,
      isHistoricalSnapshot: coords.source !== 'dimo_live',
      lastKnownPositionAvailable: hasCoordinates,
      liveHints: {
        isLiveTracking: interpreted.isLiveTracking,
        isFresh: interpreted.isFresh,
        online: row.latestState?.lastSeenAt != null,
        onlineStatus: interpreted.onlineStatus,
        displayState: interpreted.displayState,
        displayIgnition: interpreted.displayIgnition,
        speedKmh: coords.speedKmh ?? row.latestState?.speedKmh ?? null,
      },
      source:
        coords.source === 'dimo_live'
          ? 'dimo_telemetry'
          : coords.source === 'cache_fallback'
            ? 'vehicle_latest_state'
            : 'vehicle_latest_state',
      nowMs,
    });

    return this.buildOutcome({
      tenantId,
      row,
      coords,
      semantics,
      errors: providerErrors,
      nowMs,
      ignitionState: row.latestState?.isIgnitionOn ?? null,
    });
  }

  private async loadVehicleRow(
    organizationId: string,
    vehicleId: string,
  ): Promise<LoadedVehicleLocationRow | null> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: {
        id: true,
        organizationId: true,
        licensePlate: true,
        vehicleName: true,
        make: true,
        model: true,
        year: true,
        dimoVehicle: { select: { tokenId: true, lastSignal: true } },
        latestState: {
          select: {
            latitude: true,
            longitude: true,
            speedKmh: true,
            isIgnitionOn: true,
            engineLoad: true,
            tractionBatteryPowerKw: true,
            coolantTempC: true,
            odometerKm: true,
            lastSeenAt: true,
            sourceTimestamp: true,
            providerFetchedAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!vehicle) {
      return null;
    }

    const tripState = await this.prisma.vehicleTripDetectionState
      .findUnique({
        where: { vehicleId: vehicle.id },
        select: { state: true },
      })
      .catch(() => null);

    return {
      vehicleId: vehicle.id,
      organizationId: vehicle.organizationId,
      licensePlate: vehicle.licensePlate,
      vehicleName: vehicle.vehicleName,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      tokenId: vehicle.dimoVehicle?.tokenId ?? null,
      latestState: vehicle.latestState,
      dimoLastSignal: vehicle.dimoVehicle?.lastSignal ?? null,
      tripDetectionState: tripState?.state ?? null,
    };
  }

  private buildTimestampEvidence(row: LoadedVehicleLocationRow): TelemetryTimestampEvidence {
    return {
      providerObservedAt: row.latestState?.sourceTimestamp ?? row.latestState?.lastSeenAt ?? null,
      lastValidTelemetryAt: row.latestState?.lastSeenAt ?? null,
      receivedAt: row.latestState?.providerFetchedAt ?? null,
      lastSignal: row.dimoLastSignal,
      latestStateUpdatedAt: row.latestState?.updatedAt ?? null,
    };
  }

  private coordsFromLatestState(row: LoadedVehicleLocationRow): ResolvedCoordinates {
    const state = row.latestState;
    const observedAt = state?.sourceTimestamp ?? state?.lastSeenAt ?? null;
    return {
      latitude: state?.latitude ?? null,
      longitude: state?.longitude ?? null,
      speedKmh: state?.speedKmh ?? null,
      observedAt: observedAt ? observedAt.toISOString() : null,
      source: 'vehicle_latest_state',
      providerOutage: false,
      warnings: [],
    };
  }

  private emptyCoordinates(): ResolvedCoordinates {
    return {
      latitude: null,
      longitude: null,
      speedKmh: null,
      observedAt: null,
      source: 'vehicle_latest_state',
      providerOutage: false,
      warnings: [],
    };
  }

  private shouldFetchLiveGps(input: {
    hasToken: boolean;
    latitude: number | null;
    longitude: number | null;
    isLiveTracking: boolean;
    canonicalFreshness: TelemetryFreshness;
  }): boolean {
    if (!input.hasToken) {
      return false;
    }
    if (input.latitude == null || input.longitude == null) {
      return true;
    }
    return input.isLiveTracking && input.canonicalFreshness === 'live';
  }

  private async fetchLiveCoordinates(
    vehicleId: string,
    organizationId: string,
    fallback: ResolvedCoordinates,
  ): Promise<{ coords: ResolvedCoordinates; errors: AiDomainError[] }> {
    try {
      const live = await this.vehicles.getLiveGps(vehicleId, organizationId);
      const observedAt =
        live.lastSeenAt != null ? new Date(live.lastSeenAt).toISOString() : fallback.observedAt;
      const hasCoords =
        typeof live.latitude === 'number' &&
        typeof live.longitude === 'number' &&
        !Number.isNaN(live.latitude) &&
        !Number.isNaN(live.longitude);

      if (live.source === 'dimo' && hasCoords) {
        return {
          coords: {
            latitude: live.latitude,
            longitude: live.longitude,
            speedKmh: live.speedKmh,
            observedAt,
            source: 'dimo_live',
            providerOutage: false,
            warnings: [],
          },
          errors: [],
        };
      }

      return {
        coords: {
          latitude: hasCoords ? live.latitude : fallback.latitude,
          longitude: hasCoords ? live.longitude : fallback.longitude,
          speedKmh: live.speedKmh ?? fallback.speedKmh,
          observedAt: observedAt ?? fallback.observedAt,
          source: 'cache_fallback',
          providerOutage: false,
          warnings: ['live_provider_cache_fallback'],
        },
        errors: [],
      };
    } catch (error) {
      const errorClass = classifyVehicleDetailProviderError(error);
      const domainError =
        errorClass === 'timeout'
          ? createTimeoutError({
              entityId: vehicleId,
              entityKind: 'vehicle',
              internalDetail: 'ai.get_vehicle_location.live_gps_timeout',
            })
          : createIntegrationTemporarilyUnavailableError({
              entityId: vehicleId,
              entityKind: 'vehicle',
              causeCode: errorClass,
              internalDetail: 'ai.get_vehicle_location.live_gps_failed',
            });

      return {
        coords: {
          ...fallback,
          source: 'cache_fallback',
          providerOutage: true,
          warnings: ['live_provider_unavailable_using_snapshot'],
        },
        errors: [domainError],
      };
    }
  }

  private buildOutcome(input: {
    tenantId: string;
    row: LoadedVehicleLocationRow;
    coords: ResolvedCoordinates;
    semantics: MappedTelemetryAiSemantics;
    errors: AiDomainError[];
    nowMs: number;
    ignitionState?: boolean | null;
  }): AiDomainQueryOutcome<AiGetVehicleLocationData> {
    const observedAt = input.coords.observedAt ?? input.semantics.observedAt;
    const ageSeconds =
      observedAt != null
        ? Math.max(0, Math.round((input.nowMs - Date.parse(observedAt)) / 1000))
        : input.semantics.ageMs != null
          ? Math.round(input.semantics.ageMs / 1000)
          : null;

    const isLastKnownLocation = this.resolveIsLastKnownLocation(
      input.coords.source,
      input.semantics.telemetrySemantics,
      input.semantics.canonicalFreshness,
    );

    const data: AiGetVehicleLocationData = {
      vehicleId: input.row.vehicleId,
      displayName: buildAiVehicleDisplayName(input.row),
      licensePlate: input.row.licensePlate,
      latitude: input.coords.latitude,
      longitude: input.coords.longitude,
      address: null,
      observedAt,
      ageSeconds,
      freshness: input.semantics.freshness,
      telemetryState: input.semantics.telemetrySemantics,
      speedKmh: input.coords.speedKmh,
      ignitionState: input.ignitionState ?? null,
      source: input.coords.source,
      isLastKnownLocation,
      availability: input.semantics.availability,
      confidence: input.semantics.confidence,
      reasonCode: input.semantics.reasonCode,
      warnings: [
        ...input.semantics.warnings,
        ...input.coords.warnings,
      ],
    };

    const evidence = this.buildEvidence(input.tenantId, input.row.vehicleId, data);
    const warnings = [...data.warnings];

    if (input.errors.length > 0 && data.latitude != null && data.longitude != null) {
      return buildPartialAiDomainQueryOutcome({
        tenantId: input.tenantId,
        data,
        evidence,
        errors: input.errors,
        warnings,
      });
    }

    if (input.errors.length > 0) {
      return buildAiDomainQueryOutcome<AiGetVehicleLocationData>({
        tenantId: input.tenantId,
        data: null,
        evidence,
        errors: input.errors,
        warnings,
      });
    }

    if (data.latitude == null || data.longitude == null) {
      return buildAiDomainQueryOutcome<AiGetVehicleLocationData>({
        tenantId: input.tenantId,
        data: null,
        evidence,
        errors: [],
        warnings,
      });
    }

    return buildAiDomainQueryOutcome({
      tenantId: input.tenantId,
      data,
      evidence,
      errors: [],
      warnings,
    });
  }

  private resolveIsLastKnownLocation(
    source: AiGetVehicleLocationSource,
    telemetryState: MappedTelemetryAiSemantics['telemetrySemantics'],
    canonicalFreshness: TelemetryFreshness,
  ): boolean {
    if (source === 'cache_fallback') {
      return true;
    }
    if (telemetryState === 'live' || telemetryState === 'fresh') {
      return source !== 'dimo_live' && canonicalFreshness !== 'live';
    }
    return true;
  }

  private buildEvidence(
    tenantId: string,
    vehicleId: string,
    data: AiGetVehicleLocationData,
  ): AiEvidence[] {
    if (data.latitude == null || data.longitude == null || !data.observedAt) {
      return [];
    }

    return [
      createObservedAiEvidence({
        tenantId,
        entityId: vehicleId,
        source: data.source === 'dimo_live' ? 'dimo_telemetry' : 'vehicle_latest_state',
        sourceEntity: { kind: 'vehicle', id: vehicleId },
        observedAt: data.observedAt,
        freshness: data.freshness,
        confidence: data.confidence,
        availability: data.availability,
        reasonCode: data.reasonCode,
        sensitivity: 'restricted',
        warnings: data.warnings,
        value: {
          latitude: data.latitude,
          longitude: data.longitude,
          speedKmh: data.speedKmh,
          isLastKnownLocation: data.isLastKnownLocation,
          telemetryState: data.telemetryState,
        },
      }),
    ];
  }

  private blockedOutcome(
    tenantId: string,
    error: AiDomainError,
  ): AiDomainQueryOutcome<AiGetVehicleLocationData> {
    return buildAiDomainQueryOutcome<AiGetVehicleLocationData>({
      tenantId,
      data: null,
      evidence: [],
      errors: [error],
      warnings: [`${AI_GET_VEHICLE_LOCATION_TOOL}:blocked`],
    });
  }
}
