import {
  classifyRestingVoltage,
  specUsedForRestingThresholds,
} from '../../battery-status';
import {
  isEligibleRestObservationForConditionV1,
  medianRestVoltageMv,
  selectEpisodeRepresentativesForOperationalRisk,
} from '../lv-operational-condition/lv-operational-condition-observation.policy';
import { evaluateLvOperationalConditionV1 } from '../lv-operational-condition/lv-operational-condition-v1.evaluator';
import {
  evaluateStartabilityV1,
  hasValidatedStartabilityCrankEvidenceV1,
} from '../lv-operational-condition/lv-operational-condition-startability.policy';
import {
  LV_ESTIMATED_BATTERY_HEALTH_MODEL_VERSION,
  LV_ESTIMATED_BATTERY_HEALTH_RESEARCH_POLICY_P2_ID,
  LV_ESTIMATED_BATTERY_HEALTH_RESEARCH_POLICY_P3_ID,
  LV_ESTIMATED_HEALTH_CRANK_MAX_AGE_MS,
  LV_ESTIMATED_HEALTH_MIN_EPISODES_PROVISIONAL,
  LV_ESTIMATED_HEALTH_MIN_EPISODES_TREND,
} from './lv-estimated-battery-health-v1.constants';
import {
  applyResearchPolicyAfterP1,
  observationSpanDaysFromIsoRange,
  type LvEstimatedBatteryHealthResearchPolicyVariant,
} from './lv-estimated-battery-health-v1.research-policy';
import {
  classifyEstimatedHealthStatusP1,
  independentSupportingFamiliesP1,
  LV_ESTIMATED_BATTERY_HEALTH_DECISION_POLICY_ID,
  type HealthDecisionRuleIdV1,
  type LvEstimatedHealthDecisionTraceEpisodeV1,
  type RestEpisodeBandCounts,
} from './lv-estimated-battery-health-v1.decision-policy';
import type {
  LvEstimatedBatteryHealthAssessmentV1,
  LvEstimatedBatteryHealthInputV1,
  LvEstimatedHealthConfidenceV1,
  LvEstimatedHealthReasonCodeV1,
  LvEstimatedHealthSignalFamilyV1,
  LvEstimatedHealthStatusV1,
} from './lv-estimated-battery-health-v1.types';

type RestEpisodeBand = 'GOOD' | 'WATCH' | 'WARNING' | 'CRITICAL' | 'UNSUPPORTED';

function classifyEpisodeBand(
  input: LvEstimatedBatteryHealthInputV1,
  voltageV: number,
): RestEpisodeBand {
  const chemistry = input.conditionInput.chemistry.normalizedType;
  const specProvided = specUsedForRestingThresholds({
    batteryType: chemistry,
    batteryVolt: input.conditionInput.chemistry.nominalVoltageV,
    sourceConfidence: input.conditionInput.chemistry.sourceConfidence,
  });
  const resting = classifyRestingVoltage(voltageV, chemistry, { specProvided });
  if (resting.status === 'UNSUPPORTED') return 'UNSUPPORTED';
  return resting.status as RestEpisodeBand;
}

function isCrankEvidenceStale(input: LvEstimatedBatteryHealthInputV1): boolean {
  const crank = input.conditionInput.crankEvidence;
  if (!crank?.crankAtIso) return true;
  const crankMs = Date.parse(crank.crankAtIso);
  const evalMs = Date.parse(input.conditionInput.evaluatedAtIso);
  if (!Number.isFinite(crankMs) || !Number.isFinite(evalMs)) return true;
  return evalMs - crankMs > LV_ESTIMATED_HEALTH_CRANK_MAX_AGE_MS;
}

