import { aggregateHvCapacitySessionSummary } from './hv-capacity-session-summary.aggregator';
import {
  STABLE_SESSION_SUMMARY_CONTEXT,
  STABLE_SESSION_SUMMARY_OBSERVATIONS,
} from './hv-capacity-session-summary.fixtures';
import { HV_M2_CAPACITY_METHOD } from './hv-capacity-m2.types';
import { computeHvCrossSessionAssessment } from './hv-capacity-cross-session.policy';
import {
  HV_CROSS_SESSION_CONFIDENCE,
  HV_CROSS_SESSION_GATE_REASONS,
  type HvCrossSessionInputSession,
} from './hv-capacity-cross-session.types';
import {
  TESLA_AUDIT_CROSS_SESSION_STABLE_INPUT,
  TESLA_AUDIT_CROSS_SESSION_VEHICLE_CONTEXT,
} from './hv-capacity-cross-session.fixtures';

function stableSummary(medianKwh: number, validSampleCount = 40) {
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
      coefficientOfVariation: 0.001,
      validSampleCount,
      totalSampleCount: validSampleCount,
    },
    status: 'STABLE_SHADOW' as const,
    shadowGatePassed: true,
    gateReasonCodes: [],
  };
}

function fragment(
  id: string,
  startOffsetMin: number,
  endOffsetMin: number,
  socStart: number,
  socEnd: number,
): HvCrossSessionInputSession {
  const baseStart = new Date('2026-10-18T18:00:00.000Z');
  const start = new Date(baseStart.getTime() + startOffsetMin * 60_000);
  const end = new Date(baseStart.getTime() + endOffsetMin * 60_000);
  return {
    sessionId: id,
    sessionEndAt: end,
    physicalEpisode: {
      sessionStartAt: start,
      sessionEndAt: end,
      startSocPercent: socStart,
      endSocPercent: socEnd,
      startEnergyKwh: (socStart / 100) * 72,
      endEnergyKwh: (socEnd / 100) * 72,
      isOngoing: false,
    },
    summary: stableSummary(72),
    m3Validation: {
      method: 'SEGMENT_ADDED_ENERGY_OVER_SOC',
      modelVersion: 1,
      methodRole: 'VALIDATION_ONLY',
      estimatedCapacityKwh: 72,
      segmentAddedEnergyKwh: 9,
      deltaSocPercent: 12.5,
      gateEligible: true,
      gateReasonCodes: [],
      methodConflict: false,
      methodConflictDeviationRatio: null,
      m2MedianCapacityKwh: 72,
      persisted: true,
      validatedAt: new Date().toISOString(),
    },
  };
}

describe('hv-capacity-cross-session physical episode independence (P1-1)', () => {
  const context = {
    vehicleId: 'veh-frag',
    referenceCapacityKwh: 75,
    referenceCapacityId: 'ref',
    modelVersion: 1,
    now: new Date('2026-10-19T12:00:00.000Z'),
  };

  it('does not treat four contiguous fragments of one charge as four independent sessions (FABLE B2)', () => {
    const sessions = [
      fragment('q1', 0, 30, 30, 42.5),
      fragment('q2', 30, 60, 42.5, 55),
      fragment('q3', 60, 90, 55, 67.5),
      fragment('q4', 90, 120, 67.5, 80),
    ];

    const result = computeHvCrossSessionAssessment({ sessions, context });

    expect(result.shadowGatePassed).toBe(false);
    expect(result.confidence).toBe(HV_CROSS_SESSION_CONFIDENCE.INSUFFICIENT);
    expect(result.gateReasonCodes).toContain(
      HV_CROSS_SESSION_GATE_REASONS.PHYSICAL_EPISODE_NOT_INDEPENDENT,
    );
    expect(result.sessionCount).toBeLessThan(3);
  });

  it('still passes for four truly independent stable sessions', () => {
    const result = computeHvCrossSessionAssessment({
      sessions: TESLA_AUDIT_CROSS_SESSION_STABLE_INPUT,
      context: TESLA_AUDIT_CROSS_SESSION_VEHICLE_CONTEXT,
    });

    expect(result.shadowGatePassed).toBe(true);
    expect(result.sessionCount).toBe(4);
    expect(result.confidence).toBe(HV_CROSS_SESSION_CONFIDENCE.HIGH);
  });
});
