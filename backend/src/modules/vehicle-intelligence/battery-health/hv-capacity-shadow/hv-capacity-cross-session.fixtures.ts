import { aggregateHvCapacitySessionSummary } from './hv-capacity-session-summary.aggregator';
import {
  STABLE_SESSION_SUMMARY_CONTEXT,
  STABLE_SESSION_SUMMARY_OBSERVATIONS,
} from './hv-capacity-session-summary.fixtures';
import { HV_M2_CAPACITY_METHOD } from './hv-capacity-m2.types';
import type { HvCapacityM3SessionValidation } from './hv-capacity-m3.types';
import type { HvCrossSessionInputSession } from './hv-capacity-cross-session.types';

export const TESLA_AUDIT_CROSS_SESSION_EXPECTED_CAPACITY_KWH = 55.5;
export const TESLA_AUDIT_CROSS_SESSION_TOLERANCE_KWH = 0.5;

function buildStableSummary(medianKwh: number, validSampleCount = 8, cv = 0.002) {
  const observations = STABLE_SESSION_SUMMARY_OBSERVATIONS.map((row, index) => ({
    ...row,
    estimatedCapacityKwh: medianKwh + (index % 2 === 0 ? -0.04 : 0.04),
  }));

  const summary = aggregateHvCapacitySessionSummary({
    method: HV_M2_CAPACITY_METHOD,
    observations,
    session: STABLE_SESSION_SUMMARY_CONTEXT,
  });

  return {
    ...summary,
    stats: {
      ...summary.stats,
      medianCapacityKwh: medianKwh,
      coefficientOfVariation: cv,
      validSampleCount,
      totalSampleCount: validSampleCount,
    },
    status: 'STABLE_SHADOW' as const,
    shadowGatePassed: true,
    gateReasonCodes: [],
  };
}

function m3Validation(input: {
  estimatedCapacityKwh: number;
  methodConflict?: boolean;
}): HvCapacityM3SessionValidation {
  return {
    method: 'SEGMENT_ADDED_ENERGY_OVER_SOC',
    modelVersion: 1,
    methodRole: 'VALIDATION_ONLY',
    estimatedCapacityKwh: input.estimatedCapacityKwh,
    segmentAddedEnergyKwh: 15,
    deltaSocPercent: 27.4,
    gateEligible: true,
    gateReasonCodes: [],
    methodConflict: input.methodConflict ?? false,
    methodConflictDeviationRatio: input.methodConflict ? 0.2 : null,
    m2MedianCapacityKwh: input.estimatedCapacityKwh,
    persisted: true,
    validatedAt: new Date().toISOString(),
  };
}

function session(
  id: string,
  endIso: string,
  medianKwh: number,
  options?: {
    validSampleCount?: number;
    cv?: number;
    m3Conflict?: boolean;
  },
): HvCrossSessionInputSession {
  return {
    sessionId: id,
    sessionEndAt: new Date(endIso),
    summary: buildStableSummary(
      medianKwh,
      options?.validSampleCount,
      options?.cv,
    ),
    m3Validation: m3Validation({
      estimatedCapacityKwh: medianKwh,
      methodConflict: options?.m3Conflict,
    }),
  };
}

/** Four stable Tesla audit-like sessions — cross-session median ~55.5 kWh. */
export const TESLA_AUDIT_CROSS_SESSION_STABLE_INPUT: HvCrossSessionInputSession[] = [
  session('session-3', '2026-06-18T09:58:36.000Z', 55.56),
  session('session-4', '2026-06-22T05:36:49.000Z', 55.75),
  session('session-6', '2026-06-25T11:18:24.000Z', 55.46),
  session('session-7', '2026-06-26T05:47:57.000Z', 55.52),
];

/** Contradictory mix — one high outlier session breaks cross-session spread gate. */
export const TESLA_AUDIT_CROSS_SESSION_CONFLICTING_INPUT: HvCrossSessionInputSession[] = [
  ...TESLA_AUDIT_CROSS_SESSION_STABLE_INPUT.slice(0, 3),
  session('session-outlier', '2026-06-27T07:55:41.000Z', 68.4),
];

/** Contradictory M3 conflict on one otherwise stable session. */
export const TESLA_AUDIT_CROSS_SESSION_M3_CONFLICT_INPUT: HvCrossSessionInputSession[] = [
  ...TESLA_AUDIT_CROSS_SESSION_STABLE_INPUT.slice(0, 3),
  session('session-7', '2026-06-26T05:47:57.000Z', 55.52, { m3Conflict: true }),
];

export const TESLA_AUDIT_CROSS_SESSION_VEHICLE_CONTEXT = {
  vehicleId: 'veh-tesla-audit',
  referenceCapacityKwh: 57,
  referenceCapacityId: 'ref-cap-57',
  modelVersion: 1,
  now: new Date('2026-06-28T12:00:00.000Z'),
} as const;
