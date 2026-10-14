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
  VsiAuthorizationStatus,
  VsiEmpiricalObservationStatus,
  VsiProviderCatalogStatus,
  VsiSignalQualityStatus,
  buildVsiEvidenceScopeKey,
  deriveEmpiricalObservationFromSamples,
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
import {
  isLatestStateAttributedToLink,
  isRegistryNonOperational,
  orgProviderConsentAuthorizationLimitation,
  resolveScopedTelemetryAuthorization,
  resolveStrictSourceAdvanceEvidence,
} from './vsi-readonly-composer.evidence';
import type { VehicleRegistryLifecycle } from '@prisma/client';

type RawSignalNode = { timestamp?: string | number | null; value?: unknown };

const FUTURE_TIMESTAMP_TOLERANCE_MS = 60_000;

function readRawSignal(
  raw: unknown,
  signalName: string,
): { keyPresent: boolean; value: number | null; sourceMs: number | null } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { keyPresent: false, value: null, sourceMs: null };
  }
  const root = raw as Record<string, unknown>;
  const node = root[signalName] as RawSignalNode | undefined;
  if (node == null) {
    return { keyPresent: false, value: null, sourceMs: null };
  }
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
  return { keyPresent: true, value, sourceMs };
}

function mapFreshnessToDescriptor(
  freshness: ReturnType<typeof classifyTelemetryFreshness>,
): 'FRESH' | 'STALE' | 'UNKNOWN' {
  if (freshness === 'live' || freshness === 'standby') return 'FRESH';
  if (freshness === 'signal_delayed' || freshness === 'offline') return 'STALE';
  return 'UNKNOWN';
}

