import {
  accumulatePhaseQueryMetrics,
  applyPendingCalibrationPhaseAtBoundary,
  buildCycleReleaseAcquisitionState,
  computeNativeTemporalCadenceStats,
  finalizeTerminalCalibrationSeries,
  HfCalibrationPhaseChangePendingError,
  requestHfCalibrationPhase,
  switchHfCalibrationPhase,
} from './reference-capture-hf-calibration-phase.policy';
import { parseHfRecoveryPolicyV2ConfigFromEnv } from './reference-capture-hf-recovery-v2.policy';

describe('reference-capture-hf-calibration-lifecycle (DI-EV-0035C.1e)', () => {
  const vehicleId = 'veh-life-1';
  const tokenId = 42_002;
  const t0 = Date.parse('2026-09-01T10:00:00.000Z');
  let idCounter = 0;
  const idFactory = () => `life-id-${++idCounter}`;
  const v2Global = parseHfRecoveryPolicyV2ConfigFromEnv({
    HF_RECOVERY_POLICY_V2_ENABLED: 'true',
    HF_HISTORICAL_POLL_INTERVAL_MS: '30000',
    HF_RECOVERY_POLICY_V2_CANARY_ONLY: 'false',
  });

  beforeEach(() => {
    idCounter = 0;
  });

  function emptyDataPlane() {
    return {
      cycleCount: 1,
      lastCycleAt: new Date(t0).toISOString(),
      hfWatermarkAt: '2026-09-01T10:00:20.000Z',
      hfWatermarkByField: { speed: '2026-09-01T10:00:20.000Z' },
      hfQueryCoverageByField: { speed: '2026-09-01T10:00:15.000Z' },
      hfPhysicalIdentityVersion: 'AGGREGATE_BUCKET_V2' as const,
      hfQueryProvenanceRing: [{ status: 'SUCCESS' }],
      hfRecoveryCursorByField: {},
      lastRecoverySweepAt: null,
      recoverySweepCount: 0,
      lastHfHistoricalPollAt: new Date(t0).toISOString(),
      eventWatermarkAt: null,
      seenEventFingerprints: [],
      seenPhysicalSampleFingerprints: [],
      lastSequenceNumber: 1,
      quarantinedProviderFields: [],
      consecutiveTransientFailures: 0,
      lastFailureClass: null,
      lastFailureAt: null,
    };
  }

  it('1) stale precompute cannot revert newer effective phase when recomputed from current state', () => {
    const t0Series = switchHfCalibrationPhase({
      existing: null,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 10_000,
      nowMs: t0,
      idFactory,
    }).series;
    const staleWithPending20 = requestHfCalibrationPhase({
      existing: t0Series,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 20_000,
      nowMs: t0 + 1_000,
      idFactory,
    }).series;

    const currentAfterBoundary = buildCycleReleaseAcquisitionState({
      persisted: {
        hfCalibrationSeries: staleWithPending20,
        acquisitionStateVersion: 1,
      },
      dataPlane: emptyDataPlane(),
      hfPolicy: v2Global,
      effectiveAtMs: t0 + 10_000,
      idFactory,
    });

    expect(currentAfterBoundary.hfCalibrationSeries?.activePhase?.effectivePollIntervalMs).toBe(
      20_000,
    );
    expect(currentAfterBoundary.hfCalibrationSeries?.pendingPhaseRequest).toBeNull();

    const recomputedFromCurrent = requestHfCalibrationPhase({
      existing: currentAfterBoundary.hfCalibrationSeries,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 30_000,
      nowMs: t0 + 11_000,
      idFactory,
    });
    expect(recomputedFromCurrent.series.activePhase?.effectivePollIntervalMs).toBe(20_000);
    expect(recomputedFromCurrent.series.pendingPhaseRequest?.effectivePollIntervalMs).toBe(30_000);

    expect(() =>
      requestHfCalibrationPhase({
        existing: staleWithPending20,
        vehicleId,
        tokenId,
        effectivePollIntervalMs: 30_000,
        nowMs: t0 + 2_000,
        idFactory,
      }),
    ).toThrow(HfCalibrationPhaseChangePendingError);
  });

  it('2) identical concurrent pending requests are idempotent', () => {
    const series = switchHfCalibrationPhase({
      existing: null,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 10_000,
      nowMs: t0,
      idFactory,
    }).series;
    const first = requestHfCalibrationPhase({
      existing: series,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 20_000,
      nowMs: t0 + 1_000,
      idFactory,
    });
    const second = requestHfCalibrationPhase({
      existing: first.series,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 20_000,
      nowMs: t0 + 1_050,
      idFactory,
    });
    expect(second.deduplicated).toBe(true);
    expect(second.request.requestId).toBe(first.request.requestId);
  });

  it('3) rejects different pending with conflict', () => {
    const series = switchHfCalibrationPhase({
      existing: null,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 10_000,
      nowMs: t0,
      idFactory,
    }).series;
    const pending20 = requestHfCalibrationPhase({
      existing: series,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 20_000,
      nowMs: t0 + 1_000,
      idFactory,
    }).series;
    expect(() =>
      requestHfCalibrationPhase({
        existing: pending20,
        vehicleId,
        tokenId,
        effectivePollIntervalMs: 30_000,
        nowMs: t0 + 1_100,
        idFactory,
      }),
    ).toThrow(HfCalibrationPhaseChangePendingError);
  });

  it('5) 10->20->30->60->STOP yields four durable phase summaries', () => {
    let series = switchHfCalibrationPhase({
      existing: null,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 10_000,
      nowMs: t0,
      idFactory,
    }).series;
    for (const interval of [20_000, 30_000, 60_000]) {
      const pending = requestHfCalibrationPhase({
        existing: series,
        vehicleId,
        tokenId,
        effectivePollIntervalMs: interval,
        nowMs: t0 + interval,
        idFactory,
      }).series;
      const applied = applyPendingCalibrationPhaseAtBoundary({
        series: pending,
        pending: pending.pendingPhaseRequest,
        counters: null,
        hfPolicy: v2Global,
        effectiveAtMs: t0 + interval,
        idFactory,
      });
      series = applied.series!;
    }
    const terminal = finalizeTerminalCalibrationSeries({
      series,
      counters: null,
      terminalAtMs: t0 + 120_000,
      reason: 'STOP',
    });
    expect(terminal.series?.completedPhaseSummaries).toHaveLength(4);
    expect(terminal.series?.activePhase).toBeNull();
    expect(terminal.series?.terminalFinalizationAt).not.toBeNull();
  });

  it('6) final 60s phase finalized without next phase switch', () => {
    const series = switchHfCalibrationPhase({
      existing: null,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 60_000,
      nowMs: t0,
      idFactory,
    }).series;
    const terminal = finalizeTerminalCalibrationSeries({
      series,
      counters: null,
      terminalAtMs: t0 + 60_000,
      reason: 'STOP',
    });
    expect(terminal.applied).toBe(true);
    expect(terminal.series?.completedPhaseSummaries).toHaveLength(1);
    expect(terminal.series?.completedPhaseSummaries[0].effectivePollIntervalMs).toBe(60_000);
  });

  it('8) TRANSITION_WINDOW excluded from primary native metrics', () => {
    const phaseId = 'phase-native-1';
    const native = accumulatePhaseQueryMetrics(
      null,
      {
        record: {
          status: 'SUCCESS',
          resultBucketCount: 2,
          duplicateBucketCount: 0,
          revisionBucketCount: 0,
          recoveredLateBucketCount: 0,
          maxIntraResponseTemporalGapMs: 1000,
          windowClassification: 'PHASE_NATIVE',
          queryOrigin: 'FAST_LOOP',
        },
        newBucketCount: 2,
        temporalBucketStartTimestamps: ['2026-09-01T10:00:01.000Z', '2026-09-01T10:00:02.000Z'],
      },
      phaseId,
    );
    const withTransition = accumulatePhaseQueryMetrics(
      native,
      {
        record: {
          status: 'SUCCESS',
          resultBucketCount: 99,
          duplicateBucketCount: 0,
          revisionBucketCount: 0,
          recoveredLateBucketCount: 0,
          maxIntraResponseTemporalGapMs: 5000,
          windowClassification: 'TRANSITION_WINDOW',
          queryOrigin: 'FAST_LOOP',
        },
        newBucketCount: 50,
        temporalBucketStartTimestamps: ['2026-09-01T10:00:03.000Z'],
      },
      phaseId,
    );
    expect(withTransition.nativeFastLoopRequestCount).toBe(1);
    expect(withTransition.nativeFastLoopProviderBucketCount).toBe(2);
    expect(withTransition.transitionRequestCount).toBe(1);
    expect(withTransition.transitionProviderBucketCount).toBe(99);
  });

  it('9) overlapping bucket timestamps dedupe to true unique count', () => {
    const phaseId = 'phase-dedupe';
    const counters = accumulatePhaseQueryMetrics(
      null,
      {
        record: {
          status: 'SUCCESS',
          resultBucketCount: 25,
          duplicateBucketCount: 0,
          revisionBucketCount: 0,
          recoveredLateBucketCount: 0,
          maxIntraResponseTemporalGapMs: 1000,
          windowClassification: 'PHASE_NATIVE',
          queryOrigin: 'FAST_LOOP',
        },
        newBucketCount: 25,
        temporalBucketStartTimestamps: ['2026-09-01T10:00:01.000Z', '2026-09-01T10:00:02.000Z'],
      },
      phaseId,
    );
    const merged = accumulatePhaseQueryMetrics(
      counters,
      {
        record: {
          status: 'SUCCESS',
          resultBucketCount: 25,
          duplicateBucketCount: 0,
          revisionBucketCount: 0,
          recoveredLateBucketCount: 0,
          maxIntraResponseTemporalGapMs: 1000,
          windowClassification: 'PHASE_NATIVE',
          queryOrigin: 'FAST_LOOP',
        },
        newBucketCount: 25,
        temporalBucketStartTimestamps: ['2026-09-01T10:00:02.000Z', '2026-09-01T10:00:03.000Z'],
      },
      phaseId,
    );
    expect(merged.nativeUniqueTemporalBucketStarts).toHaveLength(3);
    expect(
      computeNativeTemporalCadenceStats(merged.nativeUniqueTemporalBucketStarts)
        .nativeUniqueTemporalBucketStartCount,
    ).toBe(3);
  });

  it('10) phase-wide max gap detects gap between provider requests', () => {
    const stats = computeNativeTemporalCadenceStats([
      '2026-09-01T10:00:01.000Z',
      '2026-09-01T10:00:02.000Z',
      '2026-09-01T10:00:03.000Z',
      '2026-09-01T10:00:21.000Z',
    ]);
    expect(stats.nativeMaxTemporalGapMs).toBe(18_000);
    expect(stats.nativeMedianTemporalCadenceMs).toBe(1000);
  });

  it('11) FAST_LOOP and RECOVERY_SWEEP separated in counters', () => {
    const phaseId = 'phase-origin';
    const fast = accumulatePhaseQueryMetrics(
      null,
      {
        record: {
          status: 'SUCCESS',
          resultBucketCount: 3,
          duplicateBucketCount: 0,
          revisionBucketCount: 0,
          recoveredLateBucketCount: 0,
          maxIntraResponseTemporalGapMs: 1000,
          windowClassification: 'PHASE_NATIVE',
          queryOrigin: 'FAST_LOOP',
        },
        newBucketCount: 3,
        temporalBucketStartTimestamps: ['2026-09-01T10:00:01.000Z'],
      },
      phaseId,
    );
    const withSweep = accumulatePhaseQueryMetrics(
      fast,
      {
        record: {
          status: 'SUCCESS',
          resultBucketCount: 10,
          duplicateBucketCount: 0,
          revisionBucketCount: 0,
          recoveredLateBucketCount: 2,
          maxIntraResponseTemporalGapMs: null,
          windowClassification: 'PHASE_NATIVE',
          queryOrigin: 'RECOVERY_SWEEP',
        },
        newBucketCount: 0,
        temporalBucketStartTimestamps: ['2026-09-01T10:00:05.000Z'],
      },
      phaseId,
    );
    expect(withSweep.nativeFastLoopRequestCount).toBe(1);
    expect(withSweep.recoverySweepRequestCount).toBe(1);
    expect(withSweep.nativeFastLoopProviderBucketCount).toBe(3);
  });

  it('12) terminal finalization is idempotent', () => {
    const series = switchHfCalibrationPhase({
      existing: null,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 10_000,
      nowMs: t0,
      idFactory,
    }).series;
    const first = finalizeTerminalCalibrationSeries({
      series,
      counters: null,
      terminalAtMs: t0 + 10_000,
      reason: 'STOP',
    });
    const second = finalizeTerminalCalibrationSeries({
      series: first.series,
      counters: null,
      terminalAtMs: t0 + 11_000,
      reason: 'STOP',
    });
    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    expect(second.series?.completedPhaseSummaries).toHaveLength(1);
  });
});
