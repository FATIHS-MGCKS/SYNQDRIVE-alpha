import type { ResolvedBatteryPolicy } from '../../battery-policy-profile/battery-policy-profile.types';
import { isLeadAcidCurveApplicable } from '../../lv-battery-chemistry/lv-battery-chemistry-resolver';
import {
  BatteryChemistry,
  BatteryEvidenceStrength,
  BatteryMeasurementType,
} from '../battery-v2-domain';
import type { BatteryHealthStatus } from '../battery-status';
import {
  LV_AMBIENT_TEMPERATURE_CONTEXT,
  LV_ASSESSMENT_CONFIDENCE_LEVEL_THRESHOLDS,
  LV_ASSESSMENT_THRESHOLDS_VERSION,
  LV_PROXY_DIAGNOSTIC_BASE_CONFIDENCE,
  LV_TELEMETRY_REST_BASE_CONFIDENCE,
  LV_UNKNOWN_CHEMISTRY_BASE_CONFIDENCE,
  LV_WORKSHOP_EVIDENCE_BASE_CONFIDENCE,
  estimateLeadAcidSocPercent,
  getVersionedRestingBandsForChemistry,
} from './lv-assessment-thresholds';

export const LV_CHEMISTRY_ASSESSMENT_CONTEXT_VERSION = '1.0.0';

export const LV_ASSESSMENT_CONFIDENCE_LEVELS = [
  'HIGH',
  'MEDIUM',
  'LOW',
  'INSUFFICIENT',
] as const;

export type LvAssessmentConfidenceLevel =
  (typeof LV_ASSESSMENT_CONFIDENCE_LEVELS)[number];

export const LV_AMBIENT_TEMPERATURE_SOURCES = [
  'EXTERIOR_AIR',
  'TRIP_CONTEXT',
  'UNKNOWN',
] as const;

export type LvAmbientTemperatureSource =
  (typeof LV_AMBIENT_TEMPERATURE_SOURCES)[number];

export const LV_ASSESSMENT_EVIDENCE_PRIORITIES = [
  'WORKSHOP_OVERRIDE',
  'LOAD_TEST_OVERRIDE',
  'TELEMETRY',
  'NONE',
] as const;

export type LvAssessmentEvidencePriority =
  (typeof LV_ASSESSMENT_EVIDENCE_PRIORITIES)[number];

export interface LvAmbientTemperatureContext {
  /** Always exterior/ambient measurement context — never battery cell temperature. */
  semantic: typeof LV_AMBIENT_TEMPERATURE_CONTEXT.semantic;
  isBatteryTemperature: false;
  measurementContextOnly: true;
  ambientTemperatureC: number | null;
  source: LvAmbientTemperatureSource;
}

export interface LvChemistryAssessmentContext {
  contextVersion: string;
  thresholdsVersion: string;
  chemistry: BatteryChemistry;
  restingBands: ReturnType<typeof getVersionedRestingBandsForChemistry>;
  chemicalSocEstimationAllowed: boolean;
  restingVoltageV: number | null;
  restingVoltageStatus: BatteryHealthStatus | 'UNSUPPORTED';
  estimatedSocPercent: number | null;
  temperatureContext: LvAmbientTemperatureContext;
  temperatureUncertainty: boolean;
  temperatureUncertaintyLabelDe: string | null;
  confidenceScore: number;
  confidence: LvAssessmentConfidenceLevel;
  evidencePriority: LvAssessmentEvidencePriority;
}

