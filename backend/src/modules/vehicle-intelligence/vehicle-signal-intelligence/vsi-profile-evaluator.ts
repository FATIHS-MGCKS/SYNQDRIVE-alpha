import { getVsiCanonicalSignalDefinition } from './canonical-signal-keys';
import { composeReadonlyVehicleSignals } from './vsi-readonly-composer.engine';
import type { VsiDeclaredCatalogSnapshot } from './vsi-declared-catalog.resolver';
import { VsiDeclaredCatalogResolver } from './vsi-declared-catalog.resolver';
import type { VsiConnectionIdentityProjection } from './vsi-readonly-composer.types';
import type {
  VsiLatestStateSnapshot,
  VsiPollLogRow,
  VsiSourceLinkRow,
} from './vsi-readonly-composer.types';
import {
  VSI_PROFILE_CONTRACT_VERSION,
  VSI_PROFILE_MATERIALIZATION_KEYS,
  mapVsiCatalogToDeclaredSupport,
  type VsiProfileEvaluationDraft,
  type VsiProfileSignalSnapshotV1,
} from './vsi-profile.types';
import {
  resolveStrictSourceAdvanceEvidence,
  isLatestStateAttributedToLink,
} from './vsi-readonly-composer.evidence';
import type { VehicleRegistryLifecycle } from '@prisma/client';
import {
  VsiEmpiricalObservationStatus,
  type VsiEvidenceOrigin,
} from './vehicle-signal-evidence.contract';

export type VsiProfileEvaluatorInput = {
  organizationId: string;
  vehicleId: string;
  registryLifecycle: VehicleRegistryLifecycle | 'UNKNOWN';
  hardwareTypeLegacy: string;
  link: VsiSourceLinkRow;
  identity: VsiConnectionIdentityProjection;
  latestState: VsiLatestStateSnapshot | null;
  pollLogs: readonly VsiPollLogRow[];
  declaredCatalog: VsiDeclaredCatalogSnapshot;
  priorAggregatedSourceTimestamp?: Date | null;
  priorProvenStrictSourceAdvanceAt?: Date | null;
  projectionAsOf?: Date;
};

function isoOrNull(
  value: Date | 'NOT_MEASURED' | 'UNKNOWN' | null | undefined,
): string | null {
  if (value instanceof Date) return value.toISOString();
  return null;
}

function mergeEmpiricalRow(
  key: (typeof VSI_PROFILE_MATERIALIZATION_KEYS)[number],
  composerSignals: ReturnType<typeof composeReadonlyVehicleSignals>['signals'],
  declaredCatalog: VsiDeclaredCatalogSnapshot,
  catalogResolver: Pick<VsiDeclaredCatalogResolver, 'catalogForCanonicalKey'>,
): VsiProfileSignalSnapshotV1 {
  const def = getVsiCanonicalSignalDefinition(key);
  const native = def.primaryDimoSignalName ?? key;
  const descriptor = composerSignals.find((s) => s.identity.canonicalSignalKey === key);
  const declared = mapVsiCatalogToDeclaredSupport(
    catalogResolver.catalogForCanonicalKey(declaredCatalog, key),
  );

  const empirical =
    descriptor?.capability.empiricalObservation ?? VsiEmpiricalObservationStatus.NEVER_OBSERVED;
  const freshness =
    descriptor?.freshnessClassification === 'FRESH' ||
    descriptor?.freshnessClassification === 'STALE'
      ? descriptor.freshnessClassification
      : 'UNKNOWN';

  const strictAdvance =
    descriptor?.empiricalEvidence?.strictSourceAdvanced ??
    (key === 'provider_source_timestamp' ? 'UNKNOWN' : 'UNKNOWN');

  const provenance = new Set<string>();
  if (descriptor?.empiricalEvidence?.evidenceOrigin) {
    provenance.add(descriptor.empiricalEvidence.evidenceOrigin);
  }
  if (declared !== 'UNKNOWN') {
    provenance.add('DIMO_PREFLIGHT');
  }

  const limitations = [
    ...(descriptor?.confidenceLimitations ?? []),
    ...(declaredCatalog.limitations ?? []),
  ];

  return {
    canonicalSignalKey: key,
    providerNativeSignalName: native,
    declaredSupport: declared,
    empiricalObservation: empirical,
    lastValidObservationAt: isoOrNull(descriptor?.timestamps.observed ?? null),
    lastSourceTimestamp: isoOrNull(descriptor?.timestamps.source ?? null),
    lastProviderFetchAt: isoOrNull(descriptor?.timestamps.received ?? null),
    lastProvenStrictSourceAdvanceAt: null,
    strictSourceAdvanced: strictAdvance,
    freshnessClassification: freshness,
    evidenceProvenance: [...provenance] as VsiProfileSignalSnapshotV1['evidenceProvenance'],
    limitations,
  };
}

