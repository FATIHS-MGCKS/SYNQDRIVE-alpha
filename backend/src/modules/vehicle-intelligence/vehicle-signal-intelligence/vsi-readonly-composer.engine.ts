import {
  classifyTelemetryFreshness,
  TELEMETRY_FRESH_THRESHOLD_MS,
} from '../../vehicles/vehicle-state-interpreter';
import {
  evaluateCanonicalProviderNativeAlias,
  getVsiCanonicalSignalDefinition,
} from './canonical-signal-keys';
import {
  VSI_EVIDENCE_CONTRACT_VERSION,
  VsiAuthorizationRequestKind,
  VsiAuthorizationStatus,
  VsiEmpiricalObservationStatus,
  VsiProviderCatalogStatus,
  VsiSignalQualityStatus,
  buildVsiEvidenceScopeKey,
  deriveAuthorizationFromHttpStatus,
  deriveEmpiricalObservationFromSamples,
  deriveProviderCatalogStatus,
  evaluateStrictSourceAdvance,
  type VsiProviderSourceLinkRef,
  type VsiVehicleSignalEvidenceDescriptorV1,
} from './vehicle-signal-evidence.contract';
import type { VsiConnectionIdentityProjection } from './vsi-readonly-composer.types';
import type {
  VsiLatestStateSnapshot,
  VsiPollLogRow,
  VsiP1SignalKey,
  VsiReadonlyComposerResult,
  VsiSourceLinkRow,
} from './vsi-readonly-composer.types';
import { VSI_READONLY_COMPOSER_VERSION, VSI_P1_SIGNAL_KEYS } from './vsi-readonly-composer.types';
import { projectConnectionIdentitiesFromLinks } from './vsi-connection-identity-projection';
import type { VehicleRegistryLifecycle } from '@prisma/client';

type RawSignalNode = { timestamp?: string | number | null; value?: unknown };

function readRawSignal(
  raw: unknown,
  signalName: string,
): { listed: boolean; value: number | null; sourceMs: number | null } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { listed: false, value: null, sourceMs: null };
  }
  const root = raw as Record<string, unknown>;
  const node = root[signalName] as RawSignalNode | undefined;
  if (node == null) {
    return { listed: false, value: null, sourceMs: null };
  }
  const listed = true;
  const valueRaw = node.value;
  const value =
    typeof valueRaw === 'number' && Number.isFinite(valueRaw) ? valueRaw : null;
  let sourceMs: number | null = null;
  if (node.timestamp != null) {
    const ms =
      typeof node.timestamp === 'number'
        ? node.timestamp
        : Date.parse(String(node.timestamp));
    sourceMs = Number.isFinite(ms) ? ms : null;
  }
  return { listed, value, sourceMs };
}

function mapFreshnessToDescriptor(
  freshness: ReturnType<typeof classifyTelemetryFreshness>,
): 'FRESH' | 'STALE' | 'UNKNOWN' {
  if (freshness === 'live' || freshness === 'standby') return 'FRESH';
  if (freshness === 'signal_delayed' || freshness === 'offline') return 'STALE';
  return 'UNKNOWN';
}

function linkRef(linkId: string | 'UNRESOLVED', reason?: string): VsiProviderSourceLinkRef {
  if (linkId === 'UNRESOLVED') {
    return { kind: 'unresolved', reason: reason ?? 'UNRESOLVED_SOURCE_LINK' };
  }
  return { kind: 'resolved', providerSourceLinkId: linkId };
}