export interface BuildLvChemistryAssessmentContextInput {
  policy: ResolvedBatteryPolicy;
  restingVoltageV?: number | null;
  ambientTemperatureC?: number | null;
  ambientTemperatureSource?: Exclude<LvAmbientTemperatureSource, 'UNKNOWN'> | null;
  measurementType?: BatteryMeasurementType | null;
  evidenceStrength?: BatteryEvidenceStrength | null;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function resolveConfidenceLevel(score: number): LvAssessmentConfidenceLevel {
  if (score >= LV_ASSESSMENT_CONFIDENCE_LEVEL_THRESHOLDS.highMinScore) {
    return 'HIGH';
  }
  if (score >= LV_ASSESSMENT_CONFIDENCE_LEVEL_THRESHOLDS.mediumMinScore) {
    return 'MEDIUM';
  }
  if (score >= LV_ASSESSMENT_CONFIDENCE_LEVEL_THRESHOLDS.lowMinScore) {
    return 'LOW';
  }
  return 'INSUFFICIENT';
}

function classifyRestingVoltageWithBands(
  voltageV: number,
  bands: NonNullable<ReturnType<typeof getVersionedRestingBandsForChemistry>>,
): BatteryHealthStatus {
  if (voltageV >= bands.goodMinV) return 'GOOD';
  if (voltageV >= bands.watchMinV) return 'WATCH';
  if (voltageV >= bands.warningMinV) return 'WARNING';
  return 'CRITICAL';
}

function resolveEvidencePriority(
  measurementType: BatteryMeasurementType | null | undefined,
  evidenceStrength: BatteryEvidenceStrength | null | undefined,
): LvAssessmentEvidencePriority {
  if (measurementType === BatteryMeasurementType.WORKSHOP_OCV) {
    return 'WORKSHOP_OVERRIDE';
  }
  if (measurementType === BatteryMeasurementType.WORKSHOP_LOAD_TEST) {
    return 'LOAD_TEST_OVERRIDE';
  }
  if (
    evidenceStrength === BatteryEvidenceStrength.OVERRIDE ||
    measurementType != null
  ) {
    return 'TELEMETRY';
  }
  return 'NONE';
}

function resolveBaseConfidence(input: {
  evidencePriority: LvAssessmentEvidencePriority;
  evidenceStrength: BatteryEvidenceStrength | null | undefined;
  chemistry: BatteryChemistry;
  chemicalSocEstimationAllowed: boolean;
}): number {
  if (
    input.evidencePriority === 'WORKSHOP_OVERRIDE' ||
    input.evidencePriority === 'LOAD_TEST_OVERRIDE'
  ) {
    return LV_WORKSHOP_EVIDENCE_BASE_CONFIDENCE;
  }

  if (
    input.chemistry === BatteryChemistry.UNKNOWN ||
    input.chemistry === BatteryChemistry.LITHIUM ||
    !input.chemicalSocEstimationAllowed
  ) {
    return LV_UNKNOWN_CHEMISTRY_BASE_CONFIDENCE;
  }

  if (
    input.evidenceStrength === BatteryEvidenceStrength.DIAGNOSTIC ||
    input.evidenceStrength === BatteryEvidenceStrength.SUPPLEMENTARY
  ) {
    return LV_PROXY_DIAGNOSTIC_BASE_CONFIDENCE;
  }

  return LV_TELEMETRY_REST_BASE_CONFIDENCE;
}

function buildAmbientTemperatureContext(input: {
  ambientTemperatureC?: number | null;
  ambientTemperatureSource?: Exclude<LvAmbientTemperatureSource, 'UNKNOWN'> | null;
}): LvAmbientTemperatureContext {
  const ambientTemperatureC =
    input.ambientTemperatureC != null && Number.isFinite(input.ambientTemperatureC)
      ? input.ambientTemperatureC
      : null;

  return {
    semantic: LV_AMBIENT_TEMPERATURE_CONTEXT.semantic,
    isBatteryTemperature: false,
    measurementContextOnly: true,
    ambientTemperatureC,
    source:
      ambientTemperatureC == null
        ? 'UNKNOWN'
        : (input.ambientTemperatureSource ?? 'UNKNOWN'),
  };
}

function evaluateTemperatureUncertainty(
  ambientTemperatureC: number | null,
): { uncertain: boolean; labelDe: string | null } {
  if (ambientTemperatureC == null) {
    return { uncertain: false, labelDe: null };
  }

  if (ambientTemperatureC <= LV_AMBIENT_TEMPERATURE_CONTEXT.extremeColdC) {
    return {
      uncertain: true,
      labelDe: 'Bewertung bei extremer Kälte temperaturbedingt unsicher',
    };
  }

  if (ambientTemperatureC >= LV_AMBIENT_TEMPERATURE_CONTEXT.extremeHotC) {
    return {
      uncertain: true,
      labelDe: 'Bewertung bei extremer Hitze temperaturbedingt unsicher',
    };
  }

  return { uncertain: false, labelDe: null };
}

function applyTemperatureConfidenceAdjustments(input: {
  baseScore: number;
  temperatureContext: LvAmbientTemperatureContext;
  temperatureUncertainty: boolean;
}): number {
  let score = input.baseScore;

  if (input.temperatureContext.ambientTemperatureC == null) {
    score -= LV_AMBIENT_TEMPERATURE_CONTEXT.missingConfidencePenalty;
  }

  if (input.temperatureUncertainty) {
    score = Math.min(
      score,
      LV_AMBIENT_TEMPERATURE_CONTEXT.extremeConfidenceCap,
    );
  }

  return clamp01(score);
}

/**
 * Builds a chemistry-specific LV assessment context.
 * Voltage/SOC values are never arbitrarily adjusted for temperature — only confidence.
 */
export function buildLvChemistryAssessmentContext(
  input: BuildLvChemistryAssessmentContextInput,
): LvChemistryAssessmentContext {
  const chemistry = input.policy.chemistry;
  const restingBands =
    input.policy.restingBands ?? getVersionedRestingBandsForChemistry(chemistry);
  const chemicalSocEstimationAllowed =
    input.policy.chemicalSocEstimationAllowed &&
    isLeadAcidCurveApplicable(chemistry);

  const restingVoltageV =
    input.restingVoltageV != null && Number.isFinite(input.restingVoltageV)
      ? input.restingVoltageV
      : null;

  let restingVoltageStatus: BatteryHealthStatus | 'UNSUPPORTED' = 'UNSUPPORTED';
  if (restingVoltageV != null && restingBands) {
    restingVoltageStatus = classifyRestingVoltageWithBands(
      restingVoltageV,
      restingBands,
    );
  } else if (restingVoltageV != null) {
    restingVoltageStatus = 'UNSUPPORTED';
  } else {
    restingVoltageStatus = 'UNKNOWN';
  }

  const estimatedSocPercent =
    restingVoltageV != null && chemicalSocEstimationAllowed
      ? estimateLeadAcidSocPercent(restingVoltageV)
      : null;

  const temperatureContext = buildAmbientTemperatureContext(input);
  const temperatureEvaluation = evaluateTemperatureUncertainty(
    temperatureContext.ambientTemperatureC,
  );

  const evidencePriority = resolveEvidencePriority(
    input.measurementType,
    input.evidenceStrength ?? null,
  );

  const baseConfidence = resolveBaseConfidence({
    evidencePriority,
    evidenceStrength: input.evidenceStrength ?? null,
    chemistry,
    chemicalSocEstimationAllowed,
  });

  const confidenceScore = applyTemperatureConfidenceAdjustments({
    baseScore: baseConfidence,
    temperatureContext,
    temperatureUncertainty: temperatureEvaluation.uncertain,
  });

  return {
    contextVersion: LV_CHEMISTRY_ASSESSMENT_CONTEXT_VERSION,
    thresholdsVersion: LV_ASSESSMENT_THRESHOLDS_VERSION,
    chemistry,
    restingBands,
    chemicalSocEstimationAllowed,
    restingVoltageV,
    restingVoltageStatus,
    estimatedSocPercent,
    temperatureContext,
    temperatureUncertainty: temperatureEvaluation.uncertain,
    temperatureUncertaintyLabelDe: temperatureEvaluation.labelDe,
    confidenceScore,
    confidence: resolveConfidenceLevel(confidenceScore),
    evidencePriority,
  };
}
