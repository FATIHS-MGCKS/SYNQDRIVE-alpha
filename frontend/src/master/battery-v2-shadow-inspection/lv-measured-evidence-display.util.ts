import type {
  LvMeasuredIntelligenceV1,
  LvMeasuredRestSessionEpisodeV1,
  LvMeasuredVoltagePointV1,
} from './lv-measured-intelligence.types';

export type EvidenceUsabilityTone = 'usable' | 'limited' | 'insufficient';

export type LatestMeasuredEvidenceView = {
  measuredAtLabel: string;
  providerTimeLabel: string;
  providerTimeMissingExplanationKey: string | null;
  operationalContext: string;
  evidenceClass: string;
  evidenceClassInterpretationKey: string;
  usabilityLabelKey: string;
  usabilityExplanationKey: string;
  usabilityTone: EvidenceUsabilityTone;
  internalInterpretationKey: string;
  batteryHealthAssessmentKey: string;
  crankingStatusKey: string;
  crankingExplanationKey: string;
  openProviderGaps: number;
};

export type EpisodeEvaluabilityView = {
  evaluabilityLabelKey: string;
  evaluabilityExplanationKey: string;
  evaluabilityTone: EvidenceUsabilityTone;
  measurementCount: number;
  openedAtIso: string;
};

const EVIDENCE_CLASS_INTERPRETATION_KEY: Record<string, string> = {
  PARKED_REST_CANDIDATE: 'master.batteryV2Shadow.lvMeasured.evidenceClass.PARKED_REST_CANDIDATE',
  REST_STABLE_VOLTAGE: 'master.batteryV2Shadow.lvMeasured.evidenceClass.REST_STABLE_VOLTAGE',
  REST_WAKE_VOLTAGE: 'master.batteryV2Shadow.lvMeasured.evidenceClass.REST_WAKE_VOLTAGE',
  DRIVING_NON_CHARGING: 'master.batteryV2Shadow.lvMeasured.evidenceClass.DRIVING_NON_CHARGING',
  DRIVING_CHARGING: 'master.batteryV2Shadow.lvMeasured.evidenceClass.DRIVING_CHARGING',
  ENGINE_OFF_TRANSITION: 'master.batteryV2Shadow.lvMeasured.evidenceClass.ENGINE_OFF_TRANSITION',
  CHARGING_CONTAMINATED: 'master.batteryV2Shadow.lvMeasured.evidenceClass.CHARGING_CONTAMINATED',
  ACTIVE_VEHICLE_CONTAMINATED: 'master.batteryV2Shadow.lvMeasured.evidenceClass.ACTIVE_VEHICLE_CONTAMINATED',
  STALE_REPLAY: 'master.batteryV2Shadow.lvMeasured.evidenceClass.STALE_REPLAY',
  STATE_AMBIGUOUS: 'master.batteryV2Shadow.lvMeasured.evidenceClass.STATE_AMBIGUOUS',
  UNKNOWN: 'master.batteryV2Shadow.lvMeasured.evidenceClass.UNKNOWN',
};

