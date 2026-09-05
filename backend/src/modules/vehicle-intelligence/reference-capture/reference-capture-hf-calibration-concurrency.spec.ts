import {
  accumulatePhaseQueryMetrics,
  applyPendingCalibrationPhaseAtBoundary,
  assertHfCalibrationPhaseActivationAllowed,
  applyHfPolicyWithSessionPollOverride,
  buildCycleReleaseAcquisitionState,
  classifyCalibrationQueryWindow,
  requestHfCalibrationPhase,
  resolveEffectiveHfPollIntervalMs,
  switchHfCalibrationPhase,
} from './reference-capture-hf-calibration-phase.policy';
import {
  isHfHistoricalPollDue,
} from './reference-capture-hf-block-polling.policy';
import {
  parseHfRecoveryPolicyV2ConfigFromEnv,
  resolveHfRecoveryPolicyForToken,
} from './reference-capture-hf-recovery-v2.policy';

describe('reference-capture-hf-calibration-concurrency (DI-EV-0035C.1d)', () => {
  const vehicleId = 'veh-concurrency-1';
  const tokenId = 42_001;
  const t0 = Date.parse('2026-09-01T10:00:00.000Z');
  let idCounter = 0;
  const idFactory = () => `c1d-id-${++idCounter}`;

  const v2Canary = parseHfRecoveryPolicyV2ConfigFromEnv({
    HF_RECOVERY_POLICY_V2_ENABLED: 'true',
    HF_HISTORICAL_POLL_INTERVAL_MS: '30000',
    HF_RECOVERY_POLICY_V2_CANARY_ONLY: 'true',
    HF_RECOVERY_POLICY_V2_CANARY_TOKEN_IDS: String(tokenId),
  });

  const v2Global = parseHfRecoveryPolicyV2ConfigFromEnv({
    HF_RECOVERY_POLICY_V2_ENABLED: 'true',
    HF_HISTORICAL_POLL_INTERVAL_MS: '30000',
    HF_RECOVERY_POLICY_V2_CANARY_ONLY: 'false',
  });

  const legacyPolicy = parseHfRecoveryPolicyV2ConfigFromEnv({
    HF_RECOVERY_POLICY_V2_ENABLED: 'false',
  });

  beforeEach(() => {
    idCounter = 0;
  });

  function activateAtBoundary(
    series: ReturnType<typeof switchHfCalibrationPhase>['series'],
    pendingMs: number,
    counters = null as ReturnType<typeof accumulatePhaseQueryMetrics> | null,
    atMs = t0 + 10_000,
  ) {
    const pending = series.pendingPhaseRequest;
    expect(pending?.effectivePollIntervalMs).toBe(pendingMs);
    const applied = applyPendingCalibrationPhaseAtBoundary({
      series,
      pending,
      counters,
      hfPolicy: v2Global,
      effectiveAtMs: atMs,
      idFactory,
    });
    return applied.series!;
  }

  it('1) cycle starts 10s, operator requests 20s while cycle active, release applies 20s', () => {
    const phase10 = switchHfCalibrationPhase({
      existing: null,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 10_000,
      nowMs: t0,
      idFactory,
    }).series;

    const requested = requestHfCalibrationPhase({
      existing: phase10,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 20_000,
      nowMs: t0 + 5_000,
      idFactory,
    });
    expect(requested.series.pendingPhaseRequest?.effectivePollIntervalMs).toBe(20_000);
    expect(requested.series.activePhase?.effectivePollIntervalMs).toBe(10_000);

    const released = buildCycleReleaseAcquisitionState({
      persisted: {
        hfCalibrationSeries: requested.series,
        acquisitionStateVersion: 2,
      },
      dataPlane: {
        cycleCount: 3,
        lastCycleAt: new Date(t0 + 10_000).toISOString(),
        hfWatermarkAt: '2026-09-01T10:00:25.000Z',
        hfWatermarkByField: { speed: '2026-09-01T10:00:25.000Z' },
        hfQueryCoverageByField: { speed: '2026-09-01T10:00:20.000Z' },
        hfPhysicalIdentityVersion: 'AGGREGATE_BUCKET_V2',
        hfQueryProvenanceRing: [],
        hfRecoveryCursorByField: {},
        lastRecoverySweepAt: null,
        recoverySweepCount: 0,
        lastHfHistoricalPollAt: new Date(t0 + 10_000).toISOString(),
        eventWatermarkAt: null,
        seenEventFingerprints: [],
        seenPhysicalSampleFingerprints: [],
        lastSequenceNumber: 12,
        quarantinedProviderFields: [],
        consecutiveTransientFailures: 0,
        lastFailureClass: null,
        lastFailureAt: null,
      },
      hfPolicy: v2Global,
      effectiveAtMs: t0 + 10_000,
      idFactory,
    });

    expect(released.hfCalibrationSeries?.activePhase?.effectivePollIntervalMs).toBe(20_000);
    expect(released.hfCalibrationSeries?.pendingPhaseRequest).toBeNull();
    expect(released.hfWatermarkAt).toBe('2026-09-01T10:00:25.000Z');
  });

  it('2) phase switch concurrent with persistence — watermarks and provenance survive', () => {
    const phase10 = switchHfCalibrationPhase({
      existing: null,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 10_000,
      nowMs: t0,
      idFactory,
    }).series;
    const pending20 = requestHfCalibrationPhase({
      existing: phase10,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 20_000,
      nowMs: t0 + 5_000,
      idFactory,
    }).series;

    const provenance = [{ queryFrom: '2026-09-01T10:00:00.000Z', status: 'SUCCESS' }];
    const released = buildCycleReleaseAcquisitionState({
      persisted: { hfCalibrationSeries: pending20, acquisitionStateVersion: 1 },
      dataPlane: {
        cycleCount: 2,
        lastCycleAt: new Date(t0 + 10_000).toISOString(),
        hfWatermarkAt: '2026-09-01T10:00:18.000Z',
        hfWatermarkByField: { speed: '2026-09-01T10:00:18.000Z' },
        hfQueryCoverageByField: { speed: '2026-09-01T10:00:15.000Z' },
        hfPhysicalIdentityVersion: 'AGGREGATE_BUCKET_V2',
        hfQueryProvenanceRing: provenance,
        hfRecoveryCursorByField: { speed: '2026-09-01T10:00:10.000Z' },
        lastRecoverySweepAt: '2026-09-01T10:00:05.000Z',
        recoverySweepCount: 1,
        lastHfHistoricalPollAt: new Date(t0 + 10_000).toISOString(),
        eventWatermarkAt: null,
        seenEventFingerprints: [],
        seenPhysicalSampleFingerprints: ['fp-1'],
        lastSequenceNumber: 8,
        quarantinedProviderFields: [],
        consecutiveTransientFailures: 0,
        lastFailureClass: null,
        lastFailureAt: null,
      },
      hfPolicy: v2Global,
      effectiveAtMs: t0 + 10_000,
      idFactory,
    });

    expect(released.hfQueryProvenanceRing).toEqual(provenance);
    expect(released.hfRecoveryCursorByField.speed).toBe('2026-09-01T10:00:10.000Z');
    expect(released.hfCalibrationSeries?.activePhase?.effectivePollIntervalMs).toBe(20_000);
  });

  it('3) two rapid identical phase switch requests do not duplicate transition', () => {
    const phase10 = switchHfCalibrationPhase({
      existing: null,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 10_000,
      nowMs: t0,
      idFactory,
    }).series;
    const first = requestHfCalibrationPhase({
      existing: phase10,
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
      nowMs: t0 + 1_100,
      idFactory,
    });
    expect(second.deduplicated).toBe(true);
    expect(second.series.pendingPhaseRequest?.requestId).toBe(
      first.series.pendingPhaseRequest?.requestId,
    );

    const released = activateAtBoundary(second.series, 20_000, null, t0 + 10_000);
    expect(released.completedPhases).toHaveLength(1);
    expect(released.activePhase?.effectivePollIntervalMs).toBe(20_000);
  });

  it('4) two rapid different phase requests — latest pending wins deterministically', () => {
    const phase10 = switchHfCalibrationPhase({
      existing: null,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 10_000,
      nowMs: t0,
      idFactory,
    }).series;
    const after20 = requestHfCalibrationPhase({
      existing: phase10,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 20_000,
      nowMs: t0 + 1_000,
      idFactory,
    }).series;
    const latest = requestHfCalibrationPhase({
      existing: after20,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 30_000,
      nowMs: t0 + 1_100,
      idFactory,
    }).series;
    expect(latest.pendingPhaseRequest?.effectivePollIntervalMs).toBe(30_000);

    const released = activateAtBoundary(latest, 30_000, null, t0 + 10_000);
    expect(released.activePhase?.effectivePollIntervalMs).toBe(30_000);
  });

  it('5) LEGACY token cannot activate calibration phase', () => {
    const resolved = resolveHfRecoveryPolicyForToken(legacyPolicy, tokenId);
    expect(resolved.mode).toBe('LEGACY');
    expect(() => assertHfCalibrationPhaseActivationAllowed(resolved, legacyPolicy)).toThrow(
      /requires effective V2/i,
    );
  });

  it('6) V2 + canary-only + empty allowlist rejects phase activation', () => {
    const emptyCanary = parseHfRecoveryPolicyV2ConfigFromEnv({
      HF_RECOVERY_POLICY_V2_ENABLED: 'true',
      HF_RECOVERY_POLICY_V2_CANARY_ONLY: 'true',
      HF_RECOVERY_POLICY_V2_CANARY_TOKEN_IDS: '',
    });
    const resolved = resolveHfRecoveryPolicyForToken(emptyCanary, tokenId);
    expect(resolved.mode).toBe('LEGACY');
    expect(() => assertHfCalibrationPhaseActivationAllowed(resolved, emptyCanary)).toThrow(
      /requires effective V2/i,
    );
  });

  it('7) V2 canary token not on allowlist rejects phase activation', () => {
    const resolved = resolveHfRecoveryPolicyForToken(v2Canary, tokenId + 1);
    expect(resolved.mode).toBe('LEGACY');
    expect(() => assertHfCalibrationPhaseActivationAllowed(resolved, v2Canary)).toThrow(
      /requires effective V2/i,
    );
  });

  it('8) allowlisted V2 token accepts pending request', () => {
    const resolved = resolveHfRecoveryPolicyForToken(v2Canary, tokenId);
    expect(resolved.mode).toBe('V2');
    assertHfCalibrationPhaseActivationAllowed(resolved, v2Canary);
    const { series } = requestHfCalibrationPhase({
      existing: null,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 10_000,
      nowMs: t0,
      idFactory,
    });
    expect(series.pendingPhaseRequest?.effectivePollIntervalMs).toBe(10_000);
  });

  it('9) after transition next HF poll uses new cadence', () => {
    const phase10 = switchHfCalibrationPhase({
      existing: null,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 10_000,
      nowMs: t0,
      idFactory,
    }).series;
    const pending20 = requestHfCalibrationPhase({
      existing: phase10,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 20_000,
      nowMs: t0 + 5_000,
      idFactory,
    }).series;
    const released = buildCycleReleaseAcquisitionState({
      persisted: { hfCalibrationSeries: pending20, acquisitionStateVersion: 1 },
      dataPlane: {
        cycleCount: 1,
        lastCycleAt: new Date(t0 + 10_000).toISOString(),
        hfWatermarkAt: null,
        hfWatermarkByField: {},
        hfQueryCoverageByField: {},
        hfPhysicalIdentityVersion: 'AGGREGATE_BUCKET_V2',
        hfQueryProvenanceRing: [],
        hfRecoveryCursorByField: {},
        lastRecoverySweepAt: null,
        recoverySweepCount: 0,
        lastHfHistoricalPollAt: null,
        eventWatermarkAt: null,
        seenEventFingerprints: [],
        seenPhysicalSampleFingerprints: [],
        lastSequenceNumber: 1,
        quarantinedProviderFields: [],
        consecutiveTransientFailures: 0,
        lastFailureClass: null,
        lastFailureAt: null,
      },
      hfPolicy: v2Global,
      effectiveAtMs: t0 + 10_000,
      idFactory,
    });
    const effectivePolicy = applyHfPolicyWithSessionPollOverride(
      v2Global,
      released.hfCalibrationSeries,
    );
    expect(resolveEffectiveHfPollIntervalMs(v2Global, released.hfCalibrationSeries)).toBe(20_000);
    expect(
      isHfHistoricalPollDue({
        nowMs: t0 + 10_000 + 15_000,
        lastHfHistoricalPollAt: new Date(t0 + 10_000).toISOString(),
        pollIntervalMs: effectivePolicy.hfHistoricalPollIntervalMs,
        policyMode: effectivePolicy.mode,
      }),
    ).toBe(false);
    expect(
      isHfHistoricalPollDue({
        nowMs: t0 + 10_000 + 21_000,
        lastHfHistoricalPollAt: new Date(t0 + 10_000).toISOString(),
        pollIntervalMs: effectivePolicy.hfHistoricalPollIntervalMs,
        policyMode: effectivePolicy.mode,
      }),
    ).toBe(true);
  });

  it('10) transition query spanning boundary is TRANSITION_WINDOW', () => {
    const phase10 = switchHfCalibrationPhase({
      existing: null,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 10_000,
      nowMs: t0,
      idFactory,
    }).series;
    const pending20 = requestHfCalibrationPhase({
      existing: phase10,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 20_000,
      nowMs: t0 + 5_000,
      idFactory,
    }).series;
    const released = buildCycleReleaseAcquisitionState({
      persisted: { hfCalibrationSeries: pending20, acquisitionStateVersion: 1 },
      dataPlane: {
        cycleCount: 1,
        lastCycleAt: new Date(t0 + 10_000).toISOString(),
        hfWatermarkAt: null,
        hfWatermarkByField: {},
        hfQueryCoverageByField: {},
        hfPhysicalIdentityVersion: 'AGGREGATE_BUCKET_V2',
        hfQueryProvenanceRing: [],
        hfRecoveryCursorByField: {},
        lastRecoverySweepAt: null,
        recoverySweepCount: 0,
        lastHfHistoricalPollAt: null,
        eventWatermarkAt: null,
        seenEventFingerprints: [],
        seenPhysicalSampleFingerprints: [],
        lastSequenceNumber: 1,
        quarantinedProviderFields: [],
        consecutiveTransientFailures: 0,
        lastFailureClass: null,
        lastFailureAt: null,
      },
      hfPolicy: v2Global,
      effectiveAtMs: t0 + 10_000,
      idFactory,
    });
    const boundaryAt = released.hfCalibrationSeries!.lastPhaseBoundaryAt!;
    const boundaryMs = Date.parse(boundaryAt);
    expect(
      classifyCalibrationQueryWindow({
        queryFrom: new Date(boundaryMs - 12_000),
        queryTo: new Date(boundaryMs + 4_000),
        requestStartedAt: new Date(boundaryMs + 1_000),
        calibration: released.hfCalibrationSeries,
      }),
    ).toBe('TRANSITION_WINDOW');
  });

  it('11) same session and vehicle remain bound across transitions', () => {
    let series = switchHfCalibrationPhase({
      existing: null,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 10_000,
      nowMs: t0,
      idFactory,
    }).series;
    const seriesId = series.calibrationSeriesId;
    for (const interval of [20_000, 30_000]) {
      const pending = requestHfCalibrationPhase({
        existing: series,
        vehicleId,
        tokenId,
        effectivePollIntervalMs: interval,
        nowMs: t0 + interval,
        idFactory,
      }).series;
      series = activateAtBoundary(pending, interval, null, t0 + interval);
    }
    expect(series.calibrationSeriesId).toBe(seriesId);
    expect(series.vehicleId).toBe(vehicleId);
    expect(series.tokenId).toBe(tokenId);
  });

  it('12) completed phase receives durable evidence summary at boundary', () => {
    const phase10 = switchHfCalibrationPhase({
      existing: null,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 10_000,
      nowMs: t0,
      idFactory,
    }).series;
    const phaseId = phase10.activePhase!.calibrationPhaseId;
    const counters = accumulatePhaseQueryMetrics(
      null,
      {
        status: 'SUCCESS',
        resultBucketCount: 4,
        duplicateBucketCount: 1,
        revisionBucketCount: 0,
        recoveredLateBucketCount: 0,
        uniqueTemporalBucketStartCount: 4,
        maxIntraResponseTemporalGapMs: 1000,
        windowClassification: 'PHASE_NATIVE',
      },
      3,
      phaseId,
    );
    const pending20 = requestHfCalibrationPhase({
      existing: phase10,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 20_000,
      nowMs: t0 + 5_000,
      idFactory,
    }).series;
    const released = activateAtBoundary(pending20, 20_000, counters, t0 + 10_000);
    expect(released.completedPhaseSummaries).toHaveLength(1);
    const summary = released.completedPhaseSummaries[0];
    expect(summary.providerRequestCount).toBe(1);
    expect(summary.providerBucketCount).toBe(4);
    expect(summary.newBucketCount).toBe(3);
    expect(summary.effectiveConfig.policyMode).toBe('V2');
    expect(summary.phaseEndedAt).toBe(new Date(t0 + 10_000).toISOString());
  });
});
