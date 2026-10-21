import type { VsiCapabilityResolverProfileContext } from './vsi-capability-resolver.types';
import type { VsiProfileRevisionHistoryRowV1 } from './vsi-profile-revision-history.types';
import { isVsiProfileRevisionSignalsSnapshotWellFormed } from './vsi-profile-revision-signals-snapshot';

/**
 * Pure projection: immutable P5-H1 revision row → VSI capability profile context.
 * Fail closed on malformed snapshots (returns null).
 */
export function mapVsiProfileRevisionToCapabilityContext(
  row: VsiProfileRevisionHistoryRowV1,
): VsiCapabilityResolverProfileContext | null {
  if (!isVsiProfileRevisionSignalsSnapshotWellFormed(row.signalsSnapshot)) {
    return null;
  }
  const signals = Array.isArray(row.signalsSnapshot) ? row.signalsSnapshot : [];
  return {
    profileContractVersion: row.profileContractVersion,
    profileRevision: row.profileRevision,
    contentFingerprint: row.contentFingerprint,
    profileLimitations: [...row.profileLimitations],
    signals: signals.map((raw) => {
      const s = raw as {
        canonicalSignalKey?: string;
        declaredSupport?: string;
        empiricalObservation?: string;
        lastSourceTimestamp?: string | null;
        lastValidObservationAt?: string | null;
        freshnessClassification?: string;
        qualityClassification?: string;
        confidenceLevel?: string;
        limitations?: string[];
        observedCadenceMedianSeconds?: number | null;
        observedSamples?: number | null;
      };
      return {
        canonicalSignalKey: s.canonicalSignalKey ?? 'UNKNOWN',
        declaredSupport: s.declaredSupport ?? 'UNKNOWN',
        empiricalObservation: s.empiricalObservation ?? 'UNKNOWN',
        lastSourceTimestamp: s.lastSourceTimestamp ?? null,
        lastValidObservationAt: s.lastValidObservationAt ?? null,
        freshnessClassification: s.freshnessClassification ?? 'UNKNOWN',
        qualityClassification: s.qualityClassification,
        confidenceLevel: s.confidenceLevel,
        observedCadenceMedianSeconds: s.observedCadenceMedianSeconds ?? null,
        observedSamples: s.observedSamples ?? null,
        limitations: Array.isArray(s.limitations) ? [...s.limitations] : [],
      };
    }),
  };
}