const EVIDENCE_USABILITY_KEY: Record<string, { label: string; explanation: string; tone: EvidenceUsabilityTone }> = {
  PARKED_REST_CANDIDATE: {
    label: 'master.batteryV2Shadow.lvMeasured.usability.restCandidate.label',
    explanation: 'master.batteryV2Shadow.lvMeasured.usability.restCandidate.explanation',
    tone: 'usable',
  },
  REST_STABLE_VOLTAGE: {
    label: 'master.batteryV2Shadow.lvMeasured.usability.restStable.label',
    explanation: 'master.batteryV2Shadow.lvMeasured.usability.restStable.explanation',
    tone: 'usable',
  },
  REST_WAKE_VOLTAGE: {
    label: 'master.batteryV2Shadow.lvMeasured.usability.restWake.label',
    explanation: 'master.batteryV2Shadow.lvMeasured.usability.restWake.explanation',
    tone: 'limited',
  },
  DRIVING_NON_CHARGING: {
    label: 'master.batteryV2Shadow.lvMeasured.usability.driving.label',
    explanation: 'master.batteryV2Shadow.lvMeasured.usability.driving.explanation',
    tone: 'limited',
  },
  DRIVING_CHARGING: {
    label: 'master.batteryV2Shadow.lvMeasured.usability.drivingCharging.label',
    explanation: 'master.batteryV2Shadow.lvMeasured.usability.drivingCharging.explanation',
    tone: 'limited',
  },
  ENGINE_OFF_TRANSITION: {
    label: 'master.batteryV2Shadow.lvMeasured.usability.transition.label',
    explanation: 'master.batteryV2Shadow.lvMeasured.usability.transition.explanation',
    tone: 'limited',
  },
  CHARGING_CONTAMINATED: {
    label: 'master.batteryV2Shadow.lvMeasured.usability.chargingContaminated.label',
    explanation: 'master.batteryV2Shadow.lvMeasured.usability.chargingContaminated.explanation',
    tone: 'limited',
  },
  ACTIVE_VEHICLE_CONTAMINATED: {
    label: 'master.batteryV2Shadow.lvMeasured.usability.activeContaminated.label',
    explanation: 'master.batteryV2Shadow.lvMeasured.usability.activeContaminated.explanation',
    tone: 'limited',
  },
  STALE_REPLAY: {
    label: 'master.batteryV2Shadow.lvMeasured.usability.staleReplay.label',
    explanation: 'master.batteryV2Shadow.lvMeasured.usability.staleReplay.explanation',
    tone: 'insufficient',
  },
  STATE_AMBIGUOUS: {
    label: 'master.batteryV2Shadow.lvMeasured.usability.ambiguous.label',
    explanation: 'master.batteryV2Shadow.lvMeasured.usability.ambiguous.explanation',
    tone: 'insufficient',
  },
  UNKNOWN: {
    label: 'master.batteryV2Shadow.lvMeasured.usability.unknownClass.label',
    explanation: 'master.batteryV2Shadow.lvMeasured.usability.unknownClass.explanation',
    tone: 'insufficient',
  },
};

function usabilityForEvidenceClass(evidenceClass: string) {
  return (
    EVIDENCE_USABILITY_KEY[evidenceClass] ?? {
      label: 'master.batteryV2Shadow.lvMeasured.usability.unmapped.label',
      explanation: 'master.batteryV2Shadow.lvMeasured.usability.unmapped.explanation',
      tone: 'limited' as EvidenceUsabilityTone,
    }
  );
}

function interpretationKeyForEvidenceClass(evidenceClass: string): string {
  return (
    EVIDENCE_CLASS_INTERPRETATION_KEY[evidenceClass] ??
    'master.batteryV2Shadow.lvMeasured.evidenceClass.unmapped'
  );
}

function internalInterpretationKey(
  point: LvMeasuredVoltagePointV1,
  openProviderGaps: number,
): string {
  if (openProviderGaps > 0) {
    return 'master.batteryV2Shadow.lvMeasured.interpretation.openProviderGaps';
  }
  if (point.isLvCharging === true) {
    return 'master.batteryV2Shadow.lvMeasured.interpretation.lvChargingActive';
  }
  if (point.engineRunning === true) {
    return 'master.batteryV2Shadow.lvMeasured.interpretation.engineRunning';
  }
  return 'master.batteryV2Shadow.lvMeasured.interpretation.noExtraFlags';
}

