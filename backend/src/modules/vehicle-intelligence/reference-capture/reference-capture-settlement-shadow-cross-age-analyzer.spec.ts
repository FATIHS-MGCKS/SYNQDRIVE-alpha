import {
  analyzeGlobalCrossAge,
  analyzeProbeCrossAge,
} from './reference-capture-settlement-shadow-cross-age-analyzer';
import { compareBucketSets } from './reference-capture-settlement-shadow-response.parser';

describe('reference-capture-settlement-shadow-cross-age-analyzer', () => {
  it('reports bucket stable from first success when identities unchanged', () => {
    const report = analyzeProbeCrossAge([
      {
        probeId: 'SP-60-A',
        probeType: 'FIXED_INTERVAL',
        phase: '60s',
        scheduledAgeMs: 30_000,
        providerRequestStatus: 'SUCCESS',
        rawRowCount: 10,
        uniqueBucketIdentities: ['a|t1', 'a|t2'],
        bucketValueSnapshots: { 'a|t1': '1', 'a|t2': '2' },
      },
      {
        probeId: 'SP-60-A',
        probeType: 'FIXED_INTERVAL',
        phase: '60s',
        scheduledAgeMs: 60_000,
        providerRequestStatus: 'SUCCESS',
        rawRowCount: 10,
        uniqueBucketIdentities: ['a|t1', 'a|t2'],
        bucketValueSnapshots: { 'a|t1': '1', 'a|t2': '2' },
      },
    ]);
    expect(report.firstSuccessfulQueryAgeMs).toBe(30_000);
    expect(report.lateBucketCount).toBe(0);
    expect(report.revisedValueCount).toBe(0);
    expect(report.bucketClassifications).toContain('BUCKET_STABLE_FROM_FIRST_SEEN');
    expect(report.bucketClassifications).toContain('VALUE_STABLE_FROM_FIRST_SEEN');
  });

  it('detects VALUE_REVISED at later age', () => {
    const report = analyzeProbeCrossAge([
      {
        probeId: 'SP-30-A',
        probeType: 'FIXED_INTERVAL',
        phase: '30s',
        scheduledAgeMs: 30_000,
        providerRequestStatus: 'SUCCESS',
        rawRowCount: 5,
        uniqueBucketIdentities: ['speed|t'],
        bucketValueSnapshots: { 'speed|t': '40' },
      },
      {
        probeId: 'SP-30-A',
        probeType: 'FIXED_INTERVAL',
        phase: '30s',
        scheduledAgeMs: 60_000,
        providerRequestStatus: 'SUCCESS',
        rawRowCount: 5,
        uniqueBucketIdentities: ['speed|t'],
        bucketValueSnapshots: { 'speed|t': '41' },
      },
    ]);
    expect(report.revisedValueCount).toBe(1);
    expect(report.lastValueRevisionAgeMs).toBe(60_000);
    expect(report.bucketClassifications).toContain('VALUE_REVISED');
  });

  it('detects BUCKET_ADDED_LATE at +60 after partial +30 success', () => {
    const report = analyzeProbeCrossAge([
      {
        probeId: 'SP-20-A',
        probeType: 'FIXED_INTERVAL',
        phase: '20s',
        scheduledAgeMs: 30_000,
        providerRequestStatus: 'SUCCESS',
        rawRowCount: 5,
        uniqueBucketIdentities: ['speed|t1'],
        bucketValueSnapshots: { 'speed|t1': '10' },
      },
      {
        probeId: 'SP-20-A',
        probeType: 'FIXED_INTERVAL',
        phase: '20s',
        scheduledAgeMs: 60_000,
        providerRequestStatus: 'SUCCESS',
        rawRowCount: 8,
        uniqueBucketIdentities: ['speed|t1', 'speed|t2'],
        bucketValueSnapshots: { 'speed|t1': '10', 'speed|t2': '11' },
      },
    ]);
    expect(report.firstSuccessfulQueryAgeMs).toBe(30_000);
    expect(report.lateBucketCount).toBe(1);
    expect(report.bucketClassifications).toContain('BUCKET_ADDED_LATE');
  });

  it('distinguishes zero-result at +30 then first success at +60', () => {
    const report = analyzeProbeCrossAge([
      {
        probeId: 'SP-20-A',
        probeType: 'FIXED_INTERVAL',
        phase: '20s',
        scheduledAgeMs: 30_000,
        providerRequestStatus: 'ZERO_RESULT',
        rawRowCount: 0,
        uniqueBucketIdentities: [],
      },
      {
        probeId: 'SP-20-A',
        probeType: 'FIXED_INTERVAL',
        phase: '20s',
        scheduledAgeMs: 60_000,
        providerRequestStatus: 'SUCCESS',
        rawRowCount: 8,
        uniqueBucketIdentities: ['speed|t1'],
        bucketValueSnapshots: { 'speed|t1': '10' },
      },
    ]);
    expect(report.firstSuccessfulQueryAgeMs).toBe(60_000);
    expect(report.lateBucketCount).toBe(0);
    expect(report.zeroResultAgesMs).toEqual([30_000]);
  });

  it('metadata-only response difference must NOT become VALUE_REVISED', () => {
    const priorSnapshots = { 'speed|2026-09-10T12:00:00.000Z': '55' };
    const currentSnapshots = { 'speed|2026-09-10T12:00:00.000Z': '55' };
    const cmp = compareBucketSets(['speed|2026-09-10T12:00:00.000Z'], ['speed|2026-09-10T12:00:00.000Z'], {
      currentSnapshots,
      priorSnapshots,
    });
    expect(cmp.revisionCount).toBe(0);
    expect(cmp.valueRevisedBucketIdentities).toEqual([]);
  });

  it('analyzeGlobalCrossAge returns UNKNOWN when no probes', () => {
    const global = analyzeGlobalCrossAge([]);
    expect(global.allProbesBucketStableBy30).toBe('UNKNOWN');
    expect(global.allProbesValueStableBy30).toBe('UNKNOWN');
  });
});