function resolveSignalTimestampEvidence(input: {
  signalSourceMs: number | null;
  projectionAsOfMs: number;
}): {
  source: Date | 'NOT_MEASURED';
  observed: Date | 'NOT_MEASURED';
  freshness: 'FRESH' | 'STALE' | 'UNKNOWN';
  limitations: string[];
} {
  const { signalSourceMs, projectionAsOfMs } = input;
  if (signalSourceMs == null) {
    return {
      source: 'NOT_MEASURED',
      observed: 'NOT_MEASURED',
      freshness: 'UNKNOWN',
      limitations: [],
    };
  }
  if (signalSourceMs > projectionAsOfMs + FUTURE_TIMESTAMP_TOLERANCE_MS) {
    return {
      source: 'NOT_MEASURED',
      observed: 'NOT_MEASURED',
      freshness: 'UNKNOWN',
      limitations: ['FUTURE_SIGNAL_TIMESTAMP_REJECTED'],
    };
  }
  const at = new Date(signalSourceMs);
  const freshness = mapFreshnessToDescriptor(
    classifyTelemetryFreshness(at, projectionAsOfMs),
  );
  return { source: at, observed: at, freshness, limitations: [] };
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
  /** Independently established prior aggregated provider source time (never from poll logs). */
  priorAggregatedSourceTimestamp?: Date | null;
  linksQueryCapReached?: boolean;
}): VsiReadonlyComposerResult {
  const identityProjections = projectConnectionIdentitiesFromLinks(input.links, {
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
  });
  const signals: VsiVehicleSignalEvidenceDescriptorV1[] = [];
  const nowMs = input.projectionAsOf.getTime();
  const registryNonOperational = isRegistryNonOperational(input.registryLifecycle);
  const activeLinkCount = input.links.filter((l) => l.isActive).length;

  const strictAdvance = resolveStrictSourceAdvanceEvidence({
    priorAggregatedSourceTimestamp: input.priorAggregatedSourceTimestamp,
    currentAggregatedSourceTimestamp: input.latestState?.sourceTimestamp,
  });

  const pollSuccessRecent = input.pollLogs.some((p) => p.status === 'SUCCESS');

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

    const stateAttributed = isLatestStateAttributedToLink({
      latestState: input.latestState,
      link,
      activeLinkCount: activeLinkCount || targetLinks.length,
    });

    const limitations: string[] = [];
    if (input.linksQueryCapReached) {
      limitations.push('ACTIVE_SOURCE_LINK_QUERY_CAP_REACHED');
    }
    if (!stateAttributed && input.latestState && link.id !== 'UNRESOLVED') {
      limitations.push('LATEST_STATE_NOT_ATTRIBUTED_TO_SOURCE_LINK');
    }
    if (registryNonOperational) {
      limitations.push('VEHICLE_REGISTRY_NON_OPERATIONAL');
    }
    if (!identity.treatsAsPhysicalHardwareDevice && link.id !== 'UNRESOLVED') {
      limitations.push('PHYSICAL_DEVICE_PRESENCE_NOT_PROVEN');
    }
    const consentLimitation = orgProviderConsentAuthorizationLimitation(
      link.scopedOrgProviderConsentValid,
    );
    if (consentLimitation) {
      limitations.push(consentLimitation);
    }

    const authorization = resolveScopedTelemetryAuthorization();

    for (const key of VSI_P1_SIGNAL_KEYS) {
      const signalLimitations = [...limitations];
      if (!identity.treatsAsPhysicalHardwareDevice && key === 'lv_voltage') {
        signalLimitations.push('LV_INTERPRETATION_REQUIRES_HARDWARE_OR_EXPLICIT_MAPPING');
      }

      const descriptor = baseDescriptor({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        projectionAsOf: input.projectionAsOf,
        provider,
        linkRef: ref,
        canonicalSignalKey: key,
        identity,
        limitations: signalLimitations,
      });

      descriptor.capability.authorization = authorization;

      if (input.latestState && stateAttributed) {
        descriptor.timestamps.persisted = input.latestState.updatedAt;
        descriptor.timestamps.received = input.latestState.providerFetchedAt ?? 'NOT_MEASURED';
        if (key === 'provider_source_timestamp' || key === 'device_connectivity') {
          descriptor.timestamps.observed =
            input.latestState.sourceTimestamp ?? 'NOT_MEASURED';
          descriptor.timestamps.source = input.latestState.sourceTimestamp ?? 'NOT_MEASURED';
        }
      }

      if (key === 'provider_source_timestamp') {
        const src = stateAttributed ? input.latestState?.sourceTimestamp : null;
        descriptor.providerNativeSignalName = 'provider_source_timestamp';
        descriptor.empiricalEvidence = {
          observationStatus: src
            ? VsiEmpiricalObservationStatus.OBSERVED
            : VsiEmpiricalObservationStatus.NEVER_OBSERVED,
          lastObservedAt: src ?? 'NOT_MEASURED',
          lastSourceTimestamp: src ?? 'NOT_MEASURED',
          strictSourceAdvanced: strictAdvance,
          sampleCountInWindow: 'NOT_MEASURED',
          evidenceOrigin: stateAttributed ? 'VEHICLE_LATEST_STATE' : 'UNKNOWN',
        };
        if (pollSuccessRecent && strictAdvance === false) {
          descriptor.confidenceLimitations = [
            ...descriptor.confidenceLimitations,
            'POLL_SUCCESS_WITHOUT_STRICT_SOURCE_ADVANCE',
          ];
        }
        if (pollSuccessRecent && strictAdvance === 'UNKNOWN') {
          descriptor.confidenceLimitations = [
            ...descriptor.confidenceLimitations,
            'STRICT_SOURCE_ADVANCE_EVIDENCE_UNAVAILABLE',
          ];
        }
        descriptor.capability.empiricalObservation = src
          ? VsiEmpiricalObservationStatus.OBSERVED
          : VsiEmpiricalObservationStatus.NEVER_OBSERVED;
      }

      if (key === 'device_connectivity' && input.latestState && stateAttributed) {
        const observedMs = input.latestState.sourceTimestamp?.getTime() ?? null;
        const freshness =
          observedMs != null
            ? classifyTelemetryFreshness(new Date(observedMs), nowMs)
            : 'no_signal';
        descriptor.freshnessClassification =
          observedMs != null ? mapFreshnessToDescriptor(freshness) : 'UNKNOWN';
        descriptor.capability.empiricalObservation =
          observedMs != null
            ? deriveEmpiricalObservationFromSamples({ usableSampleCount: 1 })
            : VsiEmpiricalObservationStatus.NEVER_OBSERVED;
        descriptor.empiricalEvidence = {
          observationStatus: descriptor.capability.empiricalObservation,
          lastObservedAt: input.latestState.sourceTimestamp ?? 'NOT_MEASURED',
          lastSourceTimestamp: input.latestState.sourceTimestamp ?? 'NOT_MEASURED',
          strictSourceAdvanced: strictAdvance,
          sampleCountInWindow: 'NOT_MEASURED',
          evidenceOrigin: 'VEHICLE_LATEST_STATE',
          reference: input.latestState.online ? 'online=true' : 'online=false',
        };
        descriptor.confidenceLimitations = [
          ...descriptor.confidenceLimitations,
          `FRESHNESS_RULE=classifyTelemetryFreshness;LIVE_THRESHOLD_MS=${TELEMETRY_FRESH_THRESHOLD_MS}`,
          'CONNECTIVITY_TELEMETRY_FRESHNESS_NOT_PHYSICAL_MODEM_PROOF',
        ];
      }

      if (key === 'lv_voltage' && input.latestState && stateAttributed) {
        const def = getVsiCanonicalSignalDefinition('lv_voltage');
        const rawName = def.primaryDimoSignalName ?? 'lowVoltageBatteryCurrentVoltage';
        const raw = readRawSignal(input.latestState.rawPayloadJson, rawName);
        const columnValue = input.latestState.lvBatteryVoltage;
        const value = columnValue ?? raw.value;
        if (raw.keyPresent) {
          descriptor.confidenceLimitations = [
            ...descriptor.confidenceLimitations,
            'RAW_SNAPSHOT_KEY_PRESENT_NOT_PROVIDER_CATALOG_PROOF',
          ];
        }
        const tsEvidence = resolveSignalTimestampEvidence({
          signalSourceMs: raw.sourceMs,
          projectionAsOfMs: nowMs,
        });
        descriptor.timestamps.source = tsEvidence.source;
        descriptor.timestamps.observed = tsEvidence.observed;
        descriptor.freshnessClassification = tsEvidence.freshness;
        if (tsEvidence.limitations.length > 0) {
          descriptor.confidenceLimitations = [
            ...descriptor.confidenceLimitations,
            ...tsEvidence.limitations,
          ];
        }
        if (raw.keyPresent && value == null) {
          descriptor.capability.empiricalObservation =
            VsiEmpiricalObservationStatus.NEVER_OBSERVED;
          descriptor.confidenceLimitations = [
            ...descriptor.confidenceLimitations,
            'RAW_SNAPSHOT_KEY_NULL_VALUE_NOT_PHYSICAL_OBSERVATION',
          ];
        } else if (value != null) {
          descriptor.capability.empiricalObservation =
            VsiEmpiricalObservationStatus.OBSERVED;
          descriptor.capability.signalQuality = VsiSignalQualityStatus.VALID;
          if (raw.sourceMs == null) {
            descriptor.freshnessClassification = 'UNKNOWN';
            descriptor.confidenceLimitations = [
              ...descriptor.confidenceLimitations,
              'SIGNAL_VALUE_WITHOUT_KNOWN_OBSERVATION_TIME',
            ];
          }
        }
      }

      if (key === 'hv_battery_soc' && input.latestState && stateAttributed) {
        const def = getVsiCanonicalSignalDefinition('hv_battery_soc');
        const physicalName = def.primaryDimoSignalName ?? 'powertrainTractionBatteryStateOfChargeCurrent';
        const displayAlias = 'powertrainTractionBatteryStateOfChargeDisplay';
        const aliasVerdict = evaluateCanonicalProviderNativeAlias('hv_battery_soc', displayAlias);
        const physicalRaw = readRawSignal(input.latestState.rawPayloadJson, physicalName);
        const displayRaw = readRawSignal(input.latestState.rawPayloadJson, displayAlias);

        const hvLimitations: string[] = [];
        if (aliasVerdict === 'ALIAS_CONFLICT_UNRESOLVED' && displayRaw.keyPresent) {
          hvLimitations.push('DISPLAY_SOC_ALIAS_CONFLICT_UNRESOLVED');
        }
        const usePhysical = physicalRaw.value;
        if (displayRaw.value != null && physicalRaw.value == null) {
          hvLimitations.push('HV_PHYSICAL_SOC_MISSING_DISPLAY_PRESENT');
        }
        if (input.latestState.evSoc != null && physicalRaw.value == null) {
          hvLimitations.push('EV_SOC_COLUMN_NOT_PHYSICAL_BMS_PROVENANCE');
        }
        if (physicalRaw.keyPresent || displayRaw.keyPresent) {
          hvLimitations.push('RAW_SNAPSHOT_KEY_PRESENT_NOT_PROVIDER_CATALOG_PROOF');
        }
        const tsEvidence = resolveSignalTimestampEvidence({
          signalSourceMs: physicalRaw.sourceMs,
          projectionAsOfMs: nowMs,
        });
        descriptor.timestamps.source = tsEvidence.source;
        descriptor.timestamps.observed = tsEvidence.observed;
        descriptor.freshnessClassification =
          usePhysical != null ? tsEvidence.freshness : 'UNKNOWN';
        if (tsEvidence.limitations.length > 0) {
          hvLimitations.push(...tsEvidence.limitations);
        }
        descriptor.capability.empiricalObservation =
          usePhysical != null
            ? VsiEmpiricalObservationStatus.OBSERVED
            : VsiEmpiricalObservationStatus.NEVER_OBSERVED;
        if (usePhysical != null && physicalRaw.sourceMs == null) {
          descriptor.freshnessClassification = 'UNKNOWN';
          hvLimitations.push('SIGNAL_VALUE_WITHOUT_KNOWN_OBSERVATION_TIME');
        }
        if (hvLimitations.length > 0) {
          descriptor.confidenceLimitations = [
            ...descriptor.confidenceLimitations,
            ...hvLimitations,
          ];
        }
      }

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