function baseDescriptor(input: {
  organizationId: string;
  vehicleId: string;
  projectionAsOf: Date;
  provider: string;
  linkRef: VsiProviderSourceLinkRef;
  canonicalSignalKey: VsiP1SignalKey;
  identity: VsiConnectionIdentityProjection;
  limitations: string[];
}): VsiVehicleSignalEvidenceDescriptorV1 {
  const def = getVsiCanonicalSignalDefinition(input.canonicalSignalKey);
  return {
    contractVersion: VSI_EVIDENCE_CONTRACT_VERSION,
    projectionAsOf: input.projectionAsOf,
    identity: {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      providerIdentity: input.provider,
      providerSourceLinkRef: input.linkRef,
      canonicalSignalKey: input.canonicalSignalKey,
    },
    providerNativeSignalName: def.primaryDimoSignalName ?? 'UNKNOWN',
    timestamps: {
      source: 'NOT_MEASURED',
      observed: 'NOT_MEASURED',
      received: 'NOT_MEASURED',
      persisted: 'NOT_MEASURED',
    },
    capability: {
      providerCatalog: VsiProviderCatalogStatus.UNKNOWN,
      empiricalObservation: VsiEmpiricalObservationStatus.NEVER_OBSERVED,
      authorization: VsiAuthorizationStatus.UNKNOWN,
      signalQuality: VsiSignalQualityStatus.UNKNOWN,
    },
    freshnessClassification: 'UNKNOWN',
    cadenceMsP50: 'NOT_MEASURED',
    cadenceMsP95: 'NOT_MEASURED',
    confidenceLimitations: [
      ...input.identity.confidenceLimitations,
      ...input.limitations,
    ] as string[],
  };
}

