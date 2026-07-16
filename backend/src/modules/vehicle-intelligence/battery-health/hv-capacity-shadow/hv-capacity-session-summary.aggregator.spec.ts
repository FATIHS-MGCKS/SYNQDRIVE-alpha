import {
  aggregateHvCapacitySessionSummary,
  computeHvCapacitySessionSummaryStats,
  evaluateHvCapacitySessionSummaryGates,
  resolveHvCapacitySessionSummaryStatus,
} from './hv-capacity-session-summary.aggregator';
import {
  INSUFFICIENT_SESSION_SUMMARY_OBSERVATIONS,
  STABLE_SESSION_SUMMARY_CONTEXT,
  STABLE_SESSION_SUMMARY_OBSERVATIONS,
  UNSTABLE_SESSION_SUMMARY_CONTEXT,
  UNSTABLE_SESSION_SUMMARY_OBSERVATIONS,
} from './hv-capacity-session-summary.fixtures';
import { HV_M2_CAPACITY_METHOD } from './hv-capacity-m2.types';
import {
  HV_M2_SESSION_SUMMARY_GATE_REASONS,
  HV_M2_SESSION_SUMMARY_STATUSES,
} from './hv-capacity-session-summary.types';

describe('hv-capacity-session-summary.aggregator', () => {
  it('computes robust stats for stable Tesla-like session', () => {
    const stats = computeHvCapacitySessionSummaryStats({
      observations: STABLE_SESSION_SUMMARY_OBSERVATIONS,
      sessionStartAt: STABLE_SESSION_SUMMARY_CONTEXT.sessionStartAt,
      sessionEndAt: STABLE_SESSION_SUMMARY_CONTEXT.sessionEndAt,
    });

    expect(stats.validSampleCount).toBe(8);
    expect(stats.outlierCount).toBe(0);
    expect(stats.medianCapacityKwh).toBeCloseTo(55.5, 0);
    expect(stats.p10CapacityKwh).not.toBeNull();
    expect(stats.p90CapacityKwh).not.toBeNull();
    expect(stats.p10CapacityKwh!).toBeLessThan(stats.medianCapacityKwh!);
    expect(stats.p90CapacityKwh!).toBeGreaterThan(stats.medianCapacityKwh!);
    expect(stats.madKwh).not.toBeNull();
    expect(stats.robustSpreadKwh).not.toBeNull();
    expect(stats.coefficientOfVariation!).toBeLessThan(0.02);
    expect(stats.minSocPercent).toBe(46);
    expect(stats.maxSocPercent).toBe(56);
    expect(stats.socSpanPercent).toBe(10);
    expect(stats.preferredBandSampleCount).toBe(8);
    expect(stats.temporalCoverageRatio).toBeGreaterThanOrEqual(0.85);
    expect(stats.providerGapCount).toBe(0);
  });

  it('marks stable session as STABLE_SHADOW when gates pass', () => {
    const summary = aggregateHvCapacitySessionSummary({
      method: HV_M2_CAPACITY_METHOD,
      observations: STABLE_SESSION_SUMMARY_OBSERVATIONS,
      session: STABLE_SESSION_SUMMARY_CONTEXT,
    });

    expect(summary.status).toBe(HV_M2_SESSION_SUMMARY_STATUSES.STABLE_SHADOW);
    expect(summary.shadowGatePassed).toBe(true);
    expect(summary.gateReasonCodes).toHaveLength(0);
    expect(summary.stats.medianCapacityKwh).toBeCloseTo(55.5, 0);
    expect(summary.gateVersion).toBeGreaterThanOrEqual(1);
  });

  it('flags unstable session with high CV and UNSTABLE_SHADOW status', () => {
    const stats = computeHvCapacitySessionSummaryStats({
      observations: UNSTABLE_SESSION_SUMMARY_OBSERVATIONS,
      sessionStartAt: UNSTABLE_SESSION_SUMMARY_CONTEXT.sessionStartAt,
      sessionEndAt: UNSTABLE_SESSION_SUMMARY_CONTEXT.sessionEndAt,
    });

    expect(stats.validSampleCount).toBe(7);
    expect(stats.outlierCount).toBe(1);
    expect(stats.coefficientOfVariation!).toBeGreaterThan(0.02);

    const summary = aggregateHvCapacitySessionSummary({
      method: HV_M2_CAPACITY_METHOD,
      observations: UNSTABLE_SESSION_SUMMARY_OBSERVATIONS,
      session: UNSTABLE_SESSION_SUMMARY_CONTEXT,
    });

    expect(summary.status).toBe(HV_M2_SESSION_SUMMARY_STATUSES.UNSTABLE_SHADOW);
    expect(summary.shadowGatePassed).toBe(false);
    expect(summary.gateReasonCodes).toContain(
      HV_M2_SESSION_SUMMARY_GATE_REASONS.CV_ABOVE_SHADOW_LIMIT,
    );
  });

  it('does not use mean — median stays robust with outliers excluded from valid set', () => {
    const stats = computeHvCapacitySessionSummaryStats({
      observations: UNSTABLE_SESSION_SUMMARY_OBSERVATIONS,
      sessionStartAt: UNSTABLE_SESSION_SUMMARY_CONTEXT.sessionStartAt,
      sessionEndAt: UNSTABLE_SESSION_SUMMARY_CONTEXT.sessionEndAt,
    });

    const values = UNSTABLE_SESSION_SUMMARY_OBSERVATIONS.filter(
      (row) => !row.outlier,
    ).map((row) => row.estimatedCapacityKwh);
    const naiveMean =
      values.reduce((sum, value) => sum + value, 0) / values.length;

    expect(stats.medianCapacityKwh).not.toBeCloseTo(naiveMean, 0);
    expect(Math.abs(stats.medianCapacityKwh! - naiveMean)).toBeGreaterThan(1);
  });

  it('returns INSUFFICIENT for too few valid samples', () => {
    const summary = aggregateHvCapacitySessionSummary({
      method: HV_M2_CAPACITY_METHOD,
      observations: INSUFFICIENT_SESSION_SUMMARY_OBSERVATIONS,
      session: STABLE_SESSION_SUMMARY_CONTEXT,
    });

    expect(summary.status).toBe(HV_M2_SESSION_SUMMARY_STATUSES.INSUFFICIENT);
    expect(summary.gateReasonCodes).toContain(
      HV_M2_SESSION_SUMMARY_GATE_REASONS.INSUFFICIENT_VALID_SAMPLES,
    );
  });

  it('disqualifies ongoing or ineligible sessions', () => {
    const gates = evaluateHvCapacitySessionSummaryGates({
      stats: computeHvCapacitySessionSummaryStats({
        observations: STABLE_SESSION_SUMMARY_OBSERVATIONS,
        sessionStartAt: STABLE_SESSION_SUMMARY_CONTEXT.sessionStartAt,
        sessionEndAt: STABLE_SESSION_SUMMARY_CONTEXT.sessionEndAt,
      }),
      session: {
        ...STABLE_SESSION_SUMMARY_CONTEXT,
        isOngoing: true,
        capacityShadowEligible: false,
      },
    });

    expect(gates.shadowGatePassed).toBe(false);
    expect(gates.gateReasonCodes).toEqual(
      expect.arrayContaining([
        HV_M2_SESSION_SUMMARY_GATE_REASONS.SESSION_ONGOING,
        HV_M2_SESSION_SUMMARY_GATE_REASONS.SESSION_NOT_QUALIFIED,
      ]),
    );

    const status = resolveHvCapacitySessionSummaryStatus({
      shadowGatePassed: gates.shadowGatePassed,
      gateReasonCodes: gates.gateReasonCodes,
      stats: computeHvCapacitySessionSummaryStats({
        observations: STABLE_SESSION_SUMMARY_OBSERVATIONS,
        sessionStartAt: STABLE_SESSION_SUMMARY_CONTEXT.sessionStartAt,
        sessionEndAt: STABLE_SESSION_SUMMARY_CONTEXT.sessionEndAt,
      }),
    });
    expect(status).toBe(HV_M2_SESSION_SUMMARY_STATUSES.DISQUALIFIED);
  });
});
