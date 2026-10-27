import type { Prisma } from '@prisma/client';
import type { VsiProfileEvaluationResult, VsiProfileSignalFingerprintV1 } from './vsi-profile.types';
import { areVsiProfileSemanticEvaluationsEquivalent } from './vsi-profile-fingerprint.util';
import type { VsiSignalCadenceIntelligenceV2 } from './vsi-profile-cadence.types';

/** Row tokens read inside the transaction immediately before an operational-only CAS write. */
export type VsiOperationalProfileRefreshCasRow = {
  id: string;
  profileRevision: number;
  updatedAt: Date;
  lastMaterializedProviderFetchAt: Date | null;
};

/**
 * Compare-and-swap predicate for operational refresh when `profileRevision` is unchanged.
 * Guards against lost updates from concurrent fetch-only writers (Fable P0).
 */
export function buildOperationalProfileRefreshCasWhere(
  row: VsiOperationalProfileRefreshCasRow,
): Prisma.VehicleSignalCapabilityProfileWhereInput {
  return {
    id: row.id,
    profileRevision: row.profileRevision,
    updatedAt: row.updatedAt,
    lastMaterializedProviderFetchAt: row.lastMaterializedProviderFetchAt,
  };
}

export type VsiPersistedProfileOperationalRefreshRow = {
  profileContractVersion: string;
  providerSourceLinkId: string;
  providerIdentity: string;
  verifiedModality: string | null;
  telemetrySourceFamily: string | null;
  declaredCatalogCheckedAt: Date | null;
  lastMaterializedSourceTimestamp: Date | null;
  lastProvenStrictSourceAdvanceAt: Date | null;
  profileLimitations: unknown;
  signalsSnapshot: unknown;
  evaluatedAt: Date;
  lastMaterializedProviderFetchAt: Date | null;
};

