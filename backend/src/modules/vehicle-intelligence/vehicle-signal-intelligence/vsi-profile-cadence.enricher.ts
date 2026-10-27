import type { VsiProfileEvaluationResult, VsiProfileSignalFingerprintV1 } from './vsi-profile.types';
import { mergeActiveRpmProfileOntoEngineRpmCadence } from './vsi-active-rpm-profile-resolver.util';
import {
  analyzeEngineRpmCadence,
  analyzeLvVoltageCadence,
} from './vsi-profile-cadence-stats.util';
import type {
  VsiLvCadenceEvidenceInput,
  VsiRpmCadenceEvidenceInput,
} from './vsi-profile-cadence.types';
import type { VsiSignalCadenceIntelligenceV2 } from './vsi-profile-cadence.types';

export type VsiProfileCadenceEnrichmentInput = {
  rpmEvidence: VsiRpmCadenceEvidenceInput | null;
  lvEvidence: VsiLvCadenceEvidenceInput | null;
  priorCadenceByKey?: ReadonlyMap<string, VsiSignalCadenceIntelligenceV2>;
};

function shouldPreservePriorRpmCadence(
  evidence: VsiRpmCadenceEvidenceInput,
  prior: VsiSignalCadenceIntelligenceV2 | undefined,
): boolean {
  if (!prior) {
    return false;
  }
  return (
    evidence.hfReadStatus === 'UNAVAILABLE' ||
    evidence.hfReadStatus === 'QUERY_FAILED' ||
    (evidence.hfReadStatus === 'EMPTY' && prior.observedSampleCount > 0)
  );
}

function mergeCadenceOntoSignal(
  signal: VsiProfileSignalFingerprintV1,
  cadence: VsiSignalCadenceIntelligenceV2 | null,
  prior: VsiSignalCadenceIntelligenceV2 | undefined,
): VsiProfileSignalFingerprintV1 {
  if (!cadence) {
    if (prior) {
      return {
        ...signal,
        limitations: [...new Set([...signal.limitations, ...prior.limitations])],
        cadenceIntelligence: prior,
      };
    }
    return signal;
  }

  const nonCadenceLimitations = prior
    ? signal.limitations.filter((limitation) => !prior.limitations.includes(limitation))
    : signal.limitations;
  const mergedLimitations = [
    ...new Set([...nonCadenceLimitations, ...cadence.limitations]),
  ];

  return {
    ...signal,
    limitations: mergedLimitations,
    cadenceIntelligence: cadence,
  };
}

/**
 * Attaches per-signal cadence intelligence (V2 dimension) without mutating bundle cadence fields.
 * Does not use qualityClassification/confidenceLevel for cadence eligibility (P1 deferred guard).
 */
export function enrichVsiProfileWithCadenceIntelligence(
  evaluation: VsiProfileEvaluationResult,
  input: VsiProfileCadenceEnrichmentInput,
): VsiProfileEvaluationResult {
  const prior = input.priorCadenceByKey ?? new Map();

  let rpmCadence: VsiSignalCadenceIntelligenceV2 | null = null;
  if (input.rpmEvidence != null) {
    const priorRpm = prior.get('engine_rpm');
    if (shouldPreservePriorRpmCadence(input.rpmEvidence, priorRpm)) {
      rpmCadence = priorRpm ?? null;
    } else {
      rpmCadence = mergeActiveRpmProfileOntoEngineRpmCadence(
        analyzeEngineRpmCadence(input.rpmEvidence),
        input.rpmEvidence,
      );
    }
  }

  const lvCadence =
    input.lvEvidence != null ? analyzeLvVoltageCadence(input.lvEvidence) : null;

  const signals = evaluation.signals.map((signal) => {
    if (signal.canonicalSignalKey === 'engine_rpm') {
      return mergeCadenceOntoSignal(
        signal,
        rpmCadence,
        prior.get('engine_rpm'),
      );
    }
    if (signal.canonicalSignalKey === 'lv_voltage') {
      return mergeCadenceOntoSignal(
        signal,
        lvCadence,
        prior.get('lv_voltage'),
      );
    }
    return signal;
  });

  return { ...evaluation, signals };
}

export function extractPriorCadenceByKey(
  signalsSnapshot: unknown,
): Map<string, VsiSignalCadenceIntelligenceV2> {
  const map = new Map<string, VsiSignalCadenceIntelligenceV2>();
  if (!Array.isArray(signalsSnapshot)) {
    return map;
  }
  for (const raw of signalsSnapshot) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as VsiProfileSignalFingerprintV1;
    if (row.cadenceIntelligence?.contractVersion === 'vsi-signal-cadence-v2') {
      map.set(row.canonicalSignalKey, row.cadenceIntelligence);
    }
  }
  return map;
}
