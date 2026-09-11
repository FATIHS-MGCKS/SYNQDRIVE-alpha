import {
  accumulatePhaseQueryMetrics,
  finalizePhaseSummary,
} from './reference-capture-hf-calibration-phase.policy';
import {
  reconstructNativeGapReportFromEvidence,
} from './reference-capture-exp021-native-gap-reconstruction';
import {
  joinNativeGapsWithSettlementObservations,
  type SettlementObservationJoinInput,
} from './reference-capture-exp021-native-settlement-join';
import {
  buildNativeTemporalEvidenceV1,
  canonicalizeOrderedNativeTemporalBucketStarts,
} from './reference-capture-native-temporal-evidence.lib';
import { buildExp021BucketIdentity } from './reference-capture-settlement-shadow-bucket-identity';
import { compareValueSnapshots } from './reference-capture-settlement-shadow-value-snapshot';

const T0 = '2026-09-10T12:00:00.000Z';
const T1 = '2026-09-10T12:00:01.000Z';
const T2 = '2026-09-10T12:00:02.000Z';
const T3 = '2026-09-10T12:00:03.000Z';
const T4 = '2026-09-10T12:00:04.000Z';
const FIELD = 'speed';

function bucketId(iso: string): string {
  return buildExp021BucketIdentity(FIELD, iso);
}

function makePhaseSummary(timestamps: string[]) {
  const phaseId = 'phase-1';
  let counters = accumulatePhaseQueryMetrics(
    null,
    {
      record: {
        status: 'SUCCESS',
        resultBucketCount: timestamps.length,
        duplicateBucketCount: 0,
        revisionBucketCount: 0,
        recoveredLateBucketCount: 0,
        maxIntraResponseTemporalGapMs: 1000,
        windowClassification: 'PHASE_NATIVE',
        queryOrigin: 'FAST_LOOP',
      },
      newBucketCount: timestamps.length,
      temporalBucketStartTimestamps: timestamps,
    },
    phaseId,
  );
  const phase = {
    calibrationPhaseId: phaseId,
    phaseSequence: 1,
    effectivePollIntervalMs: 60_000,
    phaseStartedAt: T0,
    phaseEndedAt: T4,
    phaseProvenance: 'PHYSICAL_T0' as const,
    canonicalT0At: T0,
    effectiveConfig: {
      calibrationSeriesId: 'series-1',
      calibrationPhaseId: phaseId,
      phaseSequence: 1,
      vehicleId: 'veh-1',
      tokenId: 1,
      effectivePollIntervalMs: 60_000,
      settlementDelayMs: 8000,
      recoveryOverlapMs: 6000,
      policyVersion: 'v2',
      policyMode: 'V2' as const,
      effectiveAt: T0,
    },
  };
  return finalizePhaseSummary({
    phase,
    counters,
    phaseEndedAtMs: Date.parse(T4),
  });
}