function maxDate(a: Date | null | undefined, b: Date | null | undefined): Date | null {
  if (!a && !b) return null;
  if (!a) return b ?? null;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

function maxIsoTimestamp(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  const aMs = Date.parse(a);
  const bMs = Date.parse(b);
  if (!Number.isFinite(aMs)) return b;
  if (!Number.isFinite(bMs)) return a;
  return aMs >= bMs ? a : b;
}

/** Latest reliable trip end timestamp from active RPM rolling evidence, if present. */
export function maxActiveRpmTripEndMs(
  cadence: VsiSignalCadenceIntelligenceV2 | undefined,
): number | null {
  const rows = cadence?.activeRpmProfile?.tripClassifications;
  if (!rows?.length) {
    return null;
  }
  let max: number | null = null;
  for (const row of rows) {
    if (!Number.isFinite(row.endMs)) {
      continue;
    }
    max = max == null ? row.endMs : Math.max(max, row.endMs);
  }
  return max;
}

/**
 * Rejects stale active RPM rolling windows that share the same cadence semantic fingerprint.
 * LV cadence (no activeRpmProfile) is not gated here.
 */
export function isIncomingActiveRpmEvidenceMonotonic(
  persisted: VsiSignalCadenceIntelligenceV2,
  incoming: VsiSignalCadenceIntelligenceV2,
): boolean {
  if (!persisted.activeRpmProfile) {
    return true;
  }
  if (!incoming.activeRpmProfile) {
    return false;
  }
  const persistedMax = maxActiveRpmTripEndMs(persisted);
  const incomingMax = maxActiveRpmTripEndMs(incoming);
  if (persistedMax == null || incomingMax == null) {
    return false;
  }
  if (incomingMax < persistedMax) {
    return false;
  }
  if (incomingMax > persistedMax) {
    return true;
  }
  const persistedIds = persisted.activeRpmProfile.evaluatedTripIds;
  const incomingIds = incoming.activeRpmProfile.evaluatedTripIds;
  if (JSON.stringify(persistedIds) === JSON.stringify(incomingIds)) {
    return true;
  }
  return false;
}

/**
 * When cadence semantic identity is unchanged, refresh operational cadence evidence
 * (e.g. activeRpmProfile.evaluatedTripIds) from the newer evaluation.
 */
export function mergeOperationalCadenceIntelligence(
  persisted: VsiSignalCadenceIntelligenceV2 | undefined,
  incoming: VsiSignalCadenceIntelligenceV2 | undefined,
): VsiSignalCadenceIntelligenceV2 | undefined {
  if (!incoming) {
    return persisted;
  }
  if (!persisted) {
    return incoming;
  }
  if (
    !persisted.cadenceSemanticFingerprint ||
    !incoming.cadenceSemanticFingerprint ||
    persisted.cadenceSemanticFingerprint !== incoming.cadenceSemanticFingerprint
  ) {
    return persisted;
  }
  if (!isIncomingActiveRpmEvidenceMonotonic(persisted, incoming)) {
    return persisted;
  }
  return incoming;
}

export function mergeOperationalSignalSnapshots(
  persistedSignals: readonly VsiProfileSignalFingerprintV1[],
  incomingSignals: readonly VsiProfileSignalFingerprintV1[],
): VsiProfileSignalFingerprintV1[] {
  const incomingByKey = new Map(
    incomingSignals.map((signal) => [signal.canonicalSignalKey, signal]),
  );
  return persistedSignals.map((persistedSignal) => {
    const incoming = incomingByKey.get(persistedSignal.canonicalSignalKey);
    if (!incoming) {
      return persistedSignal;
    }
    let next: VsiProfileSignalFingerprintV1 = persistedSignal;
    const lastProviderFetchAt = maxIsoTimestamp(
      persistedSignal.lastProviderFetchAt,
      incoming.lastProviderFetchAt,
    );
    if (lastProviderFetchAt !== persistedSignal.lastProviderFetchAt) {
      next = { ...next, lastProviderFetchAt };
    }
    const cadenceIntelligence = mergeOperationalCadenceIntelligence(
      persistedSignal.cadenceIntelligence,
      incoming.cadenceIntelligence,
    );
    if (cadenceIntelligence !== persistedSignal.cadenceIntelligence) {
      next = { ...next, cadenceIntelligence };
    }
    return next;
  });
}

/**
 * Builds an operational-only profile update from the **persisted** row as semantic authority.
 * Returns null when semantics diverge (stale evaluation) or when no monotonic operational advance exists.
 */
export function buildOperationalProfileRefreshUpdate(input: {
  persisted: VsiPersistedProfileOperationalRefreshRow;
  evaluation: VsiProfileEvaluationResult;
  semanticFingerprint: string;
}): {
  evaluatedAt: Date;
  lastMaterializedProviderFetchAt: Date | null;
  signalsSnapshot: VsiProfileSignalFingerprintV1[];
  contentFingerprint: string;
} | null {
  const { persisted, evaluation, semanticFingerprint } = input;
  if (!areVsiProfileSemanticEvaluationsEquivalent(persisted, evaluation)) {
    return null;
  }

  const mergedFetch = maxDate(
    persisted.lastMaterializedProviderFetchAt,
    evaluation.lastMaterializedProviderFetchAt,
  );
  const mergedEvaluatedAt = maxDate(persisted.evaluatedAt, evaluation.evaluatedAt);
  if (!mergedEvaluatedAt) {
    return null;
  }

  const persistedSignals = Array.isArray(persisted.signalsSnapshot)
    ? (persisted.signalsSnapshot as VsiProfileSignalFingerprintV1[])
    : [];
  const mergedSignals = mergeOperationalSignalSnapshots(persistedSignals, evaluation.signals);

  const fetchUnchanged =
    (persisted.lastMaterializedProviderFetchAt?.getTime() ?? null) ===
      (mergedFetch?.getTime() ?? null) &&
    mergedEvaluatedAt.getTime() === persisted.evaluatedAt.getTime() &&
    JSON.stringify(mergedSignals) === JSON.stringify(persistedSignals);

  if (fetchUnchanged) {
    return null;
  }

  return {
    evaluatedAt: mergedEvaluatedAt,
    lastMaterializedProviderFetchAt: mergedFetch,
    signalsSnapshot: mergedSignals,
    contentFingerprint: semanticFingerprint,
  };
}
