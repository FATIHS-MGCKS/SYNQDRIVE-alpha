import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  aggregateBucketKey,
  canonicalizeBucketTimestamp,
  classifyBucketClosureAtOriginalResponse,
  classifyWatermarkExclusion,
  compareAggregateBucketMaps,
  type AggregateBucketObservation,
} from './reference-capture-hf-aggregate-bucket-analysis';
import {
  B3_108_VS_66_RESULT,
  B3_BROAD_REQUERY_SAMPLE_LOSS_PROOF_VALID,
  buildExactWindowReplayAnalysis,
  buildOriginalHfWindowId,
  compareExactWindowSpeedBuckets,
  crossOriginBucketIdentitiesEquivalent,
  CROSS_ORIGIN_BUCKET_IDENTITY_COMPARISON_VALID,
  classifyHfCaptureRootCause,
  DIMO_BUCKET_SEMANTICS,
  QUERY_FROM_ANCHORED_BUCKET_EXAMPLE,
  reconstructOriginalHfQueryWindows,
} from './reference-capture-rd004-b-hf-exact-window-replay';
import {
  buildHfCaptureCompletenessDiagnostic,
  compareHfSpeedTimestampSets,
} from './reference-capture-rd004-b-hf-capture-completeness';
import { HF_QUERY_OVERLAP_MS } from './reference-capture-hf-watermark-policy';

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const SOURCE_OBS = path.join(
  REPO_ROOT,
  'docs/audits/data/rd004-segment-a/source-observations.jsonl',
);
const SOURCE_MANIFEST = path.join(
  REPO_ROOT,
  'docs/audits/data/rd004-segment-a/source-manifest.json',
);
const hasSourceData = fs.existsSync(SOURCE_OBS);

function bucketMap(entries: Array<{ ts: string; value: number }>): Map<string, AggregateBucketObservation> {
  const out = new Map<string, AggregateBucketObservation>();
  for (const e of entries) {
    const bucketTimestamp = canonicalizeBucketTimestamp(e.ts);
    out.set(aggregateBucketKey('speed', bucketTimestamp), {
      providerField: 'speed',
      bucketTimestamp,
      avgValue: e.value,
    });
  }
  return out;
}