export function buildLatestMeasuredEvidenceView(
  data: LvMeasuredIntelligenceV1,
): LatestMeasuredEvidenceView | null {
  const point = data.latestMeasured;
  if (!point) return null;

  const usability = usabilityForEvidenceClass(point.evidenceClass);
  const measuredAt = new Date(point.voltageObservedAt);
  const providerAt = point.providerObservationAt ? new Date(point.providerObservationAt) : null;

  return {
    measuredAtLabel: measuredAt.toLocaleString(),
    providerTimeLabel: providerAt ? providerAt.toLocaleString() : '',
    providerTimeMissingExplanationKey: providerAt
      ? null
      : 'master.batteryV2Shadow.lvMeasured.missing.providerTime',
    operationalContext: point.operationalContext,
    evidenceClass: point.evidenceClass,
    evidenceClassInterpretationKey: interpretationKeyForEvidenceClass(point.evidenceClass),
    usabilityLabelKey: usability.label,
    usabilityExplanationKey: usability.explanation,
    usabilityTone: usability.tone,
    internalInterpretationKey: internalInterpretationKey(point, data.provenance.openProviderObservabilityGapCount),
    batteryHealthAssessmentKey: 'master.batteryV2Shadow.lvMeasured.boundary.batteryHealthNotAssessed',
    crankingStatusKey: 'master.batteryV2Shadow.lvMeasured.cranking.unknown',
    crankingExplanationKey: 'master.batteryV2Shadow.lvMeasured.cranking.notInReadModel',
    openProviderGaps: data.provenance.openProviderObservabilityGapCount,
  };
}

export function buildEpisodeEvaluabilityView(ep: LvMeasuredRestSessionEpisodeV1): EpisodeEvaluabilityView {
  const measurementCount = ep.measuredPoints.length;

  if (measurementCount === 0) {
    return {
      evaluabilityLabelKey: 'master.batteryV2Shadow.lvMeasured.episode.eval.none.label',
      evaluabilityExplanationKey: 'master.batteryV2Shadow.lvMeasured.episode.eval.none.explanation',
      evaluabilityTone: 'insufficient',
      measurementCount,
      openedAtIso: ep.openedAt,
    };
  }

  if (!ep.derivedFeatures) {
    return {
      evaluabilityLabelKey: 'master.batteryV2Shadow.lvMeasured.episode.eval.noDerived.label',
      evaluabilityExplanationKey: 'master.batteryV2Shadow.lvMeasured.episode.eval.noDerived.explanation',
      evaluabilityTone: 'limited',
      measurementCount,
      openedAtIso: ep.openedAt,
    };
  }

  if (ep.contextLimitedReason) {
    return {
      evaluabilityLabelKey: 'master.batteryV2Shadow.lvMeasured.episode.eval.contextLimited.label',
      evaluabilityExplanationKey: 'master.batteryV2Shadow.lvMeasured.episode.eval.contextLimited.explanation',
      evaluabilityTone: 'limited',
      measurementCount,
      openedAtIso: ep.openedAt,
    };
  }

  if (ep.derivedFeatures.slopeInterpretability === 'CONTEXT_LIMITED') {
    return {
      evaluabilityLabelKey: 'master.batteryV2Shadow.lvMeasured.episode.eval.slopeLimited.label',
      evaluabilityExplanationKey: 'master.batteryV2Shadow.lvMeasured.episode.eval.slopeLimited.explanation',
      evaluabilityTone: 'limited',
      measurementCount,
      openedAtIso: ep.openedAt,
    };
  }

  return {
    evaluabilityLabelKey: 'master.batteryV2Shadow.lvMeasured.episode.eval.trendReady.label',
    evaluabilityExplanationKey: 'master.batteryV2Shadow.lvMeasured.episode.eval.trendReady.explanation',
    evaluabilityTone: 'usable',
    measurementCount,
    openedAtIso: ep.openedAt,
  };
}

export function explainNumericMetric(
  value: number | null | undefined,
  presentKey: string,
  missingKey: string,
): { kind: 'value'; text: string } | { kind: 'missing'; explanationKey: string } {
  if (value == null || Number.isNaN(value)) {
    return { kind: 'missing', explanationKey: missingKey };
  }
  return { kind: 'value', text: String(value) };
}