export function composeReadonlyVehicleSignals(input: {
  organizationId: string;
  vehicleId: string;
  registryLifecycle: VehicleRegistryLifecycle | 'UNKNOWN';
  hardwareTypeLegacy: string;
  projectionAsOf: Date;
  links: readonly VsiSourceLinkRow[];
  latestState: VsiLatestStateSnapshot | null;
  pollLogs: readonly VsiPollLogRow[];
  offboarded?: boolean;
}): VsiReadonlyComposerResult {
  const identityProjections = projectConnectionIdentitiesFromLinks(input.links);
  const signals: VsiVehicleSignalEvidenceDescriptorV1[] = [];
  const nowMs = input.projectionAsOf.getTime();

  const targetLinks =
    input.links.length > 0
      ? input.links
      : [
          {
            id: 'UNRESOLVED' as const,
            provider: 'UNKNOWN',
            isActive: false,
            metadata: null,
          },
        ];

  for (const link of targetLinks) {
    const identity =
      identityProjections.find((p) => p.providerSourceLinkId === link.id) ??
      identityProjections[0] ?? {
        provider: link.provider,
        providerSourceLinkId: 'UNRESOLVED',
        verifiedModality: 'UNRESOLVED',
        physicalDeviceReference: 'UNRESOLVED',
        telemetrySourceFamily: 'UNRESOLVED',
        treatsAsPhysicalHardwareDevice: false,
        confidenceLimitations: ['NO_CONNECTION_IDENTITY_PROJECTION'],
      };

    const provider = link.provider || 'UNKNOWN';
    const ref = linkRef(
      link.id === 'UNRESOLVED' ? 'UNRESOLVED' : link.id,
      'NO_ACTIVE_SOURCE_LINK',
    );

    const bindingMatches =
      input.latestState?.providerBindingId == null ||
      link.id === 'UNRESOLVED' ||
      input.latestState.providerBindingId === link.id;

    const authStatus =
      input.offboarded
        ? VsiAuthorizationStatus.AUTH_BLOCKED
        : bindingMatches
          ? VsiAuthorizationStatus.UNKNOWN
          : VsiAuthorizationStatus.UNKNOWN;

    const pollSuccessRecent = input.pollLogs.some((p) => p.status === 'SUCCESS');
    const lastPoll = input.pollLogs[0];
    const pollHttpAuth = deriveAuthorizationFromHttpStatus(
      lastPoll?.status === 'SUCCESS' ? 200 : lastPoll ? 500 : null,
      {
        requestKind: VsiAuthorizationRequestKind.TELEMETRY_FETCH,
        sourceLinkProven: ref.kind === 'resolved' ? true : 'UNKNOWN',
      },
    );

    const previousSourceMs =
      input.pollLogs.length >= 2 && input.latestState?.sourceTimestamp
        ? input.latestState.sourceTimestamp.getTime()
        : null;
    const strictAdvance = evaluateStrictSourceAdvance({
      previousSourceMs,
      latestSourceMs: input.latestState?.sourceTimestamp?.getTime() ?? null,
    });

    for (const key of VSI_P1_SIGNAL_KEYS) {
      const limitations: string[] = [];
      if (!bindingMatches) {
        limitations.push('LATEST_STATE_PROVIDER_BINDING_MISMATCH');
      }
      if (input.offboarded) {
        limitations.push('VEHICLE_REGISTRY_OFFBOARDED');
      }
      if (!identity.treatsAsPhysicalHardwareDevice && key === 'lv_voltage') {
        limitations.push('LV_INTERPRETATION_REQUIRES_HARDWARE_OR_EXPLICIT_MAPPING');
      }

      const descriptor = baseDescriptor({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        projectionAsOf: input.projectionAsOf,
        provider,
        linkRef: ref,
        canonicalSignalKey: key,
        identity,
        limitations,
      });

      descriptor.capability.authorization = input.offboarded
        ? VsiAuthorizationStatus.AUTH_BLOCKED
        : pollHttpAuth;

      if (input.latestState) {
        descriptor.timestamps.persisted = input.latestState.updatedAt;
        descriptor.timestamps.received = input.latestState.providerFetchedAt ?? 'NOT_MEASURED';
        descriptor.timestamps.observed =
          input.latestState.sourceTimestamp ?? 'NOT_MEASURED';
        descriptor.timestamps.source = input.latestState.sourceTimestamp ?? 'NOT_MEASURED';
      }

      if (key === 'provider_source_timestamp') {
        const src = input.latestState?.sourceTimestamp;
        descriptor.providerNativeSignalName = 'provider_source_timestamp';
        descriptor.empiricalEvidence = {
          observationStatus: src
            ? VsiEmpiricalObservationStatus.OBSERVED
            : VsiEmpiricalObservationStatus.NEVER_OBSERVED,
          lastObservedAt: src ?? 'NOT_MEASURED',
          lastSourceTimestamp: src ?? 'NOT_MEASURED',
          strictSourceAdvanced: strictAdvance,
          sampleCountInWindow: src ? 1 : 0,
          evidenceOrigin: 'VEHICLE_LATEST_STATE',
        };
        if (pollSuccessRecent && strictAdvance === false) {
          descriptor.confidenceLimitations = [
            ...descriptor.confidenceLimitations,
            'POLL_SUCCESS_WITHOUT_STRICT_SOURCE_ADVANCE',
          ];
        }
        descriptor.capability.empiricalObservation = src
          ? VsiEmpiricalObservationStatus.OBSERVED
          : VsiEmpiricalObservationStatus.NEVER_OBSERVED;
      }

      if (key === 'device_connectivity' && input.latestState) {
        const observedMs = input.latestState.sourceTimestamp?.getTime() ?? null;
        const freshness =
          observedMs != null
            ? classifyTelemetryFreshness(new Date(observedMs), nowMs)
            : 'no_signal';
        descriptor.freshnessClassification = mapFreshnessToDescriptor(freshness);
        descriptor.capability.empiricalObservation =
          observedMs != null
            ? deriveEmpiricalObservationFromSamples({ usableSampleCount: 1 })
            : VsiEmpiricalObservationStatus.NEVER_OBSERVED;
        descriptor.empiricalEvidence = {
          observationStatus: descriptor.capability.empiricalObservation,
          lastObservedAt: input.latestState.sourceTimestamp ?? 'NOT_MEASURED',
          lastSourceTimestamp: input.latestState.sourceTimestamp ?? 'NOT_MEASURED',
          strictSourceAdvanced: strictAdvance,
          sampleCountInWindow: observedMs != null ? 1 : 0,
          evidenceOrigin: 'VEHICLE_LATEST_STATE',
          reference: input.latestState.online ? 'online=true' : 'online=false',
        };
        descriptor.confidenceLimitations = [
          ...descriptor.confidenceLimitations,
          `FRESHNESS_RULE=classifyTelemetryFreshness;LIVE_THRESHOLD_MS=${TELEMETRY_FRESH_THRESHOLD_MS}`,
        ];
      }

      if (key === 'lv_voltage' && input.latestState && bindingMatches) {
        const def = getVsiCanonicalSignalDefinition('lv_voltage');
        const rawName = def.primaryDimoSignalName ?? 'lowVoltageBatteryCurrentVoltage';
        const raw = readRawSignal(input.latestState.rawPayloadJson, rawName);
        const columnValue = input.latestState.lvBatteryVoltage;
        const value = columnValue ?? raw.value;
        descriptor.catalogEvidence = {
          listed: raw.listed,
          providerNativeSignalName: rawName,
          checkedAt: input.projectionAsOf,
          evidenceOrigin: 'VEHICLE_LATEST_STATE',
        };
        descriptor.capability.providerCatalog = deriveProviderCatalogStatus(raw.listed);
        if (raw.listed && value == null) {
          descriptor.capability.empiricalObservation =
            VsiEmpiricalObservationStatus.NEVER_OBSERVED;
          descriptor.confidenceLimitations = [
            ...descriptor.confidenceLimitations,
            'CATALOG_LISTED_NOT_OBSERVED',
          ];
        } else if (value != null) {
          descriptor.capability.empiricalObservation =
            VsiEmpiricalObservationStatus.OBSERVED;
          descriptor.capability.signalQuality = VsiSignalQualityStatus.VALID;
        }
      }

      if (key === 'hv_battery_soc' && input.latestState && bindingMatches) {
        const def = getVsiCanonicalSignalDefinition('hv_battery_soc');
        const physicalName = def.primaryDimoSignalName ?? 'powertrainTractionBatteryStateOfChargeCurrent';
        const displayAlias = 'powertrainTractionBatteryStateOfChargeDisplay';
        const aliasVerdict = evaluateCanonicalProviderNativeAlias('hv_battery_soc', displayAlias);
        const physicalRaw = readRawSignal(input.latestState.rawPayloadJson, physicalName);
        const displayRaw = readRawSignal(input.latestState.rawPayloadJson, displayAlias);
        const columnSoc = input.latestState.evSoc;

        const hvLimitations: string[] = [];
        if (aliasVerdict === 'ALIAS_CONFLICT_UNRESOLVED' && displayRaw.listed) {
          hvLimitations.push('DISPLAY_SOC_ALIAS_CONFLICT_UNRESOLVED');
        }
        const usePhysical =
          physicalRaw.value != null
            ? physicalRaw.value
            : columnSoc != null && displayRaw.value == null
              ? columnSoc
              : null;
        if (displayRaw.value != null && physicalRaw.value == null) {
          hvLimitations.push('HV_PHYSICAL_SOC_MISSING_DISPLAY_PRESENT');
        }
        descriptor.catalogEvidence = {
          listed: physicalRaw.listed || displayRaw.listed,
          providerNativeSignalName: physicalName,
          checkedAt: input.projectionAsOf,
          evidenceOrigin: 'VEHICLE_LATEST_STATE',
        };
        descriptor.capability.providerCatalog = deriveProviderCatalogStatus(
          physicalRaw.listed || displayRaw.listed,
        );
        descriptor.capability.empiricalObservation =
          usePhysical != null
            ? VsiEmpiricalObservationStatus.OBSERVED
            : physicalRaw.listed || displayRaw.listed
              ? VsiEmpiricalObservationStatus.NEVER_OBSERVED
              : VsiEmpiricalObservationStatus.NEVER_OBSERVED;
        if (physicalRaw.listed && usePhysical == null) {
          hvLimitations.push('CATALOG_LISTED_NOT_OBSERVED');
        }
        if (hvLimitations.length > 0) {
          descriptor.confidenceLimitations = [
            ...descriptor.confidenceLimitations,
            ...hvLimitations,
          ];
        }
      }

      // Scope key sanity (throws on invalid tenant scope in tests)
      buildVsiEvidenceScopeKey({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        providerIdentity: provider,
        providerSourceLinkRef: ref,
        canonicalSignalKey: key,
      });

      signals.push(descriptor);
    }
  }

  return {
    contractVersion: VSI_READONLY_COMPOSER_VERSION,
    projectionAsOf: input.projectionAsOf,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    registryLifecycle: input.registryLifecycle,
    hardwareTypeLegacy: input.hardwareTypeLegacy,
    identityProjections,
    signals,
    apdsConsumptionBoundary: {
      wiredToShadowDecisionPath: false,
      stratifyByConnectionIdentity: true,
      teslaSoftwareIntegrationDistinctFromRuptelaR1: true,
    },
  };
}
