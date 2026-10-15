import { createHash } from 'node:crypto';
import type {
  VsiProfileEvaluationDraft,
  VsiProfileEvaluationResult,
  VsiProfileSignalSnapshotV1,
} from './vsi-profile.types';
import {
  VSI_SIGNAL_FINGERPRINT_CONTRACT_VERSION,
  classifyVsiSignalQuality,
  computeBundleSourceAdvanceStats,
  resolveVsiSignalConfidence,
  VSI_SIGNAL_CADENCE_MIN_SAMPLES,
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
  const bundleStats = computeBundleSourceAdvanceStats(bundleHistory.bundleSourceTimestamps);

  const signals: VsiProfileSignalFingerprintV1[] = evaluation.signals.map((signal) => {
    const isBundleTimestamp = signal.canonicalSignalKey === 'provider_source_timestamp';

    const quality = classifyVsiSignalQuality({
      signal,
      profileLimitations: evaluation.profileLimitations,
    });

    const confidence = resolveVsiSignalConfidence(quality, signal);

    const base: VsiProfileSignalFingerprintV1 = {
      ...signal,
      signalFingerprintContractVersion: VSI_SIGNAL_FINGERPRINT_CONTRACT_VERSION,
      qualityClassification: quality,
      confidenceLevel: confidence,
      observedSamples: isBundleTimestamp
        ? bundleStats.observedCadenceSampleCount > 0
          ? bundleStats.observedCadenceSampleCount + 1
          : signal.empiricalObservation === 'NEVER_OBSERVED'
            ? 0
            : 1
        : null,
      provenSourceAdvances: isBundleTimestamp ? bundleStats.provenSourceAdvances : null,
      observedCadenceMedianSeconds:
        isBundleTimestamp && bundleStats.observedCadenceSampleCount >= VSI_SIGNAL_CADENCE_MIN_SAMPLES
          ? bundleStats.observedCadenceMedianSeconds
          : null,
      observedCadenceSampleCount: isBundleTimestamp ? bundleStats.observedCadenceSampleCount : null,
      maxStaleIntervalSeconds:
        isBundleTimestamp && bundleStats.maxStaleIntervalSeconds != null
          ? bundleStats.maxStaleIntervalSeconds
          : null,
      contentFingerprint: '',
    };

    if (isBundleTimestamp && signal.lastProvenStrictSourceAdvanceAt == null) {
      base.lastProvenStrictSourceAdvanceAt =
        bundleStats.provenSourceAdvances > 0
          ? signal.lastSourceTimestamp
          : signal.lastProvenStrictSourceAdvanceAt;
    }

    return { ...base, contentFingerprint: fingerprintSignalRow(base) };
  });

  return {
    ...evaluation,
    signals,
    bundleAdvanceFingerprint: bundleStats,
  };
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
