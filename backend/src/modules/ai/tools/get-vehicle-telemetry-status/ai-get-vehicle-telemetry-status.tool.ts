import { Injectable } from '@nestjs/common';
import { DataAuthorizationSourceType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { extractConnectivitySnapshot } from '@shared/utils/connectivity-signals';
import type { OverallConnectivityState } from '@modules/vehicles/connectivity/domain/connectivity-domain.types';
import {
  assembleVehicleConnectivityRuntimeBundle,
  type ConnectivityRuntimeVehicleRow,
  type OrgAuthorizationRow,
} from '@modules/vehicles/connectivity/vehicle-connectivity-runtime-batch.assembler';
import {
  buildFleetDataCoverage,
  resolveFleetDeviceClass,
  resolveFleetPowertrainClass,
  resolveFleetProviderClass,
} from '@modules/vehicles/fleet-data-coverage';
import {
  SignalCapabilityExpectation,
  SignalRuntimeStatus,
  type FleetDataCoverageResult,
  type FleetSignalKey,
} from '@modules/vehicles/fleet-data-coverage.types';
import { interpretVehicleState } from '@modules/vehicles/vehicle-state-interpreter';
import type { TelemetryTimestampEvidence } from '@modules/vehicles/telemetry-freshness.resolver';
import { resolveTelemetryFreshness } from '@modules/vehicles/telemetry-freshness.resolver';
import type { AiExecutionContext } from '../../execution/ai-execution-context.types';
import {
  assertAiToolExecutionAllowed,
  resolveAiVehicleAccess,
} from '../../execution/ai-execution-context.access';
import type { AiDomainError } from '../../evidence/ai-domain-error.types';
import type { AiDomainQueryOutcome } from '../../evidence/ai-domain-error.types';
import {
  buildAiDomainQueryOutcome,
  buildPartialAiDomainQueryOutcome,
  createIntegrationNotConnectedError,
  createVehicleNotFoundError,
} from '../../evidence/ai-domain-error.factory';
import { mapTelemetryToAiEvidenceSemantics } from '../../evidence/ai-evidence-telemetry.mapper';
import type { MappedTelemetryAiSemantics } from '../../evidence/ai-evidence-telemetry.types';
import { createObservedAiEvidence } from '../../evidence/ai-evidence.factory';
import type { AiEvidence } from '../../evidence/ai-evidence.types';
import { buildAiVehicleDisplayName } from '../../vehicle-resolution/ai-vehicle-resolution.hints';
import type { AiVehicleScopeResolver } from '../../execution/ai-execution-context.types';
import type {
  AiGetVehicleTelemetryStatusData,
  AiGetVehicleTelemetryStatusInput,
  AiTelemetryStatusExplanation,
} from './ai-get-vehicle-telemetry-status.types';
import { AI_GET_VEHICLE_TELEMETRY_STATUS_TOOL } from './ai-get-vehicle-telemetry-status.types';

const CONNECTIVITY_VEHICLE_SELECT = {
  id: true,
  organizationId: true,
  licensePlate: true,
  vehicleName: true,
  make: true,
  model: true,
  year: true,
  hardwareType: true,
  fuelType: true,
  dimoVehicleId: true,
  dimoVehicle: { select: { connectionStatus: true, tokenId: true, lastSignal: true } },
  latestState: {
    select: {
      lastSeenAt: true,
      providerFetchedAt: true,
      sourceTimestamp: true,
      providerSource: true,
      providerBindingId: true,
      rawPayloadJson: true,
      latitude: true,
      longitude: true,
      speedKmh: true,
      isIgnitionOn: true,
      engineLoad: true,
      tractionBatteryPowerKw: true,
      coolantTempC: true,
      odometerKm: true,
      fuelLevelRelative: true,
      fuelLevelAbsolute: true,
      evSoc: true,
      obdDtcList: true,
      lastDtcPollAt: true,
      updatedAt: true,
    },
  },
  dataSourceLinks: {
    where: { provider: 'DIMO' },
    orderBy: { activatedAt: 'desc' as const },
    select: {
      id: true,
      sourceType: true,
      sourceSubtype: true,
      isActive: true,
      provider: true,
    },
  },
  providerConsents: {
    where: { provider: 'DIMO' },
    orderBy: { grantedAt: 'desc' as const },
    select: {
      organizationId: true,
      provider: true,
      status: true,
      grantedAt: true,
      expiresAt: true,
      revokedAt: true,
    },
  },
  deviceConnectionEpisodes: {
    orderBy: { openedAt: 'desc' as const },
    take: 2,
    select: {
      id: true,
      deviceBindingId: true,
      openedAt: true,
      status: true,
      resolutionMethod: true,
      resolutionEvidenceAt: true,
      resolvedAt: true,
    },
  },
} as const;

interface LoadedTelemetryVehicleRow extends ConnectivityRuntimeVehicleRow {
  licensePlate: string | null;
  vehicleName: string | null;
  make: string;
  model: string;
  year: number;
  latestState: NonNullable<ConnectivityRuntimeVehicleRow['latestState']> & {
    isIgnitionOn: boolean | null;
    engineLoad: number | null;
    tractionBatteryPowerKw: number | null;
    coolantTempC: number | null;
    updatedAt: Date;
  } | null;
}

@Injectable()
export class AiGetVehicleTelemetryStatusTool {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vehicleScopeResolver: AiVehicleScopeResolver,
  ) {}

  async execute(
    context: AiExecutionContext | null | undefined,
    input: AiGetVehicleTelemetryStatusInput,
    nowMs: number = Date.now(),
  ): Promise<AiDomainQueryOutcome<AiGetVehicleTelemetryStatusData>> {
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
          internalDetail: 'ai.get_vehicle_telemetry_status.vehicle_not_found',
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
          internalDetail: 'ai.get_vehicle_telemetry_status.organization_mismatch',
        }),
      );
    }

    const orgAuthorization = await this.loadOrgAuthorization(verifiedContext.organizationId);
    const bundle = assembleVehicleConnectivityRuntimeBundle(row, orgAuthorization, nowMs);
    const dataCoverage = this.buildDataCoverage(row, bundle.providerLink.hasProviderLink, nowMs);
    const timestampEvidence = this.buildTimestampEvidence(row);
    const canonicalFreshness = resolveTelemetryFreshness(timestampEvidence, nowMs);
    const hasProviderLink = bundle.providerLink.hasProviderLink;
    const providerOutage =
      bundle.runtime.overallState === 'INTEGRATION_ERROR' ||
      bundle.providerLink.state === 'ERROR';

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
      null,
    );

    const hasStoredTelemetry = row.latestState != null && canonicalFreshness.observedAtIso != null;
    const hasGpsSnapshot =
      row.latestState?.latitude != null && row.latestState?.longitude != null;

    const semantics = mapTelemetryToAiEvidenceSemantics({
      tenantId,
      entityId: row.id,
      timestampEvidence,
      hasProviderLink,
      signalSupported: true,
      providerOutage,
      isHistoricalSnapshot: true,
      lastKnownPositionAvailable: hasGpsSnapshot,
      liveHints: {
        isLiveTracking: interpreted.isLiveTracking,
        isFresh: interpreted.isFresh,
        online: row.latestState?.lastSeenAt != null,
        onlineStatus: interpreted.onlineStatus,
        displayState: interpreted.displayState,
        displayIgnition: interpreted.displayIgnition,
        speedKmh: row.latestState?.speedKmh ?? null,
      },
      source: 'vehicle_latest_state',
      nowMs,
    });

    const signalGroups = this.classifySignalGroups(dataCoverage);
    const explanation = this.buildExplanation({
      semantics,
      runtime: bundle.runtime,
      canonicalFreshness: canonicalFreshness.freshness,
      hasProviderLink,
      providerOutage,
      signalGroups,
      hasStoredTelemetry,
    });

    const domainErrors: AiDomainError[] = [];
    if (!hasProviderLink) {
      domainErrors.push(
        createIntegrationNotConnectedError({
          entityId: row.id,
          entityKind: 'vehicle',
          internalDetail: 'ai.get_vehicle_telemetry_status.dimo_not_connected',
        }),
      );
    }

    return this.buildOutcome({
      tenantId,
      row,
      semantics,
      runtimeOverallState: bundle.runtime.overallState,
      providerConnectionStatus:
        bundle.runtime.evidence.providerConnectionStatus ?? row.dimoVehicle?.connectionStatus ?? null,
      reasonCodes: [
        ...bundle.runtime.reasonCodes,
        ...dataCoverage.reasonCodes,
      ],
      signalGroups,
      explanation,
      domainErrors,
      nowMs,
    });
  }

  private async loadVehicleRow(
    organizationId: string,
    vehicleId: string,
  ): Promise<LoadedTelemetryVehicleRow | null> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: CONNECTIVITY_VEHICLE_SELECT,
    });
    return vehicle as LoadedTelemetryVehicleRow | null;
  }

  private async loadOrgAuthorization(
    organizationId: string,
  ): Promise<OrgAuthorizationRow | null> {
    return this.prisma.orgDataAuthorization.findFirst({
      where: {
        organizationId,
        sourceType: DataAuthorizationSourceType.DIMO,
        status: 'ACTIVE',
      },
      orderBy: { grantedAt: 'desc' },
      select: {
        status: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
  }

  private buildTimestampEvidence(row: LoadedTelemetryVehicleRow): TelemetryTimestampEvidence {
    return {
      providerObservedAt: row.latestState?.sourceTimestamp ?? row.latestState?.lastSeenAt ?? null,
      lastValidTelemetryAt: row.latestState?.lastSeenAt ?? null,
      receivedAt: row.latestState?.providerFetchedAt ?? null,
      lastSignal: row.dimoVehicle?.lastSignal ?? null,
      latestStateUpdatedAt: row.latestState?.updatedAt ?? null,
    };
  }

  private buildDataCoverage(
    row: LoadedTelemetryVehicleRow,
    hasProviderLink: boolean,
    nowMs: number,
  ): FleetDataCoverageResult {
    const raw = row.latestState?.rawPayloadJson as Record<string, unknown> | null;
    const conn = extractConnectivitySnapshot(raw ?? undefined);
    const canonicalTelemetry = resolveTelemetryFreshness(
      this.buildTimestampEvidence(row),
      nowMs,
    );
    const hasAftermarket = row.hardwareType === 'LTE_R1';

    return buildFleetDataCoverage({
      context: {
        provider: resolveFleetProviderClass(
          hasProviderLink,
          row.latestState?.providerSource,
        ),
        deviceClass: resolveFleetDeviceClass({
          hardwareType: row.hardwareType,
          hasAftermarketDevice: hasAftermarket,
          hasSyntheticDevice: false,
          hasProviderLink,
        }),
        powertrain: resolveFleetPowertrainClass(row.fuelType),
        physicalObdCapable: row.hardwareType === 'LTE_R1',
        hasProviderLink,
        hasTelemetrySnapshot: row.latestState != null,
      },
      observation: {
        latitude: row.latestState?.latitude,
        longitude: row.latestState?.longitude,
        odometerKm: row.latestState?.odometerKm,
        speedKmh: row.latestState?.speedKmh,
        fuelLevelRelative: row.latestState?.fuelLevelRelative,
        fuelLevelAbsolute: row.latestState?.fuelLevelAbsolute,
        evSoc: row.latestState?.evSoc,
        obdDtcList: row.latestState?.obdDtcList,
        lastDtcPollAt: row.latestState?.lastDtcPollAt,
        obdIsPluggedIn: conn.obdIsPluggedIn,
        jammingDetectedCount: conn.jammingDetectedCount,
        hasTelemetry: row.latestState != null,
        rawSignals: raw,
      },
      telemetryFreshness: canonicalTelemetry.freshness,
    });
  }

  private classifySignalGroups(dataCoverage: FleetDataCoverageResult): {
    supportedSignalGroups: FleetSignalKey[];
    availableSignalGroups: FleetSignalKey[];
    missingSignalGroups: FleetSignalKey[];
    staleSignalGroups: FleetSignalKey[];
    hasUnsupportedSignals: boolean;
  } {
    const supportedSignalGroups: FleetSignalKey[] = [];
    const availableSignalGroups: FleetSignalKey[] = [];
    const missingSignalGroups: FleetSignalKey[] = [];
    const staleSignalGroups: FleetSignalKey[] = [];
    let hasUnsupportedSignals = false;

    for (const signal of dataCoverage.signals) {
      if (
        signal.capability === SignalCapabilityExpectation.UNSUPPORTED ||
        signal.capability === SignalCapabilityExpectation.NOT_APPLICABLE
      ) {
        if (signal.status === SignalRuntimeStatus.UNSUPPORTED) {
          hasUnsupportedSignals = true;
        }
        continue;
      }

      supportedSignalGroups.push(signal.key);

      if (
        signal.status === SignalRuntimeStatus.AVAILABLE_FRESH ||
        signal.status === SignalRuntimeStatus.AVAILABLE_STALE ||
        signal.status === SignalRuntimeStatus.HISTORICALLY_AVAILABLE
      ) {
        availableSignalGroups.push(signal.key);
      }
      if (signal.status === SignalRuntimeStatus.MISSING) {
        missingSignalGroups.push(signal.key);
      }
      if (
        signal.status === SignalRuntimeStatus.AVAILABLE_STALE ||
        signal.status === SignalRuntimeStatus.HISTORICALLY_AVAILABLE
      ) {
        staleSignalGroups.push(signal.key);
      }
    }

    return {
      supportedSignalGroups,
      availableSignalGroups,
      missingSignalGroups,
      staleSignalGroups,
      hasUnsupportedSignals,
    };
  }

  private buildExplanation(input: {
    semantics: MappedTelemetryAiSemantics;
    runtime: ReturnType<typeof assembleVehicleConnectivityRuntimeBundle>['runtime'];
    canonicalFreshness: ReturnType<typeof resolveTelemetryFreshness>['freshness'];
    hasProviderLink: boolean;
    providerOutage: boolean;
    signalGroups: ReturnType<typeof this.classifySignalGroups>;
    hasStoredTelemetry: boolean;
  }): AiTelemetryStatusExplanation {
    const gpsFresh = input.signalGroups.availableSignalGroups.includes('gps') &&
      !input.signalGroups.staleSignalGroups.includes('gps');
    const dtcFresh = input.signalGroups.availableSignalGroups.includes('dtc') &&
      !input.signalGroups.staleSignalGroups.includes('dtc');

    const connectedButQuiet =
      input.hasProviderLink &&
      (input.canonicalFreshness === 'standby' ||
        input.runtime.overallState === 'STANDBY') &&
      input.hasStoredTelemetry;

    const stateSummary = this.resolveStateSummary({
      telemetrySemantics: input.semantics.telemetrySemantics,
      canonicalFreshness: input.canonicalFreshness,
      hasProviderLink: input.hasProviderLink,
      hasStoredTelemetry: input.hasStoredTelemetry,
      providerOutage: input.providerOutage,
      missingCount: input.signalGroups.missingSignalGroups.length,
      connectedButQuiet,
    });

    return {
      stateSummary,
      canonicalFreshness: input.canonicalFreshness,
      connectedButQuiet,
      lastKnownDataPresent:
        input.hasStoredTelemetry &&
        (input.semantics.telemetrySemantics === 'stale' ||
          input.semantics.telemetrySemantics === 'soft_offline' ||
          input.semantics.telemetrySemantics === 'offline' ||
          input.signalGroups.staleSignalGroups.length > 0),
      providerOutageLikely: input.providerOutage,
      hasUnsupportedSignals: input.signalGroups.hasUnsupportedSignals,
      locationStatementReliable:
        gpsFresh &&
        (input.semantics.telemetrySemantics === 'live' ||
          input.semantics.telemetrySemantics === 'fresh' ||
          input.semantics.telemetrySemantics === 'standby'),
      healthStatementReliable:
        dtcFresh &&
        input.hasProviderLink &&
        input.canonicalFreshness !== 'no_signal' &&
        input.canonicalFreshness !== 'offline',
      usableSignalGroups: input.signalGroups.availableSignalGroups.filter(
        (key: FleetSignalKey) => !input.signalGroups.staleSignalGroups.includes(key),
      ),
      missingSignalGroupsDetail: input.signalGroups.missingSignalGroups,
      staleSignalGroupsDetail: input.signalGroups.staleSignalGroups,
    };
  }

  private resolveStateSummary(input: {
    telemetrySemantics: MappedTelemetryAiSemantics['telemetrySemantics'];
    canonicalFreshness: ReturnType<typeof resolveTelemetryFreshness>['freshness'];
    hasProviderLink: boolean;
    hasStoredTelemetry: boolean;
    providerOutage: boolean;
    missingCount: number;
    connectedButQuiet: boolean;
  }): string {
    if (!input.hasProviderLink) {
      return 'no_provider_link';
    }
    if (input.providerOutage) {
      return 'provider_integration_error';
    }
    if (input.telemetrySemantics === 'unknown' && !input.hasStoredTelemetry) {
      return 'no_telemetry_timestamp';
    }
    if (input.connectedButQuiet) {
      return 'connected_standby_heartbeat';
    }
    if (input.telemetrySemantics === 'live' || input.telemetrySemantics === 'fresh') {
      return 'telemetry_live';
    }
    if (input.telemetrySemantics === 'standby') {
      return 'telemetry_standby_with_stored_data';
    }
    if (input.telemetrySemantics === 'soft_offline') {
      return 'telemetry_soft_offline';
    }
    if (input.telemetrySemantics === 'offline') {
      return input.hasStoredTelemetry
        ? 'telemetry_offline_with_last_known'
        : 'telemetry_offline';
    }
    if (input.telemetrySemantics === 'stale') {
      return 'presenting_last_known_telemetry';
    }
    if (input.missingCount > 0 && input.hasStoredTelemetry) {
      return 'partial_signal_coverage_with_stored_data';
    }
    return `telemetry_${input.canonicalFreshness}`;
  }

  private buildOutcome(input: {
    tenantId: string;
    row: LoadedTelemetryVehicleRow;
    semantics: MappedTelemetryAiSemantics;
    runtimeOverallState: OverallConnectivityState;
    providerConnectionStatus: string | null;
    reasonCodes: string[];
    signalGroups: ReturnType<typeof this.classifySignalGroups>;
    explanation: AiTelemetryStatusExplanation;
    domainErrors: AiDomainError[];
    nowMs: number;
  }): AiDomainQueryOutcome<AiGetVehicleTelemetryStatusData> {
    const observedAt = input.semantics.observedAt;
    const ageSeconds =
      observedAt != null
        ? Math.max(0, Math.round((input.nowMs - Date.parse(observedAt)) / 1000))
        : input.semantics.ageMs != null
          ? Math.round(input.semantics.ageMs / 1000)
          : null;

    const isLastKnownTelemetry =
      input.explanation.lastKnownDataPresent ||
      input.semantics.telemetrySemantics === 'stale' ||
      input.semantics.telemetrySemantics === 'soft_offline' ||
      (input.semantics.telemetrySemantics === 'offline' && observedAt != null);

    const warnings = [
      ...input.semantics.warnings,
      ...(isLastKnownTelemetry ? ['presenting_last_known_telemetry'] : []),
      ...(input.signalGroups.missingSignalGroups.length > 0
        ? ['partial_signal_coverage']
        : []),
      ...(input.explanation.connectedButQuiet ? ['vehicle_connected_but_quiet'] : []),
      ...(input.explanation.providerOutageLikely ? ['provider_outage_suspected'] : []),
    ];

    const uniqueWarnings = [...new Set(warnings)];
    const uniqueReasonCodes = [...new Set(input.reasonCodes)];

    const data: AiGetVehicleTelemetryStatusData = {
      vehicleId: input.row.id,
      displayName: buildAiVehicleDisplayName(input.row),
      licensePlate: input.row.licensePlate,
      telemetryState: input.semantics.telemetrySemantics,
      lastSignalAt: observedAt,
      ageSeconds,
      freshness: input.semantics.freshness,
      connectivityStatus: input.runtimeOverallState,
      providerConnectionStatus: input.providerConnectionStatus,
      supportedSignalGroups: input.signalGroups.supportedSignalGroups,
      availableSignalGroups: input.signalGroups.availableSignalGroups,
      missingSignalGroups: input.signalGroups.missingSignalGroups,
      staleSignalGroups: input.signalGroups.staleSignalGroups,
      source: input.semantics.source,
      reasonCodes: uniqueReasonCodes,
      warnings: uniqueWarnings,
      confidence: input.semantics.confidence,
      reasonCode: input.semantics.reasonCode,
      availability: input.semantics.availability,
      isLastKnownTelemetry,
      explanation: input.explanation,
    };

    const evidence = this.buildEvidence(input.tenantId, data);

    if (input.domainErrors.length > 0 && data.lastSignalAt != null) {
      return buildPartialAiDomainQueryOutcome({
        tenantId: input.tenantId,
        data,
        evidence,
        errors: input.domainErrors,
        warnings: uniqueWarnings,
      });
    }

    if (input.domainErrors.length > 0) {
      return buildAiDomainQueryOutcome<AiGetVehicleTelemetryStatusData>({
        tenantId: input.tenantId,
        data: null,
        evidence,
        errors: input.domainErrors,
        warnings: uniqueWarnings,
      });
    }

    return buildAiDomainQueryOutcome({
      tenantId: input.tenantId,
      data,
      evidence,
      errors: [],
      warnings: uniqueWarnings,
    });
  }

  private buildEvidence(
    tenantId: string,
    data: AiGetVehicleTelemetryStatusData,
  ): AiEvidence[] {
    if (!data.lastSignalAt) {
      return [];
    }

    return [
      createObservedAiEvidence({
        tenantId,
        entityId: data.vehicleId,
        source: data.source,
        sourceEntity: { kind: 'vehicle', id: data.vehicleId },
        observedAt: data.lastSignalAt,
        freshness: data.freshness,
        confidence: data.confidence,
        availability: data.availability,
        reasonCode: data.reasonCode,
        sensitivity: 'internal',
        warnings: data.warnings,
        value: {
          telemetryState: data.telemetryState,
          connectivityStatus: data.connectivityStatus,
          supportedSignalGroups: data.supportedSignalGroups,
          availableSignalGroups: data.availableSignalGroups,
          missingSignalGroups: data.missingSignalGroups,
          staleSignalGroups: data.staleSignalGroups,
          isLastKnownTelemetry: data.isLastKnownTelemetry,
          stateSummary: data.explanation.stateSummary,
          canonicalFreshness: data.explanation.canonicalFreshness,
          connectedButQuiet: data.explanation.connectedButQuiet,
          lastKnownDataPresent: data.explanation.lastKnownDataPresent,
          providerOutageLikely: data.explanation.providerOutageLikely,
          locationStatementReliable: data.explanation.locationStatementReliable,
          healthStatementReliable: data.explanation.healthStatementReliable,
        },
      }),
    ];
  }

  private blockedOutcome(
    tenantId: string,
    error: AiDomainError,
  ): AiDomainQueryOutcome<AiGetVehicleTelemetryStatusData> {
    return buildAiDomainQueryOutcome<AiGetVehicleTelemetryStatusData>({
      tenantId,
      data: null,
      evidence: [],
      errors: [error],
      warnings: [`${AI_GET_VEHICLE_TELEMETRY_STATUS_TOOL}:blocked`],
    });
  }
}