function evaluateLongitudinalTrend(
  episodes: { voltageV: number; voltageObservedAt: string }[],
): 'DECLINE' | 'STABLE' | 'NOT_EVALUABLE' {
  if (episodes.length < LV_ESTIMATED_HEALTH_MIN_EPISODES_TREND) {
    return 'NOT_EVALUABLE';
  }
  const firstSlice = episodes.slice(0, Math.floor(episodes.length / 2));
  const secondSlice = episodes.slice(Math.floor(episodes.length / 2));
  const firstMedian = medianRestVoltageMv(
    firstSlice.map((e) => ({
      observationId: '',
      sourceMeasurementId: '',
      restSessionId: null,
      voltageV: e.voltageV,
      voltageObservedAt: e.voltageObservedAt,
      providerObservationAt: null,
      operationalContext: 'REST',
      evidenceClass: 'PARKED_REST_CANDIDATE',
      actualRestAgeHours: 2,
      temperatureC: null,
      isLvCharging: false,
      engineRunning: false,
    })),
  );
  const secondMedian = medianRestVoltageMv(
    secondSlice.map((e) => ({
      observationId: '',
      sourceMeasurementId: '',
      restSessionId: null,
      voltageV: e.voltageV,
      voltageObservedAt: e.voltageObservedAt,
      providerObservationAt: null,
      operationalContext: 'REST',
      evidenceClass: 'PARKED_REST_CANDIDATE',
      actualRestAgeHours: 2,
      temperatureC: null,
      isLvCharging: false,
      engineRunning: false,
    })),
  );
  if (firstMedian == null || secondMedian == null) return 'NOT_EVALUABLE';
  const deltaMv = secondMedian - firstMedian;
  if (deltaMv <= -80) return 'DECLINE';
  if (Math.abs(deltaMv) < 40) return 'STABLE';
  return 'NOT_EVALUABLE';
}

function deriveConfidence(
  episodeCount: number,
  supportingFamilies: LvEstimatedHealthSignalFamilyV1[],
  hasDegradedQuality: boolean,
): LvEstimatedHealthConfidenceV1 {
  if (episodeCount < LV_ESTIMATED_HEALTH_MIN_EPISODES_PROVISIONAL) return 'NONE';
  if (hasDegradedQuality) return episodeCount >= 3 ? 'LOW' : 'NONE';
  if (supportingFamilies.length >= 3 && episodeCount >= 4) return 'HIGH';
  if (supportingFamilies.length >= 2 && episodeCount >= 3) return 'MEDIUM';
  return 'LOW';
}

function researchPolicyIdForVariant(
  variant: LvEstimatedBatteryHealthResearchPolicyVariant,
): string {
  switch (variant) {
    case 'P2_LOAD_REQUIRED_GREEN':
      return LV_ESTIMATED_BATTERY_HEALTH_RESEARCH_POLICY_P2_ID;
    case 'P3_CONSERVATIVE_GREEN':
      return LV_ESTIMATED_BATTERY_HEALTH_RESEARCH_POLICY_P3_ID;
    default:
      return LV_ESTIMATED_BATTERY_HEALTH_DECISION_POLICY_ID;
  }
}

/**
 * Pure shadow estimator for estimated 12V battery health (not SOH %, not N14 operational risk rename).
 * Production/runtime default: P1 baseline only.
 */
export function evaluateLvEstimatedBatteryHealthV1(
  input: LvEstimatedBatteryHealthInputV1,
): LvEstimatedBatteryHealthAssessmentV1 {
  return evaluateLvEstimatedBatteryHealthV1WithResearchPolicy(input, 'P1_BASELINE');
}

/**
 * Offline/research evaluator with explicit P1/P2/P3 policy variant. Not wired to Nest or publication.
 */
