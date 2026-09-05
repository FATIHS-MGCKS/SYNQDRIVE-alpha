import {
  applyHfPolicyWithSessionPollOverride,
  classifyCalibrationQueryWindow,
  resolveEffectiveHfPollIntervalMs,
  switchHfCalibrationPhase,
  verifyPhaseTransitionCoverageContinuity,
} from './reference-capture-hf-calibration-phase.policy';
import {
  parseHfRecoveryPolicyV2ConfigFromEnv,
  buildHfQueryWindow,
  emptyWatermarkState,
} from './reference-capture-hf-recovery-v2.policy';
import { isHfHistoricalPollDue } from './reference-capture-hf-block-polling.policy';

describe('reference-capture-hf-calibration-phase.policy', () => {
  const vehicleId = 'veh-cal-1';
  const tokenId = 42_001;
  const t0 = Date.parse('2026-09-01T10:00:00.000Z');
  let idCounter = 0;
  const idFactory = () => `test-id-${++idCounter}`;

  const v2Global = parseHfRecoveryPolicyV2ConfigFromEnv({
    HF_RECOVERY_POLICY_V2_ENABLED: 'true',
    HF_HISTORICAL_POLL_INTERVAL_MS: '30000',
    HF_RECOVERY_POLICY_V2_CANARY_ONLY: 'false',
  });

  beforeEach(() => {
    idCounter = 0;
  });

  it('documents pre-C.1c runtime: poll interval is process config only without session override', () => {
    expect(v2Global.hfHistoricalPollIntervalMs).toBe(30_000);
    expect(resolveEffectiveHfPollIntervalMs(v2Global, null)).toBe(30_000);
  });

  it('session-scoped override takes precedence over global HF_HISTORICAL_POLL_INTERVAL_MS', () => {
    const phase10 = switchHfCalibrationPhase({
      existing: null,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 10_000,
      nowMs: t0,
      idFactory,
    });
    expect(resolveEffectiveHfPollIntervalMs(v2Global, phase10.series)).toBe(10_000);
    const effective = applyHfPolicyWithSessionPollOverride(v2Global, phase10.series);
    expect(effective.hfHistoricalPollIntervalMs).toBe(10_000);
  });

  it('phase 10s effective and poll gate uses session override', () => {
    const { series } = switchHfCalibrationPhase({
      existing: null,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 10_000,
      nowMs: t0,
      idFactory,
    });
    const policy = applyHfPolicyWithSessionPollOverride(v2Global, series);
    expect(
      isHfHistoricalPollDue({
        nowMs: t0 + 8_000,
        lastHfHistoricalPollAt: new Date(t0).toISOString(),
        pollIntervalMs: policy.hfHistoricalPollIntervalMs,
        policyMode: policy.mode,
      }),
    ).toBe(false);
    expect(
      isHfHistoricalPollDue({
        nowMs: t0 + 11_000,
        lastHfHistoricalPollAt: new Date(t0).toISOString(),
        pollIntervalMs: policy.hfHistoricalPollIntervalMs,
        policyMode: policy.mode,
      }),
    ).toBe(true);
  });

  it('supports full 10 -> 20 -> 30 -> 60 phase chain in one series', () => {
    let series = switchHfCalibrationPhase({
      existing: null,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 10_000,
      nowMs: t0,
      idFactory,
    }).series;
    for (const interval of [20_000, 30_000, 60_000]) {
      const next = switchHfCalibrationPhase({
        existing: series,
        vehicleId,
        tokenId,
        effectivePollIntervalMs: interval,
        nowMs: t0 + interval,
        idFactory,
      });
      series = next.series;
      expect(next.resetLastHfHistoricalPollAt).toBe(true);
    }
    expect(series.phaseOrder).toEqual([10_000, 20_000, 30_000, 60_000]);
    expect(series.completedPhases).toHaveLength(3);
    expect(series.activePhase?.effectivePollIntervalMs).toBe(60_000);
    expect(series.activePhase?.phaseSequence).toBe(4);
  });

  it('supports reverse order 60 -> 30 -> 20 -> 10 with recorded phase order', () => {
    let series = switchHfCalibrationPhase({
      existing: null,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 60_000,
      nowMs: t0,
      idFactory,
    }).series;
    for (const interval of [30_000, 20_000, 10_000]) {
      series = switchHfCalibrationPhase({
        existing: series,
        vehicleId,
        tokenId,
        effectivePollIntervalMs: interval,
        nowMs: t0 + interval,
        idFactory,
      }).series;
    }
    expect(series.phaseOrder).toEqual([60_000, 30_000, 20_000, 10_000]);
  });

  it('switch 60 -> 10 (faster cadence) keeps same vehicle binding', () => {
    const first = switchHfCalibrationPhase({
      existing: null,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 60_000,
      nowMs: t0,
      idFactory,
    });
    const second = switchHfCalibrationPhase({
      existing: first.series,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 10_000,
      nowMs: t0 + 60_000,
      idFactory,
    });
    expect(second.series.calibrationSeriesId).toBe(first.series.calibrationSeriesId);
    expect(second.series.vehicleId).toBe(vehicleId);
    expect(second.series.tokenId).toBe(tokenId);
    expect(resolveEffectiveHfPollIntervalMs(v2Global, second.series)).toBe(10_000);
  });

  it('switch 30 -> 60 (slower cadence) does not reset series identity', () => {
    const first = switchHfCalibrationPhase({
      existing: null,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 30_000,
      nowMs: t0,
      idFactory,
    });
    const second = switchHfCalibrationPhase({
      existing: first.series,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 60_000,
      nowMs: t0 + 30_000,
      idFactory,
    });
    expect(second.series.calibrationSeriesId).toBe(first.series.calibrationSeriesId);
    expect(second.series.lastPhaseBoundaryAt).not.toBeNull();
  });

  it('phase transition preserves coverage continuity (no unqueried gap)', () => {
    const overlapMs = 6000;
    const previousCoverage = '2026-09-01T10:00:30.000Z';
    const state = emptyWatermarkState();
    state.hfQueryCoverageByField = { speed: previousCoverage };
    const window = buildHfQueryWindow({
      watermarkState: state,
      sessionStartedAt: new Date('2026-09-01T10:00:00.000Z'),
      providerFields: ['speed'],
      requestStartedAt: new Date('2026-09-01T10:01:00.000Z'),
      config: v2Global,
    });
    expect(
      verifyPhaseTransitionCoverageContinuity({
        previousQueryCoverageTo: previousCoverage,
        nextQueryFrom: window.queryFrom,
        recoveryOverlapMs: overlapMs,
      }),
    ).toBe(true);
  });

  it('classifies transition windows when query spans phase boundary', () => {
    const series = switchHfCalibrationPhase({
      existing: null,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 10_000,
      nowMs: t0,
      idFactory,
    }).series;
    const withBoundary = switchHfCalibrationPhase({
      existing: series,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 20_000,
      nowMs: t0 + 10_000,
      idFactory,
    }).series;
    const boundaryAt = withBoundary.lastPhaseBoundaryAt!;
    const boundaryMs = Date.parse(boundaryAt);
    expect(
      classifyCalibrationQueryWindow({
        queryFrom: new Date(boundaryMs - 15_000),
        queryTo: new Date(boundaryMs + 5_000),
        requestStartedAt: new Date(boundaryMs + 1_000),
        calibration: withBoundary,
      }),
    ).toBe('TRANSITION_WINDOW');
    expect(
      classifyCalibrationQueryWindow({
        queryFrom: new Date(boundaryMs + 1_000),
        queryTo: new Date(boundaryMs + 20_000),
        requestStartedAt: new Date(boundaryMs + 2_000),
        calibration: withBoundary,
      }),
    ).toBe('PHASE_NATIVE');
  });

  it('empty/non-calibration session uses global poll interval fallback', () => {
    expect(resolveEffectiveHfPollIntervalMs(v2Global, null)).toBe(30_000);
    expect(applyHfPolicyWithSessionPollOverride(v2Global, null)).toEqual(v2Global);
  });

  it('V2 OFF keeps legacy behavior regardless of calibration series', () => {
    const legacy = parseHfRecoveryPolicyV2ConfigFromEnv({ HF_RECOVERY_POLICY_V2_ENABLED: 'false' });
    const series = switchHfCalibrationPhase({
      existing: null,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 10_000,
      nowMs: t0,
      idFactory,
    }).series;
    const effective = applyHfPolicyWithSessionPollOverride(legacy, series);
    expect(effective.mode).toBe('LEGACY');
    expect(
      isHfHistoricalPollDue({
        nowMs: t0 + 1_000,
        lastHfHistoricalPollAt: new Date(t0).toISOString(),
        pollIntervalMs: effective.hfHistoricalPollIntervalMs,
        policyMode: effective.mode,
      }),
    ).toBe(true);
  });
});
