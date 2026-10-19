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
import { evaluateStartabilityV1 } from '../lv-operational-condition/lv-operational-condition-startability.policy';
import {
  LV_ESTIMATED_BATTERY_HEALTH_MODEL_VERSION,
  LV_ESTIMATED_HEALTH_CRANK_MAX_AGE_MS,
  LV_ESTIMATED_HEALTH_MIN_EPISODES_PROVISIONAL,
  LV_ESTIMATED_HEALTH_MIN_EPISODES_TREND,
} from './lv-estimated-battery-health-v1.constants';
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

/**
 * Pure shadow estimator for estimated 12V battery health (not SOH %, not N14 operational risk rename).
 */
export function evaluateLvEstimatedBatteryHealthV1(
  input: LvEstimatedBatteryHealthInputV1,
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
    supporting.push('LONGITUDINAL_STABILITY');
    missing.splice(missing.indexOf('LONGITUDINAL_STABILITY'), 1);
    reasonCodes.push('HEALTH_LONGITUDINAL_DECLINE_SUSPECTED');
  } else if (trend === 'STABLE') {
    supporting.push('LONGITUDINAL_STABILITY');
    missing.splice(missing.indexOf('LONGITUDINAL_STABILITY'), 1);
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
  if (crankStale && input.conditionInput.crankEvidence) {
    reasonCodes.push('HEALTH_LOAD_CRANK_STALE');
    missing.push('LOAD_START_PERFORMANCE');
  } else if (startability.status === 'GREEN') {
    supporting.push('LOAD_START_PERFORMANCE');
    missing.splice(missing.indexOf('LOAD_START_PERFORMANCE'), 1);
    loadSignal = 'GREEN';
    reasonCodes.push('HEALTH_LOAD_CRANK_VALIDATED_GOOD');
  } else if (startability.status === 'YELLOW') {
    supporting.push('LOAD_START_PERFORMANCE');
    missing.splice(missing.indexOf('LOAD_START_PERFORMANCE'), 1);
    loadSignal = 'YELLOW';
    reasonCodes.push('HEALTH_LOAD_CRANK_VALIDATED_WEAK');
  } else if (startability.status === 'RED') {
    supporting.push('LOAD_START_PERFORMANCE');
    missing.splice(missing.indexOf('LOAD_START_PERFORMANCE'), 1);
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
  } else if (episodes.length > 0) {
    supporting.push('CHARGING_RECOVERY_CONTEXT');
    missing.splice(missing.indexOf('CHARGING_RECOVERY_CONTEXT'), 1);
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

  let estimatedHealthStatus: LvEstimatedHealthStatusV1 = 'UNKNOWN';

  if (input.conditionInput.chemistry.normalizedType === 'UNKNOWN') {
    estimatedHealthStatus = 'UNKNOWN';
  } else if (episodes.length < LV_ESTIMATED_HEALTH_MIN_EPISODES_PROVISIONAL) {
    reasonCodes.push('HEALTH_INSUFFICIENT_INDEPENDENT_EPISODES');
    if (episodes.length === 1) reasonCodes.push('HEALTH_SINGLE_EPISODE_ONLY');
    estimatedHealthStatus = 'UNKNOWN';
  } else {
    const hasStrongDeterioration =
      bandCounts.CRITICAL >= 2 ||
      (bandCounts.CRITICAL >= 1 && bandCounts.WARNING >= 1) ||
      (loadSignal === 'RED' && bandCounts.WARNING + bandCounts.CRITICAL >= 1);

    const temporarilyDischarged =
      bandCounts.CRITICAL === 1 &&
      bandCounts.WARNING === 0 &&
      bandCounts.GOOD + bandCounts.WATCH >= 1 &&
      loadSignal !== 'RED';

    if (hasStrongDeterioration) {
      estimatedHealthStatus = 'RED';
    } else if (temporarilyDischarged) {
      estimatedHealthStatus = 'YELLOW';
      reasonCodes.push('HEALTH_TEMPORARILY_DISCHARGED_NOT_AGING');
    } else if (loadSignal === 'RED' || loadSignal === 'YELLOW') {
      estimatedHealthStatus = loadSignal;
      if (n14.operationalRiskStatus === 'GREEN') {
        reasonCodes.push('HEALTH_LOAD_CONTRADICTS_REST_GREEN');
      }
    } else if (
      bandCounts.CRITICAL > 0 ||
      bandCounts.WARNING >= 2 ||
      trend === 'DECLINE'
    ) {
      estimatedHealthStatus = 'YELLOW';
    } else if (
      bandCounts.GOOD + bandCounts.WATCH >= episodes.length - 1 &&
      bandCounts.CRITICAL === 0 &&
      bandCounts.WARNING <= 1 &&
      (loadSignal === 'GREEN' || loadSignal === 'UNKNOWN') &&
      (trend === 'STABLE' || trend === 'NOT_EVALUABLE')
    ) {
      estimatedHealthStatus = 'GREEN';
    } else if (bandCounts.WATCH + bandCounts.WARNING > 0) {
      estimatedHealthStatus = 'YELLOW';
    } else {
      estimatedHealthStatus = 'UNKNOWN';
      reasonCodes.push('HEALTH_CONFLICTING_SIGNALS');
    }
  }

  if (
    n14.operationalRiskStatus === 'RED' &&
    estimatedHealthStatus === 'GREEN' &&
    loadSignal !== 'RED'
  ) {
    estimatedHealthStatus = 'YELLOW';
    reasonCodes.push('HEALTH_CONFLICTING_SIGNALS');
    limitations.push('N14 operational RED not auto-mapped to health RED without corroboration.');
  }

  const hasDegraded =
    input.conditionInput.openProviderObservabilityGapCount > 0 ||
    input.conditionInput.inputCoverageIncomplete ||
    eligibleWithTemp.length === 0;

  const estimateConfidence = deriveConfidence(episodes.length, supporting, hasDegraded);

  const sessionFeaturesEvaluable = input.conditionInput.sessionFeatures.filter(
    (f) => f.slopeInterpretability === 'REST_SELF_DISCHARGE_TREND',
  ).length;

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
  };
}