export function evaluateLvEstimatedBatteryHealthV1WithResearchPolicy(
  input: LvEstimatedBatteryHealthInputV1,
  researchPolicyVariant: LvEstimatedBatteryHealthResearchPolicyVariant,
): LvEstimatedBatteryHealthAssessmentV1 {
  const n14 = evaluateLvOperationalConditionV1(input.conditionInput);
  const reasonCodes: LvEstimatedHealthReasonCodeV1[] = [
    'HEALTH_N14_OPERATIONAL_RISK_NOT_HEALTH_PROXY',
  ];
  const limitations = [
    'Shadow-only estimated health classification; customer publication disabled.',
    'Not laboratory SOH %, capacity, CCA or remaining lifetime.',
    'Distinct from N14 operationalRiskStatus (charge/voltage operational indicator).',
    'Repeated observations increase confidence; they do not automatically imply good health.',
  ];

  const supporting: LvEstimatedHealthSignalFamilyV1[] = [];
  const missing: LvEstimatedHealthSignalFamilyV1[] = [
    'RESTING_CONDITION',
    'LONGITUDINAL_STABILITY',
    'LOAD_START_PERFORMANCE',
    'CHARGING_RECOVERY_CONTEXT',
  ];

  const eligible = input.conditionInput.eligibleRestObservations.filter(
    isEligibleRestObservationForConditionV1,
  );
  const episodes = selectEpisodeRepresentativesForOperationalRisk(eligible);

  const bandCounts = { GOOD: 0, WATCH: 0, WARNING: 0, CRITICAL: 0, UNSUPPORTED: 0 };
  for (const ep of episodes) {
    const band = classifyEpisodeBand(input, ep.voltageV);
    bandCounts[band] += 1;
    if (band === 'GOOD') reasonCodes.push('HEALTH_REST_EPISODES_STABLE_GOOD');
    if (band === 'WATCH') reasonCodes.push('HEALTH_REST_EPISODES_WATCH');
    if (band === 'WARNING') reasonCodes.push('HEALTH_REST_EPISODES_WARNING');
    if (band === 'CRITICAL') reasonCodes.push('HEALTH_REST_EPISODES_CRITICAL');
  }

  if (episodes.length > 0) {
    supporting.push('RESTING_CONDITION');
    missing.splice(missing.indexOf('RESTING_CONDITION'), 1);
  }

  const trend = evaluateLongitudinalTrend(episodes);
  if (trend === 'DECLINE') {
    reasonCodes.push('HEALTH_LONGITUDINAL_DECLINE_SUSPECTED');
  } else if (trend === 'STABLE') {
    reasonCodes.push('HEALTH_LONGITUDINAL_STABLE');
  } else {
    reasonCodes.push('HEALTH_LONGITUDINAL_NOT_EVALUABLE');
  }

  const startability = evaluateStartabilityV1({
    observations: [...eligible, ...input.conditionInput.wakeVoltageObservations],
    crankEvidence: input.conditionInput.crankEvidence,
  });
  const crankStale = isCrankEvidenceStale(input);
  let loadSignal: LvEstimatedHealthStatusV1 = 'UNKNOWN';
  let loadAuthorizedForHealth = false;
  if (crankStale && input.conditionInput.crankEvidence) {
    reasonCodes.push('HEALTH_LOAD_CRANK_STALE');
    missing.push('LOAD_START_PERFORMANCE');
  } else if (startability.status === 'GREEN') {
    loadAuthorizedForHealth = true;
    loadSignal = 'GREEN';
    reasonCodes.push('HEALTH_LOAD_CRANK_VALIDATED_GOOD');
  } else if (startability.status === 'YELLOW') {
    loadAuthorizedForHealth = true;
    loadSignal = 'YELLOW';
    reasonCodes.push('HEALTH_LOAD_CRANK_VALIDATED_WEAK');
  } else if (startability.status === 'RED') {
    loadAuthorizedForHealth = true;
    loadSignal = 'RED';
    reasonCodes.push('HEALTH_LOAD_CRANK_VALIDATED_CRITICAL');
  } else {
    reasonCodes.push('HEALTH_LOAD_CRANK_UNAVAILABLE');
  }

  const highContamination =
    input.conditionInput.latestGlobalObservation?.operationalContext === 'CHARGING' ||
    input.conditionInput.latestGlobalObservation?.isLvCharging === true;
  if (highContamination) {
    reasonCodes.push('HEALTH_CHARGING_CONTAMINATION_HIGH');
    reasonCodes.push('HEALTH_CHARGING_CONTEXT_LIMITED');
  }

  const sessionFeaturesEvaluable = input.conditionInput.sessionFeatures.filter(
    (f) => f.slopeInterpretability === 'REST_SELF_DISCHARGE_TREND',
  ).length;
  const hasChargingRecoveryEvidence = sessionFeaturesEvaluable > 0;

  const familySplit = independentSupportingFamiliesP1({
    hasRestEpisodes: episodes.length > 0,
    trend,
    loadAuthorized: loadAuthorizedForHealth,
    hasChargingRecoveryEvidence,
  });
  for (const fam of familySplit.independent) {
    supporting.push(fam);
    const idx = missing.indexOf(fam);
    if (idx >= 0) missing.splice(idx, 1);
  }
  if (familySplit.correlatedExcluded.length > 0) {
    reasonCodes.push('HEALTH_CORRELATED_EVIDENCE_NOT_CORROBORATION');
  }

  if (input.conditionInput.chemistry.normalizedType === 'UNKNOWN') {
    reasonCodes.push('HEALTH_CHEMISTRY_UNKNOWN');
  }
  if (input.conditionInput.openProviderObservabilityGapCount > 0) {
    reasonCodes.push('HEALTH_PROVIDER_GAP_OPEN');
  }
  if (
    input.conditionInput.inputCoverageIncomplete ||
    input.conditionInput.historicalObservationsTruncated
  ) {
    reasonCodes.push('HEALTH_INPUT_TRUNCATED');
  }
  const eligibleWithTemp = eligible.filter((o) => o.temperatureC != null);
  if (eligible.length > 0 && eligibleWithTemp.length === 0) {
    reasonCodes.push('HEALTH_TEMPERATURE_UNAVAILABLE');
  }
  if (
    input.conditionInput.chemistry.sourceType?.toUpperCase() === 'MANUAL' &&
    input.conditionInput.chemistry.sourceConfidence != null &&
    input.conditionInput.chemistry.sourceConfidence >= 0.99
  ) {
    reasonCodes.push('HEALTH_MANUAL_SPEC_UNVERIFIED');
  }

  let assessmentEligibility: LvEstimatedBatteryHealthAssessmentV1['assessmentEligibility'] =
    'NOT_ASSESSABLE';
  if (
    input.conditionInput.chemistry.normalizedType !== 'UNKNOWN' &&
    episodes.length >= LV_ESTIMATED_HEALTH_MIN_EPISODES_PROVISIONAL
  ) {
    assessmentEligibility = 'PROVISIONAL_INTERNAL_ONLY';
    reasonCodes.push('HEALTH_PROVISIONAL_INTERNAL_ONLY');
  }
  if (
    assessmentEligibility === 'PROVISIONAL_INTERNAL_ONLY' &&
    (input.conditionInput.openProviderObservabilityGapCount > 0 ||
      eligibleWithTemp.length === 0 ||
      input.conditionInput.inputCoverageIncomplete)
  ) {
    assessmentEligibility = 'NOT_PUBLICATION_READY';
    reasonCodes.push('HEALTH_PUBLICATION_NOT_ELIGIBLE');
  }

  const chemistryKnown = input.conditionInput.chemistry.normalizedType !== 'UNKNOWN';
  const specProvidedForRest =
    specUsedForRestingThresholds({
      batteryType: input.conditionInput.chemistry.normalizedType,
      batteryVolt: input.conditionInput.chemistry.nominalVoltageV,
      sourceConfidence: input.conditionInput.chemistry.sourceConfidence,
    }) != null;

  const traceEpisodes: LvEstimatedHealthDecisionTraceEpisodeV1[] = [];
  for (const ep of episodes) {
    const band = classifyEpisodeBand(input, ep.voltageV);
    traceEpisodes.push({
      restSessionId: ep.restSessionId,
      sourceMeasurementId: ep.sourceMeasurementId,
      observationId: ep.observationId,
      voltageV: ep.voltageV,
      voltageObservedAt: ep.voltageObservedAt,
      band,
    });
  }
  const observationTimes = traceEpisodes
    .map((e) => e.voltageObservedAt)
    .filter((t) => Number.isFinite(Date.parse(t)))
    .sort();

  let estimatedHealthStatus: LvEstimatedHealthStatusV1 = 'UNKNOWN';
  let finalRuleId: HealthDecisionRuleIdV1 | null = null;

  if (episodes.length === 1) {
    reasonCodes.push('HEALTH_SINGLE_EPISODE_ONLY');
  }

  const p1Classification = classifyEstimatedHealthStatusP1({
    bandCounts,
    episodeCount: episodes.length,
    trend,
    loadSignal,
    chemistryKnown,
  });

  const temperatureWithProvenance = eligible.filter(
    (o) => o.temperatureC != null && o.providerObservationAt != null,
  );
  const observationSpanDays = observationSpanDaysFromIsoRange(
    observationTimes[0] ?? null,
    observationTimes[observationTimes.length - 1] ?? null,
  );
  const loadProvenanceValidated = hasValidatedStartabilityCrankEvidenceV1(
    input.conditionInput.crankEvidence,
  );

  const researchOverlay = applyResearchPolicyAfterP1(
    researchPolicyVariant,
    p1Classification,
    {
      bandCounts: bandCounts as RestEpisodeBandCounts,
      episodeCount: episodes.length,
      trend,
      loadSignal,
      crankStale,
      loadAuthorizedForHealth,
      loadProvenanceValidated,
      observationSpanDays,
      openProviderGaps: input.conditionInput.openProviderObservabilityGapCount,
      inputCoverageIncomplete: input.conditionInput.inputCoverageIncomplete,
      historicalObservationsTruncated: input.conditionInput.historicalObservationsTruncated,
      temperatureObservationCount: eligibleWithTemp.length,
      temperatureProvenanceValid: temperatureWithProvenance.length > 0,
    },
  );

  estimatedHealthStatus = researchOverlay.status;
  finalRuleId = researchOverlay.ruleId;
  reasonCodes.push(...researchOverlay.extraReasonCodes);

  if (
    loadSignal === 'YELLOW' &&
    n14.operationalRiskStatus === 'GREEN' &&
    estimatedHealthStatus === 'YELLOW' &&
    finalRuleId === 'RULE_LOAD_WEAK_OR_CRITICAL'
  ) {
    reasonCodes.push('HEALTH_LOAD_CONTRADICTS_REST_GREEN');
  }

  if (
    n14.operationalRiskStatus === 'RED' &&
    estimatedHealthStatus === 'GREEN' &&
    loadSignal !== 'RED'
  ) {
    estimatedHealthStatus = 'YELLOW';
    finalRuleId = 'RULE_N14_RED_DAMP_GREEN';
    reasonCodes.push('HEALTH_CONFLICTING_SIGNALS');
    limitations.push('N14 operational RED not auto-mapped to health RED without corroboration.');
  }

  const hasDegraded =
    input.conditionInput.openProviderObservabilityGapCount > 0 ||
    input.conditionInput.inputCoverageIncomplete ||
    eligibleWithTemp.length === 0;

  const estimateConfidence = deriveConfidence(
    episodes.length,
    familySplit.independent,
    hasDegraded,
  );

  const freshness =
    input.conditionInput.latestEligibleRestObservation?.voltageObservedAt ??
    n14.dataFreshnessObservedAt;

  return {
    modelVersion: LV_ESTIMATED_BATTERY_HEALTH_MODEL_VERSION,
    organizationId: input.conditionInput.organizationId,
    vehicleId: input.conditionInput.vehicleId,
    evaluatedAtIso: input.conditionInput.evaluatedAtIso,
    estimatedHealthStatus,
    estimateConfidence,
    assessmentEligibility,
    supportingSignalFamilies: [...new Set(supporting)],
    missingSignalFamilies: [...new Set(missing)],
    evidenceCounts: {
      eligibleRestObservations: eligible.length,
      qualifiedRestEpisodes: episodes.length,
      episodeRestGood: bandCounts.GOOD,
      episodeRestWatch: bandCounts.WATCH,
      episodeRestWarning: bandCounts.WARNING,
      episodeRestCritical: bandCounts.CRITICAL,
      wakeObservations: input.conditionInput.wakeVoltageObservations.length,
      sessionFeaturesEvaluable,
      openProviderGaps: input.conditionInput.openProviderObservabilityGapCount,
      postRestoreGeObservations: input.postRestoreObservationCount,
    },
    dataFreshnessObservedAt: freshness,
    reasonCodes: [...new Set(reasonCodes)],
    limitations,
    measuredSOH: 'UNKNOWN',
    n14OperationalRiskStatus: n14.operationalRiskStatus,
    n14StartabilityStatus: n14.startabilityStatus,
    customerPublicationEnabled: false,
    decisionTrace: {
      policyId: researchPolicyIdForVariant(researchPolicyVariant),
      observationTimeRange: {
        earliestIso: observationTimes[0] ?? null,
        latestIso: observationTimes[observationTimes.length - 1] ?? null,
      },
      qualifiedEpisodeCount: episodes.length,
      episodes: traceEpisodes,
      bandCounts: bandCounts as RestEpisodeBandCounts,
      chemistry: input.conditionInput.chemistry.normalizedType,
      specProvidedForRestThresholds: Boolean(specProvidedForRest),
      longitudinalTrend: trend,
      loadSignal,
      crankStale,
      independentFamilies: familySplit.independent,
      correlatedFamiliesExcluded: familySplit.correlatedExcluded,
      finalRuleId,
      researchRuleId: researchOverlay.researchRuleId ?? null,
      researchPolicyVariant,
    },
  };
}
