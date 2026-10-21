import { BatteryMeasurementQuality } from '@prisma/client';
import {
  assessHvChargeSessionQualityFromInput,
  type HvChargeSessionQualityAssessment,
} from '../hv-charge-session/hv-charge-session-quality.assessor';
import { HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE } from '../hv-charge-session/hv-charge-session.types';
import {
  computeHvM3EstimatedCapacityKwh,
  evaluateHvM3SessionGate,
} from '../hv-capacity-shadow/hv-capacity-m3.policy';
import type { HvCapacityM3SessionInput } from '../hv-capacity-shadow/hv-capacity-m3.types';
import { HV_SOH_GATE_MIN_QUALIFIED_SESSIONS } from '../hv-capacity-shadow/hv-soh-gate.types';
import {
  HV_MEASUREMENT_QUALITY_LEVEL,
  HV_MEASUREMENT_QUALITY_SCORE_BAND,
  HV_MEASUREMENT_RESEARCH_SOC_CHARGE_WINDOWS,
  type HvMeasurementQualityLevel,
  type HvMeasurementQualitySessionInput,
  type HvMeasurementQualitySessionResult,
} from './hv-measurement-quality.types';

const CONTAMINATED_QUALITIES = new Set<string>([
  BatteryMeasurementQuality.CONTAMINATED_BY_CHARGING,
  BatteryMeasurementQuality.CONTAMINATED_BY_WAKE,
  BatteryMeasurementQuality.CONTAMINATED_BY_LOAD,
  BatteryMeasurementQuality.CONTAMINATED_BY_ACTIVE_TRIP,
]);

function mdString(metadata: Record<string, unknown> | null, key: string): string | null {
  const v = metadata?.[key];
  return typeof v === 'string' ? v : null;
}