describe('reference-capture-exp021-native-persistence-join', () => {
  it('persists ordered canonical native temporal bucket starts in completed phase summary', () => {
    const summary = makePhaseSummary([T0, T1, T4]);
    expect(summary.nativeTemporalEvidence).toBeDefined();
    expect(summary.nativeTemporalEvidence?.orderedNativeTemporalBucketStarts).toEqual([
      T0,
      T1,
      T4,
    ]);
    expect(summary.nativeTemporalEvidence?.phaseProvenance).toBe('PHYSICAL_T0');
    expect(summary.nativeTemporalEvidence?.schemaVersion).toBe('EXP021_NATIVE_TEMPORAL_v1');
  });

  it('dedupes duplicate and out-of-order provider timestamps', () => {
    const ordered = canonicalizeOrderedNativeTemporalBucketStarts([
      T4,
      T1,
      T1,
      T0,
      T0,
    ]);
    expect(ordered).toEqual([T0, T1, T4]);
  });

  it('reconstructs gap ledger from persisted evidence only', () => {
    const summary = makePhaseSummary([T0, T1, T4]);
    const report = reconstructNativeGapReportFromEvidence(summary.nativeTemporalEvidence!, 1);
    expect(report.nativeBucketCount).toBe(3);
    const gapT1T4 = report.gaps.find((g) => g.gapDurationMs === 3000);
    expect(gapT1T4).toBeDefined();
    expect(gapT1T4!.interiorExpectedTemporalBuckets).toEqual([T2, T3]);
  });

  it('classifies settlement-only interior buckets for gap t1→t4', () => {
    const summary = makePhaseSummary([T0, T1, T4]);
    const observations: SettlementObservationJoinInput[] = [
      {
        scheduledAgeMs: 30_000,
        providerRequestStatus: 'SUCCESS',
        rawRowCount: 5,
        uniqueBucketIdentities: [T0, T1, T2, T3, T4].map(bucketId),
        bucketValueSnapshots: {
          [bucketId(T0)]: '10',
          [bucketId(T1)]: '11',
          [bucketId(T2)]: '12',
          [bucketId(T3)]: '13',
          [bucketId(T4)]: '14',
        },
        valueContentHash: 'hash-30',
      },
    ];

    const join = joinNativeGapsWithSettlementObservations({
      phaseLabel: '60s',
      phaseProvenance: 'PHYSICAL_T0',
      orderedNativeTemporalBucketStarts:
        summary.nativeTemporalEvidence!.orderedNativeTemporalBucketStarts,
      primaryField: FIELD,
      observations,
      minGapMs: 1,
    });

    const gapRow = join.gapJoinRows.find((r) => r.gap.gapDurationMs === 3000);
    expect(gapRow).toBeDefined();
    const interior = gapRow!.interiorBuckets;
    expect(interior.find((r) => r.temporalIso === T2)?.classification).toBe(
      'SETTLEMENT_PRESENT_NATIVE_ABSENT',
    );
    expect(interior.find((r) => r.temporalIso === T3)?.classification).toBe(
      'SETTLEMENT_PRESENT_NATIVE_ABSENT',
    );
  });

  it('gap interior remains absent through +600 when settlement lacks buckets', () => {
    const summary = makePhaseSummary([T0, T1, T4]);
    const observations: SettlementObservationJoinInput[] = [30_000, 60_000, 120_000, 180_000, 300_000, 600_000].map(
      (age) => ({
        scheduledAgeMs: age,
        providerRequestStatus: 'SUCCESS',
        rawRowCount: 3,
        uniqueBucketIdentities: [T0, T1, T4].map(bucketId),
        bucketValueSnapshots: {
          [bucketId(T0)]: '10',
          [bucketId(T1)]: '11',
          [bucketId(T4)]: '14',
        },
      }),
    );
    const join = joinNativeGapsWithSettlementObservations({
      phaseLabel: '60s',
      phaseProvenance: 'PHYSICAL_T0',
      orderedNativeTemporalBucketStarts:
        summary.nativeTemporalEvidence!.orderedNativeTemporalBucketStarts,
      primaryField: FIELD,
      observations,
      minGapMs: 1,
    });
    const gapRow = join.gapJoinRows.find((r) => r.gap.gapDurationMs === 3000);
    const t2 = gapRow?.interiorBuckets.find((r) => r.temporalIso === T2);
    expect(t2?.classification).toBe('NEITHER_PRESENT');
    expect(t2?.firstSeenAgeMs).toBeNull();
  });

  it('bucket first appears at +60 after +30 ZERO_RESULT', () => {
    const observations: SettlementObservationJoinInput[] = [
      {
        scheduledAgeMs: 30_000,
        providerRequestStatus: 'ZERO_RESULT',
        rawRowCount: 0,
        uniqueBucketIdentities: [],
      },
      {
        scheduledAgeMs: 60_000,
        providerRequestStatus: 'SUCCESS',
        rawRowCount: 1,
        uniqueBucketIdentities: [bucketId(T2)],
        bucketValueSnapshots: { [bucketId(T2)]: '12' },
      },
    ];
    const join = joinNativeGapsWithSettlementObservations({
      phaseLabel: '60s',
      phaseProvenance: 'PHYSICAL_T0',
      orderedNativeTemporalBucketStarts: [T0, T1, T4],
      primaryField: FIELD,
      observations,
    });
    const settlementOnly = join.settlementOnlyBuckets.find((r) => r.temporalIso === T2);
    expect(settlementOnly?.firstSeenAgeMs).toBe(60_000);
  });

  it('metadata-only hash change does not become VALUE_REVISED', () => {
    const snapshots = { [bucketId(T1)]: '11' };
    const cmp = compareValueSnapshots(snapshots, snapshots);
    expect(cmp.revisionCount).toBe(0);
  });

  it('detects VALUE_REVISED when normalized value changes at later age', () => {
    const prior = { [bucketId(T1)]: '11' };
    const later = { [bucketId(T1)]: '12' };
    const cmp = compareValueSnapshots(later, prior);
    expect(cmp.revisionCount).toBe(1);
  });

  it('phase transition seals prior phase native evidence independently', () => {
    const phase10 = makePhaseSummary([T0, T1]);
    const phase20 = makePhaseSummary([T2, T4]);
    expect(phase10.nativeTemporalEvidence?.orderedNativeTemporalBucketStarts).toEqual([T0, T1]);
    expect(phase20.nativeTemporalEvidence?.orderedNativeTemporalBucketStarts).toEqual([T2, T4]);
  });

  it('buildNativeTemporalEvidenceV1 survives without live counters', () => {
    const report = reconstructNativeGapReportFromEvidence(
      buildNativeTemporalEvidenceV1({
      phase: {
        calibrationPhaseId: 'p',
        phaseSequence: 2,
        effectivePollIntervalMs: 30_000,
        phaseStartedAt: T0,
        phaseEndedAt: T4,
        phaseProvenance: 'PHYSICAL_TRANSITION',
        canonicalT0At: T0,
        effectiveConfig: {
          calibrationSeriesId: 'series-1',
          calibrationPhaseId: 'p',
          phaseSequence: 2,
          vehicleId: 'v',
          tokenId: 1,
          effectivePollIntervalMs: 30_000,
          settlementDelayMs: 8000,
          recoveryOverlapMs: 6000,
          policyVersion: 'v2',
          policyMode: 'V2',
          effectiveAt: T0,
        },
      },
      counters: {
        calibrationPhaseId: 'p',
        allRequestCount: 1,
        nativeFastLoopRequestCount: 1,
        nativeFastLoopProviderSuccessCount: 1,
        nativeFastLoopProviderZeroResultCount: 0,
        nativeFastLoopProviderErrorCount: 0,
        nativeFastLoopProviderBucketCount: 3,
        nativeFastLoopNewBucketCount: 3,
        nativeFastLoopDuplicateBucketCount: 0,
        nativeFastLoopRevisionBucketCount: 0,
        transitionRequestCount: 0,
        transitionProviderBucketCount: 0,
        recoverySweepRequestCount: 0,
        recoveredLateBucketCount: 0,
        transitionWindowCount: 0,
        nativeUniqueTemporalBucketStarts: [T4, T0, T1],
        nativeMaxIntraResponseTemporalGapMs: null,
      },
      phaseEndedAtIso: T4,
      }),
      1,
    );
    expect(report.nativeBucketCount).toBe(3);
    expect(report.nativeGapsTotal).toBeGreaterThanOrEqual(1);
  });
});
