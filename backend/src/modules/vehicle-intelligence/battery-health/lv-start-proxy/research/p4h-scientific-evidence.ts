import type { P4hOfflineTripEvaluation } from './p4h-offline-trip-evaluation';

export type P4hScientificEvidenceClass =
  | 'NONE'
  | 'INSUFFICIENT_DATA'
  | 'SAMPLING_LIMITED'
  | 'TEMPORAL_AMBIGUOUS'
  | 'PLAUSIBLE_DIP_UNSUPPORTED'
  | 'PLAUSIBLE_DIP_SUPPORTED'
  | 'VALIDATED_PROXY_TECHNICAL_ONLY';

export function classifyScientificEvidence(
  offline: P4hOfflineTripEvaluation,
): {
  scientificClass: P4hScientificEvidenceClass;
  rationale: string;
} {
  if (offline.requestStatus !== 'ok' || offline.sampleCount === 0) {
    return {
      scientificClass: 'INSUFFICIENT_DATA',
      rationale: 'Provider request failed or returned no buckets.',
    };
  }

  const hist = offline.evaluations.find((e) => e.mode === 'HISTORICAL_REPLAY');
  if (!hist?.gateOk) {
    return {
      scientificClass: 'SAMPLING_LIMITED',
      rationale: `Historical gate failed: ${hist?.reasonCode ?? 'unknown'}.`,
    };
  }

  const coherence = offline.bucketCoherence.assessment;
  const drop = offline.metrics.voltageDropV;
  const hasValues =
    offline.metrics.vPreCrank != null && offline.metrics.vMinCrank != null;

  if (!hasValues) {
    return {
      scientificClass: 'INSUFFICIENT_DATA',
      rationale: 'Gate passed but crank voltages not reconstructable.',
    };
  }

  if (coherence === 'INSUFFICIENT_TEMPORAL_RESOLUTION') {
    return {
      scientificClass: 'TEMPORAL_AMBIGUOUS',
      rationale: offline.bucketCoherence.note,
    };
  }

  if (drop == null || drop <= 0.1) {
    return {
      scientificClass: 'PLAUSIBLE_DIP_UNSUPPORTED',
      rationale: 'No voltage drop > 0.1 V between pre-crank and crank-zone minimum.',
    };
  }

  if (
    coherence === 'DIP_BUCKET_WITHOUT_RPM_EVIDENCE' ||
    coherence === 'WEAK_SAME_BUCKET_COINCIDENCE'
  ) {
    return {
      scientificClass: 'PLAUSIBLE_DIP_SUPPORTED',
      rationale: `${offline.bucketCoherence.note} Drop=${drop.toFixed(2)} V (bucket-level).`,
    };
  }

  if (offline.evidence.validatedProxyWithValues) {
    return {
      scientificClass: 'VALIDATED_PROXY_TECHNICAL_ONLY',
      rationale:
        'Technical extractor validated values; scientific support depends on bucket aggregation limits.',
    };
  }

  return {
    scientificClass: 'PLAUSIBLE_DIP_SUPPORTED',
    rationale: `Observed drop ${drop.toFixed(2)} V with limited temporal proof.`,
  };
}
