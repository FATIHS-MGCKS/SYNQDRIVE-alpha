import { readFileSync } from 'fs';
import { join } from 'path';
import {
  classifyWatermarkExclusion,
  countDefinitelyExcludedUniqueBucketTimestamps,
  type HfLateArrivalDifferentialRow,
} from './reference-capture-hf-aggregate-bucket-analysis';
import {
  advanceHfWatermarksAfterPersistedBuckets,
  computeHfQueryFrom,
  computeHfQueryTo,
  HF_QUERY_OVERLAP_MS,
  normalizeHfCommittedWatermarkState,
  shouldAdvanceHfWatermark,
} from './reference-capture-hf-watermark-policy';
import {
  buildAggregateBucketFingerprint,
  buildLegacyValueInclusiveFingerprint,
  buildPhysicalSampleFingerprint,
} from './reference-capture-physical-sample-identity.util';

const RD001_DIFFERENTIAL_PATH = join(
  __dirname,
  '../../../../../docs/audits/data/dimo-lte-r1-reference-drive-001-hf-late-arrival-differential.json',
);

describe('reference-capture-hf-watermark-policy', () => {
  const sessionStart = new Date('2026-09-01T19:00:43.252Z');
  const fields = ['speed', 'obdEngineLoad'];

  describe('A — repeated historical bucket across cycles', () => {
    it('produces one aggregate bucket identity for same field+timestamp', () => {
      const fp1 = buildPhysicalSampleFingerprint({
        providerField: 'speed',
        providerTimestamp: '2026-09-01T10:00:02.000Z',
        normalizedValue: 11,
      });
      const fp2 = buildPhysicalSampleFingerprint({
        providerField: 'speed',
        providerTimestamp: '2026-09-01T10:00:02.000Z',
        normalizedValue: 11,
      });
      expect(fp1).toBe(fp2);
    });
  });

  describe('B — adjacent distinct buckets', () => {
    it('assigns different identities for adjacent 1s buckets', () => {
      const a = buildAggregateBucketFingerprint({
        providerField: 'speed',
        providerTimestamp: '2026-09-01T10:00:02.000Z',
      });
      const b = buildAggregateBucketFingerprint({
        providerField: 'speed',
        providerTimestamp: '2026-09-01T10:00:03.000Z',
      });
      expect(a).not.toBe(b);
    });
  });

  describe('C — late bucket inside overlap window', () => {
    it('includes bucket start at or after committed-2s in query FROM', () => {
      const state = normalizeHfCommittedWatermarkState({
        hfWatermarkAt: '2026-09-01T19:12:27.500Z',
        hfWatermarkByField: { speed: '2026-09-01T19:12:27.500Z' },
      });
      const from = computeHfQueryFrom(state, sessionStart, ['speed']);
      expect(from.toISOString()).toBe('2026-09-01T19:12:25.500Z');
      const classification = classifyWatermarkExclusion({
        bucketTimestamp: '2026-09-01T19:12:26.000Z',
        nextWindowFrom: from.toISOString(),
      });
      expect(classification).toBe('POTENTIALLY_REQUERYABLE');
    });
  });

  describe('D — per-field cadence divergence', () => {
    it('uses min(per-field committed) - overlap so slow field is not suppressed', () => {
      const state = normalizeHfCommittedWatermarkState({
        hfWatermarkAt: '2026-09-01T19:12:30.000Z',
        hfWatermarkByField: {
          speed: '2026-09-01T19:12:30.000Z',
          obdEngineLoad: '2026-09-01T19:12:20.000Z',
        },
      });
      const from = computeHfQueryFrom(state, sessionStart, fields);
      expect(from.toISOString()).toBe('2026-09-01T19:12:18.000Z');
    });
  });

  describe('E — out-of-order provider response', () => {
    it('advances per-field watermark to max persisted bucket regardless of arrival order', () => {
      const state = normalizeHfCommittedWatermarkState({ hfWatermarkAt: null, hfWatermarkByField: {} });
      const advanced = advanceHfWatermarksAfterPersistedBuckets(state, [
        { providerField: 'speed', providerTimestamp: '2026-09-01T10:00:04.000Z' },
        { providerField: 'speed', providerTimestamp: '2026-09-01T10:00:01.000Z' },
        { providerField: 'speed', providerTimestamp: '2026-09-01T10:00:03.000Z' },
      ]);
      expect(advanced.hfWatermarkByField.speed).toBe('2026-09-01T10:00:04.000Z');
    });
  });

  describe('F — persistence failure must not advance watermark', () => {
    it('does not advance when zero buckets were durably persisted', () => {
      expect(shouldAdvanceHfWatermark(0)).toBe(false);
      const state = normalizeHfCommittedWatermarkState({
        hfWatermarkAt: '2026-09-01T19:12:27.500Z',
        hfWatermarkByField: { speed: '2026-09-01T19:12:27.500Z' },
      });
      const unchanged = advanceHfWatermarksAfterPersistedBuckets(state, []);
      expect(unchanged).toEqual(state);
    });
  });

  describe('G — retry after persistence failure', () => {
    it('re-persists same bucket identity once watermark unchanged', () => {
      const bucket = {
        providerField: 'speed',
        providerTimestamp: '2026-09-01T10:00:02.000Z',
      };
      const fp = buildPhysicalSampleFingerprint({
        providerField: bucket.providerField,
        providerTimestamp: bucket.providerTimestamp,
        normalizedValue: 42,
      });
      const seen = new Set<string>();
      expect(seen.has(fp)).toBe(false);
      seen.add(fp);
      expect(seen.has(fp)).toBe(true);
      const stateBefore = normalizeHfCommittedWatermarkState({ hfWatermarkAt: null, hfWatermarkByField: {} });
      expect(shouldAdvanceHfWatermark(0)).toBe(false);
      const stateAfterRetry = advanceHfWatermarksAfterPersistedBuckets(stateBefore, [bucket]);
      expect(stateAfterRetry.hfWatermarkByField.speed).toBe('2026-09-01T10:00:02.000Z');
    });
  });

  describe('H — identical query payload idempotency', () => {
    it('returns stable fingerprints for canonical timestamp forms', () => {
      const a = buildPhysicalSampleFingerprint({
        providerField: 'speed',
        providerTimestamp: '2026-09-01T19:12:25.500Z',
        normalizedValue: 10,
      });
      const b = buildPhysicalSampleFingerprint({
        providerField: 'speed',
        providerTimestamp: '2026-09-01T19:12:25.5Z',
        normalizedValue: 10,
      });
      expect(a).toBe(b);
    });
  });

  describe('I — multi-surface overlap policy', () => {
    it('keeps HF identity independent of acquisition surface (global physical identity)', () => {
      const hf = buildPhysicalSampleFingerprint({
        providerField: 'speed',
        providerTimestamp: '2026-09-01T10:00:01.000Z',
        normalizedValue: 55,
      });
      const live = buildPhysicalSampleFingerprint({
        providerField: 'speed',
        providerTimestamp: '2026-09-01T10:00:01.000Z',
        normalizedValue: 55,
      });
      expect(hf).toBe(live);
    });
  });

  describe('J — corrected provider value policy (IMMUTABLE_FIRST_SEEN)', () => {
    it('collapses same bucket with different values to one identity', () => {
      const first = buildPhysicalSampleFingerprint({
        providerField: 'speed',
        providerTimestamp: '2026-09-01T10:00:02.000Z',
        normalizedValue: 10,
      });
      const revised = buildPhysicalSampleFingerprint({
        providerField: 'speed',
        providerTimestamp: '2026-09-01T10:00:02.000Z',
        normalizedValue: 11,
      });
      expect(first).toBe(revised);
      const legacyFirst = buildLegacyValueInclusiveFingerprint({
        providerField: 'speed',
        providerTimestamp: '2026-09-01T10:00:02.000Z',
        normalizedValue: 10,
      });
      const legacyRevised = buildLegacyValueInclusiveFingerprint({
        providerField: 'speed',
        providerTimestamp: '2026-09-01T10:00:02.000Z',
        normalizedValue: 11,
      });
      expect(legacyFirst).not.toBe(legacyRevised);
    });
  });

  describe('K — watermark commit ordering', () => {
    it('advances only when shouldAdvanceHfWatermark passes after simulated flush', () => {
      const state = normalizeHfCommittedWatermarkState({ hfWatermarkAt: null, hfWatermarkByField: {} });
      const buckets = [{ providerField: 'speed', providerTimestamp: '2026-09-01T10:00:01.000Z' }];
      const flushedCount = buckets.length;
      const next =
        shouldAdvanceHfWatermark(flushedCount) ?
          advanceHfWatermarksAfterPersistedBuckets(state, buckets)
        : state;
      expect(next.hfWatermarkByField.speed).toBe('2026-09-01T10:00:01.000Z');
    });
  });

  describe('L — RD001 deterministic regression fixture', () => {
    const fixture = JSON.parse(readFileSync(RD001_DIFFERENTIAL_PATH, 'utf8')) as {
      differentialRowCount: number;
      rows: HfLateArrivalDifferentialRow[];
    };

    it('loads 122 late-arrival differential rows from sealed artifact', () => {
      expect(fixture.differentialRowCount).toBe(122);
      expect(fixture.rows).toHaveLength(122);
    });

    it('classifies 39 DEFINITELY_EXCLUDED under legacy wall-clock next window', () => {
      const excluded = fixture.rows.filter(
        (r) => r.watermarkClassification === 'DEFINITELY_EXCLUDED_BY_NEXT_WATERMARK',
      );
      expect(excluded).toHaveLength(39);
      expect(countDefinitelyExcludedUniqueBucketTimestamps(excluded)).toBe(8);
    });

    it('would requery all 39 previously excluded buckets under per-field provider watermark + overlap', () => {
      for (const row of fixture.rows) {
        if (row.watermarkClassification !== 'DEFINITELY_EXCLUDED_BY_NEXT_WATERMARK') continue;
        const state = normalizeHfCommittedWatermarkState({
          hfWatermarkAt: row.originalHfWindowFrom,
          hfWatermarkByField: {
            [row.providerField]: row.originalHfWindowFrom,
          },
        });
        const from = computeHfQueryFrom(state, sessionStart, [row.providerField], HF_QUERY_OVERLAP_MS);
        const bucketStartMs = Date.parse(row.bucketStart);
        expect(from.getTime()).toBeLessThanOrEqual(bucketStartMs);
      }
    });

    it('documents legacy wall-clock watermark exclusion causality for RD001', () => {
      const legacyExcluded = fixture.rows.filter(
        (r) => r.watermarkClassification === 'DEFINITELY_EXCLUDED_BY_NEXT_WATERMARK',
      );
      for (const row of legacyExcluded) {
        expect(row.nextKnownHfWindowFrom).not.toBeNull();
        const bucketEndMs = Date.parse(row.bucketStart) + 1000;
        const nextFromMs = Date.parse(row.nextKnownHfWindowFrom!);
        expect(bucketEndMs).toBeLessThanOrEqual(nextFromMs);
      }
    });
  });

  describe('query TO boundary', () => {
    it('prefers requestCompletedAt over fallback', () => {
      const completed = new Date('2026-09-01T19:12:27.741Z');
      const fallback = new Date('2026-09-01T19:12:27.500Z');
      expect(computeHfQueryTo(completed, fallback)).toEqual(completed);
    });
  });
});
