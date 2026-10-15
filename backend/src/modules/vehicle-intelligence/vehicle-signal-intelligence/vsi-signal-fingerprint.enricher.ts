import { createHash } from 'node:crypto';
import type {
  VsiProfileEvaluationDraft,
  VsiProfileEvaluationResult,
  VsiProfileSignalSnapshotV1,
} from './vsi-profile.types';
import { VsiEmpiricalObservationStatus } from './vehicle-signal-evidence.contract';
import {
  VSI_SIGNAL_FINGERPRINT_CONTRACT_VERSION,
  classifyVsiSignalQuality,
  computeBundleSourceAdvanceStats,
  resolveVsiSignalConfidence,
  type VsiBundleHistoricalEvidence,
} from './vsi-signal-quality.classifier';
import type { VsiProfileSignalFingerprintV1 } from './vsi-profile.types';

function fingerprintSignalRow(row: VsiProfileSignalFingerprintV1): string {
  const payload = {
    contract: VSI_SIGNAL_FINGERPRINT_CONTRACT_VERSION,
    canonicalSignalKey: row.canonicalSignalKey,
    declaredSupport: row.declaredSupport,
    empiricalObservation: row.empiricalObservation,
    qualityClassification: row.qualityClassification,
    lastValidObservationAt: row.lastValidObservationAt,
    lastSourceTimestamp: row.lastSourceTimestamp,
    lastProvenStrictSourceAdvanceAt: row.lastProvenStrictSourceAdvanceAt,
    observedSamples: row.observedSamples,
    provenSourceAdvances: row.provenSourceAdvances,
    observedCadenceMedianSeconds: row.observedCadenceMedianSeconds,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function enrichVsiProfileWithSignalFingerprints(
  evaluation: VsiProfileEvaluationDraft,
  bundleHistory: VsiBundleHistoricalEvidence,
): VsiProfileEvaluationResult {
  const stats = computeBundleSourceAdvanceStats(bundleHistory.bundleSourceTimestamps);
  const observedSamples =
    stats.observedCadenceSampleCount >= 1 ? stats.observedCadenceSampleCount + 1 : null;

  const signals: VsiProfileSignalFingerprintV1[] = evaluation.signals.map((signal) => {
    const quality = classifyVsiSignalQuality({
      signal,
      bundleHistory,
      profileLimitations: evaluation.profileLimitations,
      projectionAsOf: evaluation.evaluatedAt,
    });
    const confidence = resolveVsiSignalConfidence(quality, signal);

    const cadenceEligible =
      signal.canonicalSignalKey === 'provider_source_timestamp' ||
      quality === 'OBSERVED_INTERMITTENT' ||
      quality === 'OBSERVED_FRESH' ||
      quality === 'OBSERVED_STALE';

    const base: VsiProfileSignalFingerprintV1 = {
      ...signal,
      signalFingerprintContractVersion: VSI_SIGNAL_FINGERPRINT_CONTRACT_VERSION,
      qualityClassification: quality,
      confidenceLevel: confidence,
      observedSamples:
        signal.empiricalObservation === VsiEmpiricalObservationStatus.NEVER_OBSERVED
          ? 0
          : observedSamples,
      provenSourceAdvances:
        signal.canonicalSignalKey === 'provider_source_timestamp'
          ? stats.provenSourceAdvances
          : null,
      observedCadenceMedianSeconds:
        cadenceEligible && stats.observedCadenceSampleCount >= 3
          ? stats.observedCadenceMedianSeconds
          : null,
      observedCadenceSampleCount:
        cadenceEligible && stats.observedCadenceSampleCount > 0
          ? stats.observedCadenceSampleCount
          : null,
      maxStaleIntervalSeconds:
        cadenceEligible && stats.maxStaleIntervalSeconds != null
          ? stats.maxStaleIntervalSeconds
          : null,
      contentFingerprint: '',
    };
    return { ...base, contentFingerprint: fingerprintSignalRow(base) };
  });

  return { ...evaluation, signals };
}

export function isVsiProfileSignalFingerprintV1(
  row: VsiProfileSignalSnapshotV1 | VsiProfileSignalFingerprintV1,
): row is VsiProfileSignalFingerprintV1 {
  return (
    typeof row === 'object' &&
    row !== null &&
    'signalFingerprintContractVersion' in row &&
    (row as VsiProfileSignalFingerprintV1).signalFingerprintContractVersion ===
      VSI_SIGNAL_FINGERPRINT_CONTRACT_VERSION
  );
}
