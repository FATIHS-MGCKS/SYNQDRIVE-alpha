import {
  classifyRestingVoltage,
  specUsedForRestingThresholds,
} from '../../battery-status';
import {
  isEligibleRestObservationForConditionV1,
  medianRestVoltageMv,
  observationProviderEventTimeMs,
} from '../lv-operational-condition/lv-operational-condition-observation.policy';
import { evaluateLvOperationalConditionV1 } from '../lv-operational-condition/lv-operational-condition-v1.evaluator';
import {
  evaluateStartabilityV1,
  hasValidatedStartabilityCrankEvidenceV1,
} from '../lv-operational-condition/lv-operational-condition-startability.policy';
import {
  LV_ESTIMATED_BATTERY_HEALTH_MODEL_VERSION,
  LV_ESTIMATED_HEALTH_CRANK_MAX_AGE_MS,
  LV_ESTIMATED_HEALTH_MIN_EPISODES_PROVISIONAL,
} from './lv-estimated-battery-health-v1.constants';
import {
  independentSupportingFamiliesP1,
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
import { LV_ESTIMATED_BATTERY_HEALTH_P11_POLICY_ID } from './lv-estimated-battery-health-p11.constants';
import {
  buildP11RecencyEpisodeSet,
  classifyEstimatedHealthStatusP11,
  type P11EpisodeWithBand,
} from './lv-estimated-battery-health-p11-decision-policy';
import { selectP11EpisodeRepresentatives } from './lv-estimated-battery-health-p11-episode.policy';
import { evaluateP11LongitudinalTrend } from './lv-estimated-battery-health-p11-trend.policy';

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

function countBands(rows: P11EpisodeWithBand[]): RestEpisodeBandCounts {
  const c = { GOOD: 0, WATCH: 0, WARNING: 0, CRITICAL: 0, UNSUPPORTED: 0 };
  for (const row of rows) c[row.band] += 1;
  return c;
}

/**
 * P11 shadow evaluator — episode quality, recency/recovery policy, robust trend.
 * Not wired to customer publication; default Nest path remains P1.
 */
export function evaluateLvEstimatedBatteryHealthP11V1(
  input: LvEstimatedBatteryHealthInputV1,
): LvEstimatedBatteryHealthAssessmentV1 {
  const n14 = evaluateLvOperationalConditionV1(input.conditionInput);
  const reasonCodes: LvEstimatedHealthReasonCodeV1[] = [
    'HEALTH_N14_OPERATIONAL_RISK_NOT_HEALTH_PROXY',
    'HEALTH_P11_STABLE_BASELINE_USED',
  ];
  const limitations = [
    'Shadow-only P11 estimated health classification; customer publication disabled.',
    'Not laboratory SOH %, capacity, CCA or remaining lifetime.',
    'Distinct from N14 operationalRiskStatus (charge/voltage operational indicator).',
    'Low-voltage REST events may be retained as evidence without defining stable baseline.',
  ];

  const evalMs = Date.parse(input.conditionInput.evaluatedAtIso);
  const visibleAsOfEvaluation = (obs: { providerObservationAt: string | null; voltageObservedAt: string }) => {
    const t = observationProviderEventTimeMs(obs as Parameters<typeof observationProviderEventTimeMs>[0]);
    return Number.isFinite(evalMs) ? Number.isFinite(t) && t <= evalMs : true;
  };
  const eligible = input.conditionInput.eligibleRestObservations
    .filter(isEligibleRestObservationForConditionV1)
    .filter(visibleAsOfEvaluation);
  const timeline = (input.conditionInput.assessmentTimelineObservations ?? eligible).filter(
    visibleAsOfEvaluation,
  );

  const selection = selectP11EpisodeRepresentatives({
    eligibleRestObservations: eligible,
    assessmentTimelineObservations: timeline,
    evaluatedAtIso: input.conditionInput.evaluatedAtIso,
  });
  const episodes = selection.episodes;
  if (selection.lowVoltageEvents.length > 0) {
    reasonCodes.push('HEALTH_P11_LOW_VOLTAGE_EVENT_RETAINED');
  }
  if (selection.trace.sessionsPreStartSuspectOnly > 0) {
    reasonCodes.push('HEALTH_P11_PRE_START_WAKE_EXCLUDED');
  }

  const episodesWithBands: P11EpisodeWithBand[] = episodes.map((ep) => ({
    episode: ep,
    band: classifyEpisodeBand(input, ep.representativeVoltageV),
  }));
  const bandCounts = countBands(episodesWithBands);

  const stableAnchorRows = episodesWithBands.filter(
    (r) => r.episode.stabilityClass !== 'PRE_START_WAKE_SUSPECT',
  );
  const anchorMedianMv = medianRestVoltageMv(
    stableAnchorRows.map((r) => ({
      observationId: r.episode.observationId,
      sourceMeasurementId: r.episode.sourceMeasurementId,
      restSessionId: r.episode.restSessionId,
      voltageV: r.episode.representativeVoltageV,
      voltageObservedAt: r.episode.voltageObservedAt,
      providerObservationAt: r.episode.providerObservationAt,
      operationalContext: 'REST',
      evidenceClass: r.episode.evidenceClass,
      actualRestAgeHours: r.episode.actualRestAgeHours,
      temperatureC: r.episode.temperatureC,
      isLvCharging: r.episode.isLvCharging,
      engineRunning: r.episode.engineRunning,
    })),
  );
  const anchorMedianBand =
    anchorMedianMv != null
      ? classifyEpisodeBand(input, anchorMedianMv / 1000)
      : ('UNSUPPORTED' as RestEpisodeBand);

  const recencyRows = buildP11RecencyEpisodeSet(
    episodesWithBands,
    input.conditionInput.evaluatedAtIso,
  );
  const recencyBandCounts = countBands(recencyRows);

  const trendEval = evaluateP11LongitudinalTrend(episodes);
  const trend = trendEval.trend;
  if (trend === 'DECLINE') reasonCodes.push('HEALTH_LONGITUDINAL_DECLINE_SUSPECTED');
  else if (trend === 'STABLE') reasonCodes.push('HEALTH_LONGITUDINAL_STABLE');
  else if (trend === 'IMPROVING') reasonCodes.push('HEALTH_LONGITUDINAL_IMPROVING');
  else reasonCodes.push('HEALTH_LONGITUDINAL_NOT_EVALUABLE');

  const startability = evaluateStartabilityV1({
    observations: [...eligible, ...input.conditionInput.wakeVoltageObservations],
    crankEvidence: input.conditionInput.crankEvidence,
  });
  const crankStale = isCrankEvidenceStale(input);
  let loadSignal: LvEstimatedHealthStatusV1 = 'UNKNOWN';
  let loadAuthorizedForHealth = false;
  if (crankStale && input.conditionInput.crankEvidence) {
    reasonCodes.push('HEALTH_LOAD_CRANK_STALE');
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

  const familyTrendForP1 =
    trend === 'IMPROVING' ? 'NOT_EVALUABLE' : trend === 'DECLINE' || trend === 'STABLE' ? trend : 'NOT_EVALUABLE';

  const familySplit = independentSupportingFamiliesP1({
    hasRestEpisodes: episodes.length > 0,
    trend: familyTrendForP1,
    loadAuthorized: loadAuthorizedForHealth,
    hasChargingRecoveryEvidence,
  });

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
  const specProvidedForRest = specUsedForRestingThresholds({
    batteryType: input.conditionInput.chemistry.normalizedType,
    batteryVolt: input.conditionInput.chemistry.nominalVoltageV,
    sourceConfidence: input.conditionInput.chemistry.sourceConfidence,
  });

  const p11 = classifyEstimatedHealthStatusP11({
    episodesWithBands,
    bandCounts,
    anchorMedianBand,
    recencyBandCounts,
    recencyEpisodeCount: recencyRows.length,
    trend,
    loadSignal,
    chemistryKnown,
    evaluatedAtIso: input.conditionInput.evaluatedAtIso,
  });

  for (const code of p11.extraReasonCodes) reasonCodes.push(code);
  for (const row of episodesWithBands) {
    if (row.band === 'GOOD') reasonCodes.push('HEALTH_REST_EPISODES_STABLE_GOOD');
    if (row.band === 'WATCH') reasonCodes.push('HEALTH_REST_EPISODES_WATCH');
    if (row.band === 'WARNING') reasonCodes.push('HEALTH_REST_EPISODES_WARNING');
    if (row.band === 'CRITICAL') reasonCodes.push('HEALTH_REST_EPISODES_CRITICAL');
  }

  let estimatedHealthStatus = p11.status;
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

  const estimateConfidence = deriveConfidence(
    episodes.length,
    familySplit.independent,
    hasDegraded,
  );

  const traceEpisodes: LvEstimatedHealthDecisionTraceEpisodeV1[] = episodesWithBands.map((row) => ({
    restSessionId: row.episode.restSessionId,
    sourceMeasurementId: row.episode.sourceMeasurementId,
    observationId: row.episode.observationId,
    voltageV: row.episode.representativeVoltageV,
    voltageObservedAt: row.episode.voltageObservedAt,
    band: row.band,
  }));
  const observationTimes = traceEpisodes
    .map((e) => e.voltageObservedAt)
    .filter((t) => Number.isFinite(Date.parse(t)))
    .sort();

  return {
    modelVersion: LV_ESTIMATED_BATTERY_HEALTH_MODEL_VERSION,
    organizationId: input.conditionInput.organizationId,
    vehicleId: input.conditionInput.vehicleId,
    evaluatedAtIso: input.conditionInput.evaluatedAtIso,
    estimatedHealthStatus,
    estimateConfidence,
    assessmentEligibility,
    supportingSignalFamilies: [...new Set(familySplit.independent)],
    missingSignalFamilies: [],
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
    dataFreshnessObservedAt:
      input.conditionInput.latestEligibleRestObservation?.voltageObservedAt ??
      n14.dataFreshnessObservedAt,
    reasonCodes: [...new Set(reasonCodes)],
    limitations,
    measuredSOH: 'UNKNOWN',
    n14OperationalRiskStatus: n14.operationalRiskStatus,
    n14StartabilityStatus: n14.startabilityStatus,
    customerPublicationEnabled: false,
    decisionTrace: {
      policyId: LV_ESTIMATED_BATTERY_HEALTH_P11_POLICY_ID,
      observationTimeRange: {
        earliestIso: observationTimes[0] ?? null,
        latestIso: observationTimes[observationTimes.length - 1] ?? null,
      },
      qualifiedEpisodeCount: episodes.length,
      episodes: traceEpisodes,
      bandCounts,
      chemistry: input.conditionInput.chemistry.normalizedType,
      specProvidedForRestThresholds: Boolean(specProvidedForRest),
      longitudinalTrend: familyTrendForP1,
      loadSignal,
      crankStale,
      independentFamilies: familySplit.independent,
      correlatedFamiliesExcluded: familySplit.correlatedExcluded,
      finalRuleId: null,
      researchRuleId: null,
      researchPolicyVariant: 'P11_CONDITION_POLICY_V2',
      p11LongitudinalTrend: trend,
      p11EpisodeSelectionTrace: selection.trace,
      p11ShadowRuleId: p11.ruleId,
    },
  };
}
