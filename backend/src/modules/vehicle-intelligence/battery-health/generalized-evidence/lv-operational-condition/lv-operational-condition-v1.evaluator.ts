import {
  classifyRestingVoltage,
  specUsedForRestingThresholds,
} from '../../battery-status';
import {
  LV_OPERATIONAL_CONDITION_MODEL_VERSION,
  LV_OPERATIONAL_MIN_ELIGIBLE_REST_OBSERVATIONS,
  LV_OPERATIONAL_MIN_REST_AGE_HOURS,
} from './lv-operational-condition-v1.constants';
import {
  isEligibleRestObservationForConditionV1,
  medianRestVoltageMv,
  selectEpisodeRepresentativesForOperationalRisk,
} from './lv-operational-condition-observation.policy';
import { evaluateStartabilityV1 } from './lv-operational-condition-startability.policy';
import type {
  LvOperationalConditionAssessmentV1,
  LvOperationalConditionInputV1,
  LvOperationalConditionObservationV1,
  LvOperationalConditionReasonCodeV1,
  LvOperationalConditionStatusV1,
  LvOperationalDataQualityStatusV1,
  LvOperationalRestingChargeBandV1,
} from './lv-operational-condition-v1.types';

function mapRestingStatusToOperationalRisk(
  restingStatus: string,
): { status: LvOperationalConditionStatusV1; code: LvOperationalConditionReasonCodeV1 } {
  switch (restingStatus) {
    case 'GOOD':
      return { status: 'GREEN', code: 'REST_VOLTAGE_GOOD' };
    case 'WATCH':
      return { status: 'YELLOW', code: 'REST_VOLTAGE_WATCH' };
    case 'WARNING':
      return { status: 'YELLOW', code: 'REST_VOLTAGE_WARNING' };
    case 'CRITICAL':
      return { status: 'RED', code: 'REST_VOLTAGE_CRITICAL' };
    default:
      return { status: 'UNKNOWN', code: 'NO_ELIGIBLE_REST_OBSERVATIONS' };
  }
}

function buildCoarseRestingChargeBand(
  restingBandStatus: string,
  chemistryType: string,
): LvOperationalRestingChargeBandV1 {
  if (chemistryType === 'LITHIUM' || chemistryType === 'UNKNOWN' || restingBandStatus === 'UNSUPPORTED') {
    return {
      qualification: 'NOT_EVALUABLE',
      bandStatus: null,
      reasonCodes: ['REST_CHARGE_BAND_NOT_EVALUABLE'],
    };
  }
  if (restingBandStatus === 'UNKNOWN') {
    return {
      qualification: 'NOT_EVALUABLE',
      bandStatus: null,
      reasonCodes: ['REST_CHARGE_BAND_NOT_EVALUABLE'],
    };
  }
  return {
    qualification: 'COARSE_BAND_ONLY',
    bandStatus: restingBandStatus as LvOperationalRestingChargeBandV1['bandStatus'],
    reasonCodes: ['REST_CHARGE_BAND_COARSE_ONLY'],
  };
}

function deriveDataQuality(input: LvOperationalConditionInputV1): {
  status: LvOperationalDataQualityStatusV1;
  reasonCodes: LvOperationalConditionReasonCodeV1[];
} {
  const codes: LvOperationalConditionReasonCodeV1[] = [];
  if (input.openProviderObservabilityGapCount > 0) {
    codes.push('PROVIDER_GAP_OPEN');
  }
  if (input.inputCoverageIncomplete || input.historicalObservationsTruncated) {
    codes.push('INPUT_COVERAGE_TRUNCATED');
  }
  if (
    input.chemistry.sourceType?.toUpperCase() === 'MANUAL' &&
    input.chemistry.sourceConfidence != null &&
    input.chemistry.sourceConfidence >= 0.99
  ) {
    codes.push('MANUAL_BATTERY_SPEC_NOT_PHYSICALLY_VERIFIED');
  }

  const eligible = input.eligibleRestObservations.filter(isEligibleRestObservationForConditionV1);
  const withTemp = eligible.filter((o) => o.temperatureC != null && Number.isFinite(o.temperatureC));
  if (eligible.length > 0 && withTemp.length === 0) {
    codes.push('TEMPERATURE_MISSING_WHERE_REQUIRED');
  }

  if (eligible.length === 0) {
    return { status: 'INSUFFICIENT', reasonCodes: codes };
  }
  if (codes.length > 0) {
    return { status: 'DEGRADED', reasonCodes: codes };
  }
  return { status: 'ADEQUATE', reasonCodes: [] };
}