export function evaluateVsiSignalProfile(
  input: VsiProfileEvaluatorInput,
  catalogResolver: VsiDeclaredCatalogResolver,
): VsiProfileEvaluationDraft {
  const projectionAsOf = input.projectionAsOf ?? new Date();
  const profileLimitations: string[] = [...input.declaredCatalog.limitations];

  if (!input.identity.treatsAsPhysicalHardwareDevice) {
    profileLimitations.push('SOFTWARE_INTEGRATION_STRATIFICATION_ACTIVE');
  }

  const stateAttributed =
    input.latestState != null &&
    isLatestStateAttributedToLink({
      latestState: input.latestState,
      link: input.link,
      activeLinkCount: 1,
    });

  if (input.latestState && !stateAttributed) {
    profileLimitations.push('LATEST_STATE_NOT_ATTRIBUTED_TO_SOURCE_LINK');
  }

  const composer = composeReadonlyVehicleSignals({
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    registryLifecycle: input.registryLifecycle,
    hardwareTypeLegacy: input.hardwareTypeLegacy,
    projectionAsOf,
    links: [input.link],
    latestState: stateAttributed ? input.latestState : null,
    pollLogs: input.pollLogs,
    priorAggregatedSourceTimestamp: input.priorAggregatedSourceTimestamp,
  });

  const linkScopedSignals = composer.signals.filter((s) => {
    const ref = s.identity.providerSourceLinkRef;
    return ref.kind === 'resolved' && ref.providerSourceLinkId === input.link.id;
  });

  const strictBundleAdvance = resolveStrictSourceAdvanceEvidence({
    priorAggregatedSourceTimestamp: input.priorAggregatedSourceTimestamp,
    currentAggregatedSourceTimestamp: stateAttributed
      ? input.latestState?.sourceTimestamp
      : null,
  });

  let lastProvenStrictSourceAdvanceAt = input.priorProvenStrictSourceAdvanceAt ?? null;
  if (strictBundleAdvance === true && input.latestState?.sourceTimestamp) {
    lastProvenStrictSourceAdvanceAt = input.latestState.sourceTimestamp;
  }

  const signals = VSI_PROFILE_MATERIALIZATION_KEYS.map((key) => {
    const row = mergeEmpiricalRow(key, linkScopedSignals, input.declaredCatalog, catalogResolver);
    if (key === 'provider_source_timestamp') {
      return {
        ...row,
        lastProvenStrictSourceAdvanceAt: lastProvenStrictSourceAdvanceAt?.toISOString() ?? null,
        strictSourceAdvanced: strictBundleAdvance,
      };
    }
    if (key === 'provider_last_successful_fetch' && stateAttributed && input.latestState) {
      const fetched = input.latestState.providerFetchedAt;
      return {
        ...row,
        empiricalObservation: fetched
          ? VsiEmpiricalObservationStatus.OBSERVED
          : VsiEmpiricalObservationStatus.NEVER_OBSERVED,
        lastValidObservationAt: fetched?.toISOString() ?? null,
        lastProviderFetchAt: fetched?.toISOString() ?? null,
        evidenceProvenance: [
          ...new Set<VsiEvidenceOrigin>([...row.evidenceProvenance, 'VEHICLE_LATEST_STATE']),
        ],
        limitations: [
          ...row.limitations,
          'PROVIDER_FETCH_TIME_NOT_SOURCE_ADVANCE_PROOF',
        ],
      };
    }
    return row;
  });

  return {
    contractVersion: VSI_PROFILE_CONTRACT_VERSION,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    providerSourceLinkId: input.link.id,
    providerIdentity: input.link.provider || 'UNKNOWN',
    verifiedModality:
      input.identity.verifiedModality === 'UNRESOLVED'
        ? null
        : input.identity.verifiedModality,
    telemetrySourceFamily:
      input.identity.telemetrySourceFamily === 'UNRESOLVED'
        ? null
        : input.identity.telemetrySourceFamily,
    evaluatedAt: projectionAsOf,
    declaredCatalogCheckedAt: input.declaredCatalog.checkedAt,
    lastMaterializedSourceTimestamp: stateAttributed
      ? input.latestState?.sourceTimestamp ?? null
      : null,
    lastMaterializedProviderFetchAt: stateAttributed
      ? input.latestState?.providerFetchedAt ?? null
      : null,
    lastProvenStrictSourceAdvanceAt,
    signals,
    profileLimitations,
  };
}
