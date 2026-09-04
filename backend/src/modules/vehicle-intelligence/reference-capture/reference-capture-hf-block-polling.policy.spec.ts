import {
  auditCanaryMetricsReconstructible,
  buildHfBlockDensityObservability,
  computeBucketTemporalSpanMs,
  computeFleetRequestLoadModel,
  computeFleetStaggerOffsetMs,
  computeStaggeredPollDeadlineMs,
  countUniqueTemporalBucketStarts,
  distributeFleetStaggerBuckets,
  HF_30S_BLOCK_HYPOTHESIS,
  HF_BUCKET_AGGREGATION_INTERVAL,
  HF_POLL_CALIBRATION_CANDIDATES_MS,
  isHfHistoricalPollDue,
  listEpochAlignedPollDeadlinesInWindow,
  PROVISIONAL_HF_POLL_INTERVAL_MS,
  verifyNoUnqueriedGap,
} from './reference-capture-hf-block-polling.policy';
import {
  buildHfQueryWindow,
  emptyWatermarkState,
  parseHfRecoveryPolicyV2ConfigFromEnv,
  PROVISIONAL_RECOVERY_OVERLAP_MS,
  PROVISIONAL_SETTLEMENT_DELAY_MS,
  resolveHfRecoveryPolicyForToken,
} from './reference-capture-hf-recovery-v2.policy';
import { HF_REQUESTED_INTERVAL } from './reference-capture-hf-watermark-policy';