function mdNumber(metadata: Record<string, unknown> | null, key: string): number | null {
  const v = metadata?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function mdBool(metadata: Record<string, unknown> | null, key: string): boolean {
  return metadata?.[key] === true;
}

function mdStringArray(metadata: Record<string, unknown> | null, key: string): string[] {
  const v = metadata?.[key];
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

export function mapSessionToQualityAssessment(
  row: HvMeasurementQualitySessionInput,
): HvChargeSessionQualityAssessment {
  const md = row.metadata;
  return assessHvChargeSessionQualityFromInput({
    source: row.source as typeof HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
    isOngoing: row.isOngoing,
    startAt: row.startAt,
    endAt: row.endAt,
    durationSeconds: mdNumber(md, 'durationSeconds'),
    startSocPercent: row.startSocPercent,
    endSocPercent: row.endSocPercent,
    startEnergyKwh: row.startEnergyKwh,
    endEnergyKwh: row.endEnergyKwh,
    energyAddedKwh: row.energyAddedKwh,
    deltaSocPercent: row.deltaSocPercent,
    addedEnergyMinKwh: null,
    addedEnergyMaxKwh: null,
    isChargingObservedAny: mdBool(md, 'isChargingObservedAny'),
    isChargingObservedAll: mdBool(md, 'isChargingObservedAll'),
    cableConnectedObservedAny: mdBool(md, 'cableConnectedObservedAny'),
    cableConnectedObservedAll: mdBool(md, 'cableConnectedObservedAll'),
    socExtremaProxy: mdString(md, 'socProvenance') === 'SEGMENT_EXTREMA',
    energyExtremaProxy: mdString(md, 'addedEnergyProvenance') === 'SEGMENT_EXTREMA',
    startedBeforeRange: mdBool(md, 'startedBeforeRange'),
    providerObservedAt: null,
    receivedAt: null,
    observationCount: null,
  });
}

export function mapSessionToM3Input(
  row: HvMeasurementQualitySessionInput,
  quality: HvChargeSessionQualityAssessment,
): HvCapacityM3SessionInput {
  const md = row.metadata;
  return {
    source: row.source,
    isOngoing: row.isOngoing,
    startAt: row.startAt,
    endAt: row.endAt,
    startSocPercent: row.startSocPercent,
    endSocPercent: row.endSocPercent,
    startEnergyKwh: row.startEnergyKwh,
    endEnergyKwh: row.endEnergyKwh,
    energyAddedKwh: row.energyAddedKwh,
    deltaSocPercent: row.deltaSocPercent,
    capacityValidationEligible: quality.capacityValidationEligible,
    boundaryStrength: quality.boundaryStrength,
    qualityStatus: mdString(md, 'qualityStatus'),
  };
}

function isQ1Session(
  row: HvMeasurementQualitySessionInput,
  quality: HvChargeSessionQualityAssessment,
): boolean {
  if (CONTAMINATED_QUALITIES.has(row.measurementQuality)) return true;
  if (
    row.measurementQuality === BatteryMeasurementQuality.INSUFFICIENT_COVERAGE ||
    row.measurementQuality === BatteryMeasurementQuality.NO_DATA
  ) {
    return true;
  }
  if (!quality.capacityShadowEligible && quality.status !== 'QUALIFIED') {
    return true;
  }
  if (row.isOngoing) return true;
  return false;
}

function computeUncalibratedScore(input: {
  quality: HvChargeSessionQualityAssessment;
  m3GateEligible: boolean;
  deltaSocPercent: number | null;
  durationSeconds: number | null;
  level: HvMeasurementQualityLevel;
}): number {
  let raw = 10;
  if (input.quality.boundaryStrength === 'strong') raw += 12;
  if (input.durationSeconds != null && input.durationSeconds >= 3600) raw += 10;
  if (input.deltaSocPercent != null && input.deltaSocPercent >= 20) raw += 15;
  if (input.deltaSocPercent != null && input.deltaSocPercent >= 10) raw += 8;
  if (input.quality.capacityShadowEligible) raw += 10;
  if (input.m3GateEligible) raw += 25;
  if (input.level === HV_MEASUREMENT_QUALITY_LEVEL.Q4) raw += 10;

  const bandMax =
    input.level === HV_MEASUREMENT_QUALITY_LEVEL.Q1
      ? HV_MEASUREMENT_QUALITY_SCORE_BAND.Q1_MAX
      : input.level === HV_MEASUREMENT_QUALITY_LEVEL.Q2
        ? HV_MEASUREMENT_QUALITY_SCORE_BAND.Q2_MAX
        : input.level === HV_MEASUREMENT_QUALITY_LEVEL.Q3
          ? HV_MEASUREMENT_QUALITY_SCORE_BAND.Q3_MAX
          : HV_MEASUREMENT_QUALITY_SCORE_BAND.Q4_MAX;

  if (!input.m3GateEligible) {
    raw = Math.min(raw, HV_MEASUREMENT_QUALITY_SCORE_BAND.Q2_MAX);
  }

  return Math.max(0, Math.min(bandMax, Math.round(raw)));
}

export function evaluateHvMeasurementQualitySession(
  row: HvMeasurementQualitySessionInput,
  q4CohortSessionIds: ReadonlySet<string>,
): HvMeasurementQualitySessionResult {
  const quality = mapSessionToQualityAssessment(row);
  const m3Input = mapSessionToM3Input(row, quality);
  const m3Gate = evaluateHvM3SessionGate(m3Input);
  const m3Kwh = computeHvM3EstimatedCapacityKwh(
    row.energyAddedKwh ?? 0,
    row.deltaSocPercent ?? 0,
  );

  const exclusionReasons: string[] = [];
  if (isQ1Session(row, quality)) {
    exclusionReasons.push('session_excluded_q1');
    if (CONTAMINATED_QUALITIES.has(row.measurementQuality)) {
      exclusionReasons.push('contaminated_measurement');
    }
  }
  if (!m3Gate.eligible) {
    exclusionReasons.push(...m3Gate.reasonCodes);
  }

  let qualityLevel: HvMeasurementQualityLevel = HV_MEASUREMENT_QUALITY_LEVEL.Q2;
  if (isQ1Session(row, quality)) {
    qualityLevel = HV_MEASUREMENT_QUALITY_LEVEL.Q1;
  } else if (m3Gate.eligible) {
    qualityLevel = HV_MEASUREMENT_QUALITY_LEVEL.Q3;
  }

  const contributesToQ4Cohort = q4CohortSessionIds.has(row.sessionId);
  if (contributesToQ4Cohort && m3Gate.eligible) {
    qualityLevel = HV_MEASUREMENT_QUALITY_LEVEL.Q4;
  }

  const durationSeconds = mdNumber(row.metadata, 'durationSeconds');

  return {
    sessionId: row.sessionId,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt?.toISOString() ?? null,
    startSocPercent: row.startSocPercent,
    endSocPercent: row.endSocPercent,
    deltaSocPercent: row.deltaSocPercent,
    energyAddedKwh: row.energyAddedKwh,
    energyProvenance: mdString(row.metadata, 'addedEnergyProvenance'),
    coverageDurationSeconds: durationSeconds,
    measurementQuality: row.measurementQuality,
    qualityStatus: mdString(row.metadata, 'qualityStatus'),
    qualityReasonCodes: mdStringArray(row.metadata, 'qualityReasonCodes').length
      ? mdStringArray(row.metadata, 'qualityReasonCodes')
      : [...quality.reasonCodes],
    m3GateEligible: m3Gate.eligible,
    m3GateReasonCodes: m3Gate.reasonCodes,
    m3EstimatedCapacityKwh: m3Kwh,
    qualityLevel,
    qualityScore: computeUncalibratedScore({
      quality,
      m3GateEligible: m3Gate.eligible,
      deltaSocPercent: row.deltaSocPercent,
      durationSeconds,
      level: qualityLevel,
    }),
    exclusionReasons,
    contributesToQ4Cohort,
  };
}

export function resolveQ4CohortSessionIds(
  sessions: HvMeasurementQualitySessionResult[],
  persistedCrossSession: {
    shadowGatePassed: boolean;
    sessionIds: string[];
  } | null,
): Set<string> {
  if (!persistedCrossSession?.shadowGatePassed) {
    return new Set();
  }
  const inCrossSession = new Set(persistedCrossSession.sessionIds);
  const ids = sessions
    .filter(
      (s) =>
        s.m3GateEligible &&
        s.m3EstimatedCapacityKwh != null &&
        inCrossSession.has(s.sessionId),
    )
    .map((s) => s.sessionId);
  return new Set(ids);
}

export function evaluateResearchSocWindowCoverage(
  sessions: HvMeasurementQualitySessionResult[],
): Array<{ id: string; labelDe: string; coveredByValidMeasurement: boolean }> {
  const valid = sessions.filter((s) => s.m3GateEligible);
  return HV_MEASUREMENT_RESEARCH_SOC_CHARGE_WINDOWS.map((window) => {
    const covered = valid.some((s) => {
      const start = s.startSocPercent;
      const end = s.endSocPercent;
      if (start == null || end == null) return false;
      return start <= window.socStartMax && end >= window.socEndMin;
    });
    return {
      id: window.id,
      labelDe: window.labelDe,
      coveredByValidMeasurement: covered,
    };
  });
}

export function resolveVehicleQualityLevel(
  sessions: HvMeasurementQualitySessionResult[],
): HvMeasurementQualityLevel {
  if (sessions.some((s) => s.qualityLevel === HV_MEASUREMENT_QUALITY_LEVEL.Q4)) {
    return HV_MEASUREMENT_QUALITY_LEVEL.Q4;
  }
  if (sessions.some((s) => s.qualityLevel === HV_MEASUREMENT_QUALITY_LEVEL.Q3)) {
    return HV_MEASUREMENT_QUALITY_LEVEL.Q3;
  }
  if (sessions.some((s) => s.qualityLevel === HV_MEASUREMENT_QUALITY_LEVEL.Q2)) {
    return HV_MEASUREMENT_QUALITY_LEVEL.Q2;
  }
  return HV_MEASUREMENT_QUALITY_LEVEL.Q1;
}

export function recommendedAdditionalMeasurements(policyValidatedCount: number): number {
  return Math.max(0, HV_SOH_GATE_MIN_QUALIFIED_SESSIONS - policyValidatedCount);
}

export const HV_MEASUREMENT_RECOMMENDED_ADDITIONAL_DISCLAIMER =
  'Advisory count toward SOH gate minimum sessions only; not a guarantee of SOH publication readiness or cross-session gate pass.';
