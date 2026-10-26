import type { VsiProfileEvaluationResult, VsiProfileSignalFingerprintV1 } from './vsi-profile.types';
import { areVsiProfileSemanticEvaluationsEquivalent } from './vsi-profile-fingerprint.util';

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
    const lastProviderFetchAt = maxIsoTimestamp(
      persistedSignal.lastProviderFetchAt,
      incoming.lastProviderFetchAt,
    );
    if (lastProviderFetchAt === persistedSignal.lastProviderFetchAt) {
      return persistedSignal;
    }
    return { ...persistedSignal, lastProviderFetchAt };
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