describe('reference-capture-hf-block-polling.policy', () => {
  const sessionStart = new Date('2026-09-01T10:00:00.000Z');

  it('poll cadence is independent from bucket aggregation interval', () => {
    const v2 = parseHfRecoveryPolicyV2ConfigFromEnv({
      HF_RECOVERY_POLICY_V2_ENABLED: 'true',
      HF_HISTORICAL_POLL_INTERVAL_MS: '30000',
      HF_RECOVERY_POLICY_V2_CANARY_ONLY: 'false',
    });
    expect(v2.hfHistoricalPollIntervalMs).toBe(30_000);
    expect(HF_BUCKET_AGGREGATION_INTERVAL).toBe('1s');
    expect(HF_REQUESTED_INTERVAL).toBe('1s');
  });

  it('30s polling still uses 1s historical aggregation in query builder contract', () => {
    const v2 = parseHfRecoveryPolicyV2ConfigFromEnv({
      HF_RECOVERY_POLICY_V2_ENABLED: 'true',
      HF_HISTORICAL_POLL_INTERVAL_MS: '30000',
      HF_RECOVERY_POLICY_V2_CANARY_ONLY: 'false',
    });
    const window = buildHfQueryWindow({
      watermarkState: emptyWatermarkState(),
      sessionStartedAt: sessionStart,
      providerFields: ['speed'],
      requestStartedAt: new Date('2026-09-01T10:00:40.000Z'),
      config: v2,
    });
    expect(window.settlementDelayMs).toBe(PROVISIONAL_SETTLEMENT_DELAY_MS);
    expect(window.recoveryOverlapMs).toBe(PROVISIONAL_RECOVERY_OVERLAP_MS);
    expect(HF_REQUESTED_INTERVAL).toBe('1s');
  });

  it('poll cadence is independent from settlement delay', () => {
    const v2 = parseHfRecoveryPolicyV2ConfigFromEnv({
      HF_RECOVERY_POLICY_V2_ENABLED: 'true',
      HF_HISTORICAL_POLL_INTERVAL_MS: '60000',
      HF_SETTLEMENT_DELAY_MS: '8000',
      HF_RECOVERY_POLICY_V2_CANARY_ONLY: 'false',
    });
    expect(v2.hfHistoricalPollIntervalMs).toBe(60_000);
    expect(v2.settlementDelayMs).toBe(8000);
  });

  it('poll cadence is independent from recovery overlap', () => {
    const v2 = parseHfRecoveryPolicyV2ConfigFromEnv({
      HF_RECOVERY_POLICY_V2_ENABLED: 'true',
      HF_HISTORICAL_POLL_INTERVAL_MS: '20000',
      HF_RECOVERY_OVERLAP_MS: '6000',
      HF_RECOVERY_POLICY_V2_CANARY_ONLY: 'false',
    });
    expect(v2.hfHistoricalPollIntervalMs).toBe(20_000);
    expect(v2.recoveryOverlapMs).toBe(6000);
  });

  it('slower polling creates no historical query gap (coverage minus overlap)', () => {
    const previousCoverage = '2026-09-01T10:00:30.000Z';
    const nextFrom = new Date('2026-09-01T10:00:24.000Z');
    expect(
      verifyNoUnqueriedGap({
        previousQueryCoverageTo: previousCoverage,
        nextQueryFrom: nextFrom,
        recoveryOverlapMs: 6000,
      }),
    ).toBe(true);
  });

  it('V2 disabled preserves legacy scheduling (poll every runner cycle)', () => {
    const legacy = parseHfRecoveryPolicyV2ConfigFromEnv({ HF_RECOVERY_POLICY_V2_ENABLED: 'false' });
    expect(
      isHfHistoricalPollDue({
        nowMs: Date.parse('2026-09-01T10:00:06.000Z'),
        lastHfHistoricalPollAt: '2026-09-01T10:00:05.000Z',
        pollIntervalMs: legacy.hfHistoricalPollIntervalMs,
        policyMode: legacy.mode,
      }),
    ).toBe(true);
  });

  it('V2 poll due respects configured interval', () => {
    const v2 = parseHfRecoveryPolicyV2ConfigFromEnv({
      HF_RECOVERY_POLICY_V2_ENABLED: 'true',
      HF_HISTORICAL_POLL_INTERVAL_MS: '30000',
      HF_RECOVERY_POLICY_V2_CANARY_ONLY: 'false',
    });
    expect(
      isHfHistoricalPollDue({
        nowMs: Date.parse('2026-09-01T10:00:20.000Z'),
        lastHfHistoricalPollAt: '2026-09-01T10:00:05.000Z',
        pollIntervalMs: v2.hfHistoricalPollIntervalMs,
        policyMode: v2.mode,
      }),
    ).toBe(false);
    expect(
      isHfHistoricalPollDue({
        nowMs: Date.parse('2026-09-01T10:00:36.000Z'),
        lastHfHistoricalPollAt: '2026-09-01T10:00:05.000Z',
        pollIntervalMs: v2.hfHistoricalPollIntervalMs,
        policyMode: v2.mode,
      }),
    ).toBe(true);
  });

  it('canary scoping works for poll config', () => {
    const base = parseHfRecoveryPolicyV2ConfigFromEnv({
      HF_RECOVERY_POLICY_V2_ENABLED: 'true',
      HF_HISTORICAL_POLL_INTERVAL_MS: '30000',
      HF_RECOVERY_POLICY_V2_CANARY_TOKEN_IDS: '187336',
    });
    expect(resolveHfRecoveryPolicyForToken(base, 187336).hfHistoricalPollIntervalMs).toBe(30_000);
    expect(resolveHfRecoveryPolicyForToken(base, 999).mode).toBe('LEGACY');
  });

  it('invalid poll intervals are clamped to bounds', () => {
    const low = parseHfRecoveryPolicyV2ConfigFromEnv({
      HF_RECOVERY_POLICY_V2_ENABLED: 'true',
      HF_HISTORICAL_POLL_INTERVAL_MS: '1000',
      HF_RECOVERY_POLICY_V2_CANARY_ONLY: 'false',
    });
    expect(low.hfHistoricalPollIntervalMs).toBe(5000);
    const high = parseHfRecoveryPolicyV2ConfigFromEnv({
      HF_RECOVERY_POLICY_V2_ENABLED: 'true',
      HF_HISTORICAL_POLL_INTERVAL_MS: '999999',
      HF_RECOVERY_POLICY_V2_CANARY_ONLY: 'false',
    });
    expect(high.hfHistoricalPollIntervalMs).toBe(120_000);
  });

  it('observability records effective poll cadence', () => {
    const window = buildHfQueryWindow({
      watermarkState: emptyWatermarkState(),
      sessionStartedAt: sessionStart,
      providerFields: ['speed'],
      requestStartedAt: new Date('2026-09-01T10:00:40.000Z'),
      config: parseHfRecoveryPolicyV2ConfigFromEnv({
        HF_RECOVERY_POLICY_V2_ENABLED: 'true',
        HF_HISTORICAL_POLL_INTERVAL_MS: '30000',
        HF_RECOVERY_POLICY_V2_CANARY_ONLY: 'false',
      }),
    });
    const obs = buildHfBlockDensityObservability({
      window,
      pollIntervalMs: 30_000,
      policyMode: 'V2',
      providerBucketCount: 28,
      newBucketCount: 28,
      duplicateBucketCount: 0,
      revisionBucketCount: 0,
      uniqueTemporalBucketStartCount: 28,
      bucketTimestamps: ['2026-09-01T10:00:10.000Z', '2026-09-01T10:00:11.000Z'],
      queryDurationMs: 450,
      querySuccess: true,
      queryZeroResult: false,
      providerError: false,
    });
    expect(obs.poll_interval_ms).toBe(30_000);
    expect(obs.hf_api_poll_cadence_ms).toBe(30_000);
    expect(obs.hf_bucket_aggregation_interval).toBe('1s');
    expect(obs.buckets_per_provider_request).toBe(28);
    expect(obs.hf_30s_block_polling_validated).toBe(false);
  });

  it('request-load model arithmetic is deterministic', () => {
    const model = computeFleetRequestLoadModel();
    const row = model.find((r) => r.activeVehicles === 1000 && r.pollIntervalMs === 30_000);
    expect(row).toBeDefined();
    expect(row!.requestsPerSecond).toBeCloseTo(1000 / 30, 5);
    expect(row!.requestsPerHour).toBeCloseTo((1000 / 30) * 3600, 2);
  });

  it('staggering distributes simulated vehicles across the polling window', () => {
    const tokenIds = Array.from({ length: 1000 }, (_, i) => 50_000 + i * 17_371);
    const buckets = distributeFleetStaggerBuckets(tokenIds, 30_000, 10);
    expect(buckets.reduce((a, b) => a + b, 0)).toBe(1000);
    const maxBucket = Math.max(...buckets);
    const minBucket = Math.min(...buckets);
    expect(maxBucket).toBeLessThanOrEqual(200);
    expect(minBucket).toBeGreaterThan(0);
    expect(computeFleetStaggerOffsetMs(187336, 30_000)).toBe(187336 % 30_000);
  });

  it('calibration candidate matrix includes 10/20/30/60s', () => {
    expect(HF_POLL_CALIBRATION_CANDIDATES_MS).toEqual([10_000, 20_000, 30_000, 60_000]);
    expect(PROVISIONAL_HF_POLL_INTERVAL_MS).toBe(30_000);
  });

  it('30s block hypothesis is explicitly NOT_VALIDATED', () => {
    expect(HF_30S_BLOCK_HYPOTHESIS.status).toBe('NOT_VALIDATED');
  });

  it('unique temporal bucket start counting is field-agnostic per timestamp', () => {
    expect(
      countUniqueTemporalBucketStarts([
        '2026-09-01T10:00:05.000Z',
        '2026-09-01T10:00:05.000Z',
        '2026-09-01T10:00:06.000Z',
      ]),
    ).toBe(2);
  });

  describe('DI-EV-0035C.1a bucket age observability semantics', () => {
    const observationMs = Date.parse('2026-09-01T10:01:00.000Z');
    const oldestTs = '2026-09-01T10:00:10.000Z';
    const newestTs = '2026-09-01T10:00:50.000Z';

    it('computes exact ages with oldest >= newest at observation time', () => {
      const span = computeBucketTemporalSpanMs([oldestTs, newestTs], observationMs);
      expect(span.oldestReturnedBucketAgeMs).toBe(50_000);
      expect(span.newestReturnedBucketAgeMs).toBe(10_000);
      expect(span.oldestReturnedBucketAgeMs!).toBeGreaterThanOrEqual(span.newestReturnedBucketAgeMs!);
    });

    it('returns null ages for empty bucket timestamps', () => {
      const span = computeBucketTemporalSpanMs([], observationMs);
      expect(span.oldestReturnedBucketAgeMs).toBeNull();
      expect(span.newestReturnedBucketAgeMs).toBeNull();
    });

    it('buildHfBlockDensityObservability exposes min/max bucket timestamps', () => {
      const window = buildHfQueryWindow({
        watermarkState: emptyWatermarkState(),
        sessionStartedAt: sessionStart,
        providerFields: ['speed'],
        requestStartedAt: new Date('2026-09-01T10:00:40.000Z'),
        config: parseHfRecoveryPolicyV2ConfigFromEnv({
          HF_RECOVERY_POLICY_V2_ENABLED: 'true',
          HF_RECOVERY_POLICY_V2_CANARY_ONLY: 'false',
        }),
      });
      const obs = buildHfBlockDensityObservability({
        window,
        pollIntervalMs: 30_000,
        policyMode: 'V2',
        providerBucketCount: 2,
        newBucketCount: 2,
        duplicateBucketCount: 0,
        revisionBucketCount: 0,
        uniqueTemporalBucketStartCount: 2,
        bucketTimestamps: [oldestTs, newestTs],
        queryDurationMs: 100,
        querySuccess: true,
        queryZeroResult: false,
        providerError: false,
        observationTimeMs: observationMs,
      });
      expect(obs.min_bucket_timestamp).toBe(oldestTs);
      expect(obs.max_bucket_timestamp).toBe(newestTs);
      expect(obs.oldest_returned_bucket_age_ms).toBe(50_000);
      expect(obs.newest_returned_bucket_age_ms).toBe(10_000);
      expect(obs.max_intra_response_temporal_gap_ms).toBe(40_000);
    });
  });

  describe('DI-EV-0035C.1a epoch-aligned stagger deadline primitive', () => {
    const pollIntervalMs = 30_000;
    const epochMs = 0;

    it('deadline uses token offset (differs by tokenId phase)', () => {
      const nowMs = 100_000;
      const tokenA = 187336;
      const tokenB = 187337;
      const offsetA = computeFleetStaggerOffsetMs(tokenA, pollIntervalMs);
      const offsetB = computeFleetStaggerOffsetMs(tokenB, pollIntervalMs);
      const deadlineA = computeStaggeredPollDeadlineMs({
        tokenId: tokenA,
        pollIntervalMs,
        nowMs,
        epochMs,
      });
      const deadlineB = computeStaggeredPollDeadlineMs({
        tokenId: tokenB,
        pollIntervalMs,
        nowMs,
        epochMs,
      });
      expect(deadlineA).toBeGreaterThanOrEqual(nowMs);
      expect(deadlineB).toBeGreaterThanOrEqual(nowMs);
      expect((deadlineA - epochMs) % pollIntervalMs).toBe(offsetA);
      expect((deadlineB - epochMs) % pollIntervalMs).toBe(offsetB);
      if (offsetA !== offsetB) {
        expect(deadlineA).not.toBe(deadlineB);
      }
    });

    it('deadlines are stable across simulated restart (same token + interval)', () => {
      const tokenId = 42_000;
      const nowMs = Date.parse('2026-09-01T12:00:00.000Z');
      const first = computeStaggeredPollDeadlineMs({ tokenId, pollIntervalMs, nowMs, epochMs });
      const second = computeStaggeredPollDeadlineMs({ tokenId, pollIntervalMs, nowMs, epochMs });
      expect(first).toBe(second);
    });

    it('listEpochAlignedPollDeadlinesInWindow follows epoch + offset + n * interval', () => {
      const tokenId = 7;
      const offset = computeFleetStaggerOffsetMs(tokenId, pollIntervalMs);
      const windowStartMs = 0;
      const windowEndMs = 120_000;
      const deadlines = listEpochAlignedPollDeadlinesInWindow({
        tokenId,
        pollIntervalMs,
        windowStartMs,
        windowEndMs,
        epochMs,
      });
      expect(deadlines.length).toBeGreaterThan(0);
      for (const d of deadlines) {
        expect((d - epochMs - offset) % pollIntervalMs).toBe(0);
      }
      expect(deadlines[0]).toBe(offset);
      expect(deadlines[1]).toBe(offset + pollIntervalMs);
    });

    it('1000 simulated tokens distribute across stagger buckets', () => {
      const tokenIds = Array.from({ length: 1000 }, (_, i) => 50_000 + i * 17_371);
      const buckets = distributeFleetStaggerBuckets(tokenIds, pollIntervalMs, 10);
      expect(buckets.reduce((a, b) => a + b, 0)).toBe(1000);
      expect(Math.min(...buckets)).toBeGreaterThan(0);
      expect(Math.max(...buckets)).toBeLessThanOrEqual(200);
    });
  });

  describe('DI-EV-0035C.1a canary metrics reconstruction audit', () => {
    it('reports all required calibration metrics as reconstructible', () => {
      const audit = auditCanaryMetricsReconstructible();
      expect(audit.reconstructible).toBe(true);
      expect(audit.missingMetrics).toEqual([]);
    });
  });
});
