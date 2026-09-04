import {
  advanceHfQueryCoverageIfEligible,
  advanceRecoveryCursorAfterSuccessfulSweep,
  appendQueryProvenanceRecord,
  buildHfQueryWindow,
  emptyWatermarkState,
  LEGACY_HF_RECOVERY_OVERLAP_MS,
  parseHfRecoveryPolicyV2ConfigFromEnv,
  planRecoverySweepWindow,
  PROVISIONAL_RECOVERY_OVERLAP_MS,
  PROVISIONAL_SETTLEMENT_DELAY_MS,
  resolveHfQueryTo,
  resolveHfRecoveryPolicyForToken,
  shouldAdvanceQueryCoverageAfterAcquisition,
  shouldRunRecoverySweep,
} from './reference-capture-hf-recovery-v2.policy';
import { HF_QUERY_OVERLAP_MS } from './reference-capture-hf-watermark-policy';
import {
  buildAggregateBucketFingerprint,
  buildPhysicalSampleFingerprint,
  HF_PHYSICAL_IDENTITY_VERSION,
} from './reference-capture-physical-sample-identity.util';

describe('reference-capture-hf-recovery-v2.policy', () => {
  const sessionStart = new Date('2026-09-01T10:00:00.000Z');

  it('V2 disabled preserves legacy 2s overlap', () => {
    const legacy = parseHfRecoveryPolicyV2ConfigFromEnv({ HF_RECOVERY_POLICY_V2_ENABLED: 'false' });
    expect(legacy.mode).toBe('LEGACY');
    const window = buildHfQueryWindow({
      watermarkState: emptyWatermarkState(),
      sessionStartedAt: sessionStart,
      providerFields: ['speed'],
      requestStartedAt: new Date('2026-09-01T10:00:10.000Z'),
      config: legacy,
    });
    expect(window.recoveryOverlapMs).toBe(LEGACY_HF_RECOVERY_OVERLAP_MS);
    expect(window.recoveryOverlapMs).toBe(HF_QUERY_OVERLAP_MS);
    expect(window.settlementDelayMs).toBe(0);
  });

  it('V2 queryTo uses configurable provisional settlement delay (not validated)', () => {
    const v2 = parseHfRecoveryPolicyV2ConfigFromEnv({
      HF_RECOVERY_POLICY_V2_ENABLED: 'true',
      HF_SETTLEMENT_DELAY_MS: '12000',
      HF_RECOVERY_POLICY_V2_CANARY_ONLY: 'false',
    });
    const requestStartedAt = new Date('2026-09-01T10:00:20.000Z');
    const queryTo = resolveHfQueryTo(requestStartedAt, v2);
    expect(queryTo.toISOString()).toBe('2026-09-01T10:00:08.000Z');
    expect(v2.settlementDelayMs).toBe(12000);
    expect(PROVISIONAL_SETTLEMENT_DELAY_MS).toBe(8000);
  });

  it('V2 queryFrom uses configurable provisional recovery overlap (not validated)', () => {
    const v2 = parseHfRecoveryPolicyV2ConfigFromEnv({
      HF_RECOVERY_POLICY_V2_ENABLED: 'true',
      HF_RECOVERY_OVERLAP_MS: '9000',
      HF_RECOVERY_POLICY_V2_CANARY_ONLY: 'false',
    });
    const state = emptyWatermarkState();
    state.hfQueryCoverageByField = { speed: '2026-09-01T10:00:10.000Z' };
    const window = buildHfQueryWindow({
      watermarkState: state,
      sessionStartedAt: sessionStart,
      providerFields: ['speed'],
      requestStartedAt: new Date('2026-09-01T10:00:20.000Z'),
      config: v2,
    });
    expect(window.recoveryOverlapMs).toBe(9000);
    expect(window.queryFrom.toISOString()).toBe('2026-09-01T10:00:01.000Z');
    expect(PROVISIONAL_RECOVERY_OVERLAP_MS).toBe(6000);
  });

  it('canary scoping restricts V2 to allowlisted tokenIds', () => {
    const base = parseHfRecoveryPolicyV2ConfigFromEnv({
      HF_RECOVERY_POLICY_V2_ENABLED: 'true',
      HF_RECOVERY_POLICY_V2_CANARY_TOKEN_IDS: '187336',
    });
    expect(resolveHfRecoveryPolicyForToken(base, 187336).mode).toBe('V2');
    expect(resolveHfRecoveryPolicyForToken(base, 999).mode).toBe('LEGACY');
  });

  it('DATA and QUERY COVERAGE watermarks remain separate authorities', () => {
    const state = emptyWatermarkState();
    state.hfWatermarkByField = { speed: '2026-09-01T10:00:05.000Z' };
    const advanced = advanceHfQueryCoverageIfEligible(
      state,
      ['speed'],
      '2026-09-01T10:00:12.000Z',
      true,
    );
    expect(advanced.hfQueryCoverageByField.speed).toBe('2026-09-01T10:00:12.000Z');
    expect(advanced.hfWatermarkByField.speed).toBe('2026-09-01T10:00:05.000Z');
  });

  it('persistence failure cannot commit query coverage', () => {
    expect(
      shouldAdvanceQueryCoverageAfterAcquisition({
        providerQuerySucceeded: true,
        persistenceCommitted: false,
      }),
    ).toBe(false);
    const state = emptyWatermarkState();
    const result = advanceHfQueryCoverageIfEligible(
      state,
      ['speed'],
      '2026-09-01T10:00:12.000Z',
      false,
    );
    expect(result.hfQueryCoverageByField).toEqual({});
  });

  it('provider failure does not advance coverage eligibility', () => {
    expect(
      shouldAdvanceQueryCoverageAfterAcquisition({
        providerQuerySucceeded: false,
        persistenceCommitted: true,
      }),
    ).toBe(false);
  });

  it('zero-result query windows are reconstructible via provenance ring', () => {
    const record = {
      recordedAt: new Date().toISOString(),
      policyVersion: 'HF_RECOVERY_V2_2026-09-04',
      policyMode: 'V2' as const,
      tokenId: 1,
      vehicleId: 'v1',
      sessionId: 's1',
      captureCycleId: 'c1',
      queryOrigin: 'FAST_LOOP' as const,
      providerFields: ['speed'],
      queryFrom: sessionStart.toISOString(),
      queryTo: '2026-09-01T10:00:08.000Z',
      requestedInterval: '1s',
      aggregation: 'AVG',
      requestStartedAt: '2026-09-01T10:00:10.000Z',
      requestCompletedAt: '2026-09-01T10:00:10.500Z',
      settlementDelayMs: 8000,
      recoveryOverlapMs: 6000,
      resultBucketCount: 0,
      status: 'ZERO_RESULT' as const,
      requestCorrelationId: 'corr-1',
    };
    const ring = appendQueryProvenanceRecord([], record);
    expect(ring).toHaveLength(1);
    expect(ring[0]!.resultBucketCount).toBe(0);
    expect(ring[0]!.queryFrom).toBe(sessionStart.toISOString());
  });

  it('same-origin aggregate bucket identity is idempotent across overlap', () => {
    const fp1 = buildPhysicalSampleFingerprint({
      providerField: 'speed',
      providerTimestamp: '2026-09-01T10:00:05.000Z',
      normalizedValue: 42,
      identityVersion: HF_PHYSICAL_IDENTITY_VERSION.AGGREGATE_BUCKET_V2,
    });
    const fp2 = buildPhysicalSampleFingerprint({
      providerField: 'speed',
      providerTimestamp: '2026-09-01T10:00:05.000Z',
      normalizedValue: 99,
      identityVersion: HF_PHYSICAL_IDENTITY_VERSION.AGGREGATE_BUCKET_V2,
    });
    expect(fp1).toBe(fp2);
  });

  it('cross-origin buckets are not blindly merged (different queryFrom anchors)', () => {
    const originA = new Date('2026-09-01T10:00:00.000Z');
    const originB = new Date('2026-09-01T10:00:06.000Z');
    const bucketA = buildAggregateBucketFingerprint({
      providerField: 'speed',
      providerTimestamp: '2026-09-01T10:00:05.000Z',
    });
    const bucketB = buildAggregateBucketFingerprint({
      providerField: 'speed',
      providerTimestamp: '2026-09-01T10:00:05.000Z',
    });
    expect(bucketA).toBe(bucketB);
    expect(originA.toISOString()).not.toBe(originB.toISOString());
  });

  it('recovery sweep cursor advances only after successful sweep commit', () => {
    const cursor = advanceRecoveryCursorAfterSuccessfulSweep(
      { hfRecoveryCursorByField: {}, lastRecoverySweepAt: null, recoverySweepCount: 0 },
      ['speed'],
      '2026-09-01T10:00:30.000Z',
    );
    expect(cursor.hfRecoveryCursorByField.speed).toBe('2026-09-01T10:00:30.000Z');
    expect(cursor.recoverySweepCount).toBe(1);
  });

  it('recovery sweep respects interval gate', () => {
    const v2 = parseHfRecoveryPolicyV2ConfigFromEnv({
      HF_RECOVERY_POLICY_V2_ENABLED: 'true',
      HF_RECOVERY_SWEEP_ENABLED: 'true',
      HF_RECOVERY_SWEEP_INTERVAL_MS: '60000',
      HF_RECOVERY_POLICY_V2_CANARY_ONLY: 'false',
    });
    const now = Date.parse('2026-09-01T10:05:00.000Z');
    expect(
      shouldRunRecoverySweep({
        config: v2,
        nowMs: now,
        lastRecoverySweepAt: '2026-09-01T10:04:30.000Z',
      }),
    ).toBe(false);
    expect(
      shouldRunRecoverySweep({
        config: v2,
        nowMs: now,
        lastRecoverySweepAt: '2026-09-01T10:03:00.000Z',
      }),
    ).toBe(true);
  });

  it('recovery sweep plans bounded window behind settled horizon', () => {
    const v2 = parseHfRecoveryPolicyV2ConfigFromEnv({
      HF_RECOVERY_POLICY_V2_ENABLED: 'true',
      HF_RECOVERY_SWEEP_ENABLED: 'true',
      HF_RECOVERY_POLICY_V2_CANARY_ONLY: 'false',
    });
    const state = emptyWatermarkState();
    state.hfQueryCoverageByField = { speed: '2026-09-01T10:05:00.000Z' };
    const window = planRecoverySweepWindow({
      watermarkState: state,
      recoveryCursor: { hfRecoveryCursorByField: {}, lastRecoverySweepAt: null, recoverySweepCount: 0 },
      sessionStartedAt: sessionStart,
      providerFields: ['speed'],
      requestStartedAt: new Date('2026-09-01T10:05:20.000Z'),
      config: v2,
      maxChunkMs: 60_000,
    });
    expect(window).not.toBeNull();
    expect(window!.queryFrom.getTime()).toBeLessThan(window!.queryTo.getTime());
  });
});