describe('DI-EV-0035B.4 RD004-B exact-window HF replay + late-arrival methodology', () => {
  it('1) buckets from different query origins are not identical merely by flooring timestamps', () => {
    const { originA, originB } = QUERY_FROM_ANCHORED_BUCKET_EXAMPLE;
    expect(
      crossOriginBucketIdentitiesEquivalent(
        originA.hfWindowFrom,
        originA.exampleBucketTimestamp,
        originB.hfWindowFrom,
        originB.exampleBucketTimestamp,
      ),
    ).toBe(false);
    expect(originA.exampleBucketTimestamp).not.toBe(originB.exampleBucketTimestamp);
  });

  it('2) CROSS_ORIGIN_BUCKET_IDENTITY_COMPARISON_VALID = NO', () => {
    expect(CROSS_ORIGIN_BUCKET_IDENTITY_COMPARISON_VALID).toBe('NO');
    expect(DIMO_BUCKET_SEMANTICS).toBe('QUERY_FROM_ANCHORED');
  });

  it('3) B.3 broad 108-vs-66 comparison cannot by itself classify capture loss', () => {
    const cmp = compareHfSpeedTimestampSets(
      Array.from({ length: 66 }, (_, i) => `2026-09-04T03:47:${String(i).padStart(2, '0')}.000Z`),
      Array.from({ length: 108 }, (_, i) => `2026-09-04T03:46:${String(i).padStart(2, '0')}.000Z`),
    );
    expect(cmp.B3_BROAD_REQUERY_SAMPLE_LOSS_PROOF_VALID).toBe('NO');
    expect(cmp.B3_108_VS_66_RESULT).toBe('DENSITY_DIAGNOSTIC_ONLY_NOT_BUCKET_IDENTITY_PROOF');
    const classification = buildHfCaptureCompletenessDiagnostic({
      allRows: [],
      envelopeRows: [],
      queryEnvelope: { startUtc: '2026-09-04T03:46:00.000Z', endUtc: '2026-09-04T04:05:00.000Z' },
      requeryTimestamps: Array.from({ length: 108 }, (_, i) => `2026-09-04T03:46:${String(i).padStart(2, '0')}.000Z`),
    });
    expect(classification.HF_SPARSE_CADENCE_ORIGIN).toBe('NOT_DETERMINABLE');
    expect(classification.HF_CAPTURE_ROOT_CAUSE).toBe('QUERY_ORIGIN_MISMATCH');
    expect(B3_BROAD_REQUERY_SAMPLE_LOSS_PROOF_VALID).toBe('NO');
    expect(B3_108_VS_66_RESULT).toBe('DENSITY_DIAGNOSTIC_ONLY_NOT_BUCKET_IDENTITY_PROOF');
  });

  it('4) exact replay must reuse original from', () => {
    const hfWindowFrom = '2026-09-04T03:47:50.768Z';
    const hfWindowTo = '2026-09-04T03:47:58.691Z';
    const requestStartedAt = '2026-09-04T03:47:58.691Z';
    const windowId = buildOriginalHfWindowId(hfWindowFrom, hfWindowTo, requestStartedAt);
    expect(windowId.startsWith(hfWindowFrom)).toBe(true);
    const analysis = buildExactWindowReplayAnalysis({
      windows: [
        {
          windowId,
          hfWindowFrom,
          hfWindowTo,
          hfActualQueryTo: hfWindowTo,
          requestStartedAt,
          requestCompletedAt: '2026-09-04T03:47:59.000Z',
          requestedInterval: '1s',
          requestedAggregation: 'AVG',
          providerFieldsObserved: ['speed'],
          hasSpeedBucket: true,
          captureCycleId: null,
          requestCorrelationId: null,
        },
      ],
      originalBucketsByWindow: new Map([[windowId, bucketMap([{ ts: '2026-09-04T03:47:51.768Z', value: 10 }])]]),
      replayBucketsByWindow: new Map([[windowId, bucketMap([{ ts: '2026-09-04T03:47:51.768Z', value: 10 }])]]),
      replayAttempted: true,
      replaySucceeded: true,
    });
    expect(analysis.ORIGINAL_HF_QUERY_WINDOWS[0]!.hfWindowFrom).toBe(hfWindowFrom);
  });

  it('5) exact replay must reuse original to / hfActualQueryTo', () => {
    const hfWindowFrom = '2026-09-04T03:47:50.768Z';
    const hfWindowTo = '2026-09-04T03:47:58.691Z';
    const hfActualQueryTo = '2026-09-04T03:47:59.500Z';
    const requestStartedAt = '2026-09-04T03:47:58.691Z';
    const windowId = buildOriginalHfWindowId(hfWindowFrom, hfWindowTo, requestStartedAt);
    const analysis = buildExactWindowReplayAnalysis({
      windows: [
        {
          windowId,
          hfWindowFrom,
          hfWindowTo,
          hfActualQueryTo,
          requestStartedAt,
          requestCompletedAt: '2026-09-04T03:47:59.600Z',
          requestedInterval: '1s',
          requestedAggregation: 'AVG',
          providerFieldsObserved: ['speed'],
          hasSpeedBucket: true,
          captureCycleId: null,
          requestCorrelationId: null,
        },
      ],
      originalBucketsByWindow: new Map(),
      replayBucketsByWindow: new Map(),
      replayAttempted: true,
      replaySucceeded: true,
    });
    expect(analysis.ORIGINAL_HF_QUERY_WINDOWS[0]!.hfActualQueryTo).toBe(hfActualQueryTo);
  });

  it('6) same-origin same-timestamp buckets are comparable', () => {
    const original = bucketMap([{ ts: '2026-09-04T03:47:51.768Z', value: 12 }]);
    const replay = bucketMap([{ ts: '2026-09-04T03:47:51.768Z', value: 12 }]);
    const cmp = compareExactWindowSpeedBuckets(original, replay);
    expect(cmp.exactIntersectionCount).toBe(1);
    expect(cmp.unchangedBucketCount).toBe(1);
    expect(cmp.changedValueBucketCount).toBe(0);
    expect(crossOriginBucketIdentitiesEquivalent(
      '2026-09-04T03:47:50.768Z',
      '2026-09-04T03:47:51.768Z',
      '2026-09-04T03:47:50.768Z',
      '2026-09-04T03:47:51.768Z',
    )).toBe(true);
  });

  it('7) changed aggregate value is distinct from newly appearing bucket', () => {
    const original = bucketMap([{ ts: '2026-09-04T03:47:51.768Z', value: 12 }]);
    const replay = bucketMap([
      { ts: '2026-09-04T03:47:51.768Z', value: 15 },
      { ts: '2026-09-04T03:47:52.768Z', value: 20 },
    ]);
    const mapCmp = compareAggregateBucketMaps(original, replay);
    expect(mapCmp.changedValueBucketObservations).toBe(1);
    expect(mapCmp.newBucketObservations).toBe(1);
    const cmp = compareExactWindowSpeedBuckets(original, replay);
    expect(cmp.changedValueBucketCount).toBe(1);
    expect(cmp.newReplayBucketCount).toBe(1);
    expect(cmp.newReplayBucketTimestamps).toEqual(['2026-09-04T03:47:52.768Z']);
  });

  it('8) late-arriving bucket classification uses original request completion time', () => {
    const closure = classifyBucketClosureAtOriginalResponse({
      bucketTimestamp: '2026-09-04T03:47:51.768Z',
      requestCompletedAt: '2026-09-04T03:47:53.000Z',
    });
    expect(closure.bucketClosureAtOriginalResponse).toBe('CLOSED');
    const openClosure = classifyBucketClosureAtOriginalResponse({
      bucketTimestamp: '2026-09-04T03:47:52.768Z',
      requestCompletedAt: '2026-09-04T03:47:52.500Z',
    });
    expect(openClosure.bucketClosureAtOriginalResponse).toBe('OPEN');
  });

  it('9) next-window exclusion classification is based on the real next query FROM', () => {
    expect(
      classifyWatermarkExclusion({
        bucketTimestamp: '2026-09-04T03:47:51.768Z',
        nextWindowFrom: '2026-09-04T03:47:54.000Z',
      }),
    ).toBe('DEFINITELY_EXCLUDED_BY_NEXT_WATERMARK');
    expect(
      classifyWatermarkExclusion({
        bucketTimestamp: '2026-09-04T03:47:55.000Z',
        nextWindowFrom: '2026-09-04T03:47:54.000Z',
      }),
    ).toBe('POTENTIALLY_REQUERYABLE');
  });

  it('10) late provider bucket definitely excluded by future windows → watermark recovery gap', () => {
    const rootCause = classifyHfCaptureRootCause({
      exactReplayAttempted: true,
      exactReplaySucceeded: true,
      aggregateNewReplayBuckets: 3,
      aggregateChangedValueBuckets: 0,
      definitelyExcludedLateBuckets: 2,
      closedLateArrivalCount: 2,
    });
    expect(rootCause).toBe('PROVIDER_LATE_ARRIVAL_PLUS_CAPTURE_WATERMARK_RECOVERY_GAP');
    expect(HF_QUERY_OVERLAP_MS).toBe(2000);
  });

  it('11) provider late arrival is not mislabeled internal persistence loss', () => {
    const rootCause = classifyHfCaptureRootCause({
      exactReplayAttempted: true,
      exactReplaySucceeded: true,
      aggregateNewReplayBuckets: 5,
      aggregateChangedValueBuckets: 0,
      definitelyExcludedLateBuckets: 0,
      closedLateArrivalCount: 3,
    });
    expect(rootCause).toBe('PROVIDER_LATE_ARRIVAL');
    expect(rootCause).not.toBe('INTERNAL_PERSISTENCE_LOSS');
  });

  it('12) sealed source SHA remains unchanged', () => {
    if (!hasSourceData || !fs.existsSync(SOURCE_MANIFEST)) return;
    const manifest = JSON.parse(fs.readFileSync(SOURCE_MANIFEST, 'utf8'));
    const obsSha = crypto.createHash('sha256').update(fs.readFileSync(SOURCE_OBS)).digest('hex');
    expect(manifest.files['source-observations.jsonl'].sha256).toBe(obsSha);
  });

  it('13) reconstructs original HF query windows from full-session HF_HISTORICAL rows', () => {
    if (!hasSourceData) return;
    const { loadRd004Jsonl } = require('./reference-capture-rd004-a-segment-a') as {
      loadRd004Jsonl: (content: string) => unknown[];
    };
    const rows = loadRd004Jsonl(fs.readFileSync(SOURCE_OBS, 'utf8'));
    const { ORIGINAL_HF_QUERY_WINDOWS, ORIGINAL_ZERO_RESULT_WINDOWS_RECONSTRUCTIBLE } =
      reconstructOriginalHfQueryWindows(rows as never);
    expect(ORIGINAL_HF_QUERY_WINDOWS.length).toBeGreaterThan(0);
    expect(ORIGINAL_ZERO_RESULT_WINDOWS_RECONSTRUCTIBLE).toBe('NO');
    for (const w of ORIGINAL_HF_QUERY_WINDOWS) {
      expect(w.hfWindowFrom).toMatch(/Z$/);
      expect(w.requestedInterval).toBe('1s');
    }
  });
});
