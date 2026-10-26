import type { VsiProfileEvaluationResult, VsiProfileSignalFingerprintV1 } from './vsi-profile.types';
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

function mergeCadenceOntoSignal(
  signal: VsiProfileSignalFingerprintV1,
  cadence: VsiSignalCadenceIntelligenceV2 | null,
  prior: VsiSignalCadenceIntelligenceV2 | undefined,
): VsiProfileSignalFingerprintV1 {
  if (!cadence) {
    if (prior) {
      return { ...signal, cadenceIntelligence: prior };
    }
    return signal;
  }

  const mergedLimitations = [
    ...new Set([...signal.limitations, ...cadence.limitations]),
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
  const rpmCadence =
    input.rpmEvidence != null ? analyzeEngineRpmCadence(input.rpmEvidence) : null;
  const lvCadence =
    input.lvEvidence != null ? analyzeLvVoltageCadence(input.lvEvidence) : null;

  const prior = input.priorCadenceByKey ?? new Map();

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