function deriveAssessmentConfidence(
  episodeRepresentatives: LvOperationalConditionObservationV1[],
  dataQuality: LvOperationalDataQualityStatusV1,
): LvOperationalConditionAssessmentV1['assessmentConfidence'] {
  if (episodeRepresentatives.length === 0 || dataQuality === 'INSUFFICIENT') {
    return 'NONE';
  }
  if (dataQuality === 'DEGRADED') {
    return episodeRepresentatives.length >= 2 ? 'LOW' : 'NONE';
  }
  if (episodeRepresentatives.length >= 3) return 'HIGH';
  if (episodeRepresentatives.length >= 2) return 'MEDIUM';
  return 'LOW';
}

/**
 * Pure, deterministic LV operational condition estimator (non-authoritative, internal).
 */
export function evaluateLvOperationalConditionV1(
  input: LvOperationalConditionInputV1,
): LvOperationalConditionAssessmentV1 {
  const reasonCodes: LvOperationalConditionReasonCodeV1[] = [];
  const limitations: string[] = [
    'Internal non-authoritative model; not customer publication.',
    'No measured SOH %, CCA, capacity or remaining lifetime from voltage alone.',
    'Resting voltage bands reuse battery-status.ts chemistry thresholds; not a calibrated SoC % estimator.',
    'sourceConfidence on VehicleBatterySpec does not prove physical battery verification.',
    'Startability requires battery_features crank/load voltage evidence; GE REST_WAKE sequences alone are insufficient (P1.1).',
  ];

  const chemistryType = input.chemistry.normalizedType;
  if (chemistryType === 'UNKNOWN') {
    reasonCodes.push('CHEMISTRY_UNKNOWN');
  }

  const dataQualityResult = deriveDataQuality(input);
  reasonCodes.push(...dataQualityResult.reasonCodes);

  const eligible = input.eligibleRestObservations.filter(isEligibleRestObservationForConditionV1);
  const unverifiedRest = eligible.filter(
    (o) => o.actualRestAgeHours == null || o.actualRestAgeHours < LV_OPERATIONAL_MIN_REST_AGE_HOURS,
  );
  if (eligible.length > 0 && unverifiedRest.length === eligible.length) {
    reasonCodes.push('REST_STABILIZATION_UNVERIFIED');
  } else if (unverifiedRest.length > 0) {
    reasonCodes.push('REST_AGE_TOO_SHORT');
  }

  const hasContextLimitedSlopeOnly = input.sessionFeatures.some(
    (f) =>
      f.slopeInterpretability === 'CONTEXT_LIMITED' &&
      (f.slopeLimitationCodes.includes('C3_SLOPE_SHORT_OBSERVATION_SPAN') ||
        f.slopeLimitationCodes.includes('C3_SLOPE_CHARGING_TRANSITION_END')),
  );
  if (hasContextLimitedSlopeOnly) {
    reasonCodes.push('CONTEXT_LIMITED_SLOPE_ONLY');
    limitations.push('Longitudinal C3 slopes flagged CONTEXT_LIMITED are excluded from risk escalation.');
  }

  const startability = evaluateStartabilityV1({
    observations: [...input.eligibleRestObservations, ...input.wakeVoltageObservations],
    crankEvidence: input.crankEvidence,
  });
  reasonCodes.push(...startability.reasonCodes);

  const episodeRepresentatives = selectEpisodeRepresentativesForOperationalRisk(eligible);

  let operationalRiskStatus: LvOperationalConditionStatusV1 = 'UNKNOWN';
  let restingVoltageBand: LvOperationalConditionAssessmentV1['restingVoltageBand'] = 'NOT_EVALUABLE';
  let restingThresholdSource: LvOperationalConditionAssessmentV1['restingThresholdSource'] = 'NONE';

  const restForRisk = episodeRepresentatives;

  const medianMv = medianRestVoltageMv(restForRisk);
  const minMv =
    restForRisk.length > 0 ? Math.min(...restForRisk.map((o) => o.voltageV * 1000)) : null;
  const maxMv =
    restForRisk.length > 0 ? Math.max(...restForRisk.map((o) => o.voltageV * 1000)) : null;

  if (chemistryType === 'UNKNOWN') {
    operationalRiskStatus = 'UNKNOWN';
  } else if (restForRisk.length === 0) {
    reasonCodes.push('NO_ELIGIBLE_REST_OBSERVATIONS');
    operationalRiskStatus = 'UNKNOWN';
  } else if (restForRisk.length < LV_OPERATIONAL_MIN_ELIGIBLE_REST_OBSERVATIONS) {
    reasonCodes.push('NO_ELIGIBLE_REST_OBSERVATIONS');
    operationalRiskStatus = 'UNKNOWN';
  } else {
    const medianV = medianMv != null ? medianMv / 1000 : null;
    const specProvided = specUsedForRestingThresholds({
      batteryType: input.chemistry.normalizedType,
      batteryVolt: input.chemistry.nominalVoltageV,
      sourceConfidence: input.chemistry.sourceConfidence,
    });
    const resting = classifyRestingVoltage(medianV, chemistryType, { specProvided });
    restingThresholdSource = resting.thresholdSource;
    restingVoltageBand = resting.status === 'UNSUPPORTED' ? 'UNSUPPORTED' : resting.status;

    if (resting.status === 'UNSUPPORTED') {
      reasonCodes.push('CHEMISTRY_UNSUPPORTED');
      operationalRiskStatus = 'UNKNOWN';
    } else {
      const mapped = mapRestingStatusToOperationalRisk(resting.status);
      operationalRiskStatus = mapped.status;
      reasonCodes.push(mapped.code);
    }
  }

  const restingChargeBand = buildCoarseRestingChargeBand(
    restingVoltageBand === 'NOT_EVALUABLE' ? 'UNKNOWN' : restingVoltageBand,
    chemistryType,
  );
  reasonCodes.push(...restingChargeBand.reasonCodes);

  const assessmentConfidence = deriveAssessmentConfidence(
    restForRisk,
    dataQualityResult.status,
  );

  const evidenceIds = [
    ...new Set(
      [
        ...restForRisk.map((o) => o.observationId),
        ...input.wakeVoltageObservations.map((o) => o.observationId),
        input.latestGlobalObservation?.observationId,
        input.latestEligibleRestObservation?.observationId,
      ].filter(Boolean) as string[],
    ),
  ];

  const freshness =
    input.latestEligibleRestObservation?.voltageObservedAt ??
    input.latestGlobalObservation?.voltageObservedAt ??
    (restForRisk.length > 0 ? restForRisk[restForRisk.length - 1].voltageObservedAt : null);

  return {
    modelVersion: input.modelVersion || LV_OPERATIONAL_CONDITION_MODEL_VERSION,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    evaluatedAtIso: input.evaluatedAtIso,
    restingVoltageBand,
    restingThresholdSource,
    restingChargeBand,
    operationalRiskStatus,
    dataQuality: dataQualityResult.status,
    assessmentConfidence,
    chemistry: input.chemistry,
    startabilityStatus: startability.status,
    startabilityCrankDropBand: startability.crankDropBand,
    crankEvidence: input.crankEvidence,
    latestEligibleRestAgeHours: input.latestEligibleRestObservation?.actualRestAgeHours ?? null,
    actualStateOfHealth: 'UNKNOWN',
    evidenceObservationIds: evidenceIds,
    dataFreshnessObservedAt: freshness,
    reasonCodes: [...new Set(reasonCodes)],
    limitations,
    eligibleRestObservationCount: eligible.length,
    qualifiedRestEpisodeCount: restForRisk.length,
    qualifiedRestVoltageMv: {
      min: minMv,
      max: maxMv,
      median: medianMv,
      sampleCount: restForRisk.length,
    },
  };
}
