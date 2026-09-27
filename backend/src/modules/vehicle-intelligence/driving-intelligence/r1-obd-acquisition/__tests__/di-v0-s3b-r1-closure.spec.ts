import { CALIBRATION_UNSET_V0_BUNDLE, computeDiV0TripIntervals, DEFAULT_DI_V0_VERSION_TUPLE } from '../../core';
import { acquireDiV0HistoricalPositions, toDiV0S1PositionInput } from '../../position-acquisition/di-v0-position-acquisition';
import { resolveDiV0SourceFamily } from '../../position-acquisition/di-v0-position-source-family';
import { validateDiV0PositionAcquisitionRequest } from '../../position-acquisition/di-v0-position-window';
import {
  FULL_R1_002_GOLDEN,
  FULL_R1_002_PROVIDER_ROWS,
} from '../../position-acquisition/__tests__/fixtures/full-r1-002-golden.fixture';
import {
  buildRequest,
  expectAcquired,
  signalsBody,
  staticTransport,
} from '../../position-acquisition/__tests__/position-acquisition-test-helpers';
import { acquireDiV0HistoricalR1Obd, toDiV0S1R1ObdInput } from '../di-v0-r1-obd-acquisition';
import { DI_V0_R1_OBD_QUERY_SPEC_V0_2 } from '../di-v0-r1-obd-acquisition.versions';
import { normalizeDiV0R1ObdFromProviderRows } from '../di-v0-r1-obd-normalizer';
import { buildDiV0HistoricalR1ObdQuery } from '../di-v0-r1-obd-query';
import type { DiV0R1ObdAcquisitionResult } from '../di-v0-r1-obd-acquisition.types';
import { baseR1Request, RUPTELA_DEVICE_IDENTITY } from './fixtures/s3b-r1-fixtures';
import {
  FULL_R1_002_S3B_DEVICE_IDENTITY,
  FULL_R1_002_S3B_LABELS,
  FULL_R1_002_S3B_PROVENANCE,
  FULL_R1_002_S3B_STRUCTURAL_R1_ROWS,
} from './fixtures/full-r1-002-s3b-structural.fixture';

const ctx = { versions: DEFAULT_DI_V0_VERSION_TUPLE, calibration: CALIBRATION_UNSET_V0_BUNDLE };
const FROM = '2026-01-01T00:00:00Z';
const TO = '2026-01-01T00:00:03Z';
const L0 = '2026-01-01T00:00:00Z';

function normalize(rows: Record<string, unknown>[], from = FROM, to = TO): DiV0R1ObdAcquisitionResult {
  const request = validateDiV0PositionAcquisitionRequest(baseR1Request(from, to));
  const out = normalizeDiV0R1ObdFromProviderRows(request, resolveDiV0SourceFamily(RUPTELA_DEVICE_IDENTITY), rows);
  if (!out.ok) throw new Error(out.failure.message);
  return out.result;
}

function sig(result: DiV0R1ObdAcquisitionResult, bucket: number, signal: string) {
  return result.buckets[bucket].signals.find((s) => s.signal === signal)!;
}

describe('S3B closure — R1 fixture identity + query subset', () => {
  it('test fixture identity resolves to RUPTELA_R1 through the shared resolver', () => {
    expect(resolveDiV0SourceFamily(RUPTELA_DEVICE_IDENTITY).sourceFamily).toBe('RUPTELA_R1');
    expect(normalize([]).sourceFamily).toBe('RUPTELA_R1');
  });

  it('isIgnitionOn is not queried (AVG semantics not provider-schema verified)', () => {
    const request = validateDiV0PositionAcquisitionRequest(baseR1Request(FROM, TO));
    const query = buildDiV0HistoricalR1ObdQuery(7503, request.window);
    expect(query).not.toContain('isIgnitionOn');
    expect(DI_V0_R1_OBD_QUERY_SPEC_V0_2.signals.map((s) => s.id)).not.toContain('isIgnitionOn');
    expect(DI_V0_R1_OBD_QUERY_SPEC_V0_2.signals.every((s) => s.fieldAuthority === 'REPO_CONTRACT_ONLY')).toBe(true);
  });

  it('unqueried provider fields in a row are ignored', () => {
    const result = normalize([{ timestamp: L0, speed: 10, isIgnitionOn: 0 }]);
    expect(result.buckets[0].signals.map((s) => s.signal)).not.toContain('isIgnitionOn');
  });
});

describe('S3B closure — R1 duplicate buckets (no first-row-wins)', () => {
  it('identical duplicates collapse to one bucket value', () => {
    const r = normalize([
      { timestamp: L0, speed: 50, powertrainCombustionEngineSpeed: 2000 },
      { timestamp: L0, speed: 50, powertrainCombustionEngineSpeed: 2000 },
    ]);
    expect(sig(r, 0, 'speed')).toMatchObject({ availability: 'VALUE_PRESENT', value: 50 });
    expect(r.buckets[0].providerRowCount).toBe(2);
    expect(r.buckets[0].qualityFlags).toContain('DUPLICATE_BUCKET_IDENTICAL');
    expect(r.buckets[0].qualityFlags).not.toContain('DUPLICATE_BUCKET_CONFLICTING');
    expect(r.counters).toMatchObject({ duplicateBuckets: 1, conflictingDuplicateBuckets: 0, rowPresent: 1 });
    expect(r.observations[0].speedKmh).toBe(50);
  });

  it('conflicting duplicates withhold the signal and preserve distinct values (no averaging)', () => {
    const r = normalize([
      { timestamp: L0, speed: 60 },
      { timestamp: L0, speed: 50 },
    ]);
    const speed = sig(r, 0, 'speed');
    expect(speed.availability).toBe('CONFLICTING_DUPLICATE');
    expect(speed.value).toBeNull();
    expect(speed.conflictingValues).toEqual([50, 60]);
    expect(r.observations[0].speedKmh).toBeUndefined();
    expect(r.qualityFlags).toContain('DUPLICATE_BUCKET_CONFLICTING');
    expect(r.counters.speedValuePresent).toBe(0);
  });

  it('partial conflict: speed conflicting, rpm agreeing stays valid', () => {
    const r = normalize([
      { timestamp: L0, speed: 50, powertrainCombustionEngineSpeed: 2000 },
      { timestamp: L0, speed: 60, powertrainCombustionEngineSpeed: 2000 },
    ]);
    expect(sig(r, 0, 'speed').availability).toBe('CONFLICTING_DUPLICATE');
    expect(sig(r, 0, 'powertrainCombustionEngineSpeed')).toMatchObject({ availability: 'VALUE_PRESENT', value: 2000 });
    expect(r.observations[0].rpm).toBe(2000);
    expect(r.observations[0].speedKmh).toBeUndefined();
  });

  it('value vs null on the same label is a conflict, not a preference', () => {
    const r = normalize([
      { timestamp: L0, speed: 50 },
      { timestamp: L0, speed: null },
    ]);
    expect(sig(r, 0, 'speed')).toMatchObject({ availability: 'CONFLICTING_DUPLICATE', conflictingValues: [null, 50] });
  });

  it('three-row bucket: two agree, one disagrees → still conflicting (no majority vote)', () => {
    const r = normalize([
      { timestamp: L0, speed: 50 },
      { timestamp: L0, speed: 50 },
      { timestamp: L0, speed: 70 },
    ]);
    expect(r.buckets[0].providerRowCount).toBe(3);
    expect(sig(r, 0, 'speed')).toMatchObject({ availability: 'CONFLICTING_DUPLICATE', conflictingValues: [50, 70] });
  });

  it('out-of-order duplicates are order-independent (same buckets and snapshot)', () => {
    const rows = [
      { timestamp: '2026-01-01T00:00:01Z', speed: 20 },
      { timestamp: L0, speed: 70 },
      { timestamp: '2026-01-01T00:00:02Z', speed: 30 },
      { timestamp: L0, speed: 50 },
      { timestamp: L0, speed: 50 },
    ];
    const a = normalize(rows);
    const b = normalize([...rows].reverse());
    expect(a.snapshotIdentity.digest).toBe(b.snapshotIdentity.digest);
    expect(a.buckets).toEqual(b.buckets);
  });

  it('conflict provenance is part of the snapshot identity', () => {
    const a = normalize([
      { timestamp: L0, speed: 50 },
      { timestamp: L0, speed: 60 },
    ]);
    const b = normalize([
      { timestamp: L0, speed: 50 },
      { timestamp: L0, speed: 61 },
    ]);
    const single = normalize([{ timestamp: L0, speed: 50 }]);
    const identical = normalize([
      { timestamp: L0, speed: 50 },
      { timestamp: L0, speed: 50 },
    ]);
    expect(a.snapshotIdentity.digest).not.toBe(b.snapshotIdentity.digest);
    expect(single.snapshotIdentity.digest).not.toBe(identical.snapshotIdentity.digest);
  });
});

async function goldenS1(withR1: boolean) {
  const g = FULL_R1_002_GOLDEN;
  const requestInput = buildRequest(g.fromUtc, g.toUtc, {
    organizationId: g.organizationId,
    vehicleId: g.vehicleId,
    tripId: g.tripId,
    dimoTokenId: g.dimoTokenId,
    dimoDeviceIdentity: FULL_R1_002_S3B_DEVICE_IDENTITY,
  });
  const position = expectAcquired(
    await acquireDiV0HistoricalPositions(requestInput, staticTransport(signalsBody([...FULL_R1_002_PROVIDER_ROWS])), {}),
  );
  let r1Result: DiV0R1ObdAcquisitionResult | null = null;
  if (withR1) {
    const r1 = await acquireDiV0HistoricalR1Obd(
      requestInput,
      { executeHistoricalR1ObdQuery: async () => ({ data: { signals: [...FULL_R1_002_S3B_STRUCTURAL_R1_ROWS] } }) },
      {},
    );
    if (r1.status !== 'ACQUIRED') throw new Error('R1 acquisition failed');
    r1Result = r1.result;
  }
  const out = computeDiV0TripIntervals(
    { ...toDiV0S1PositionInput(position), ...(r1Result ? { r1Obd: toDiV0S1R1ObdInput(r1Result) } : {}) },
    ctx,
  );
  return { out, r1Result };
}

function at(out: Awaited<ReturnType<typeof goldenS1>>['out'], label: string) {
  const row = out.intervals.find((i) => i.intervalStart === label);
  if (!row) throw new Error(`no interval at ${label}`);
  return row;
}

describe('S3B closure — FULL-R1-002 golden binding: R1 never creates or overrides L3', () => {
  it('fixture is bound to the committed golden and declares structural R1 provenance', async () => {
    expect(FULL_R1_002_S3B_PROVENANCE.goldenExperimentId).toBe('C1-MOBILE-FULL-R1-002');
    expect(FULL_R1_002_S3B_PROVENANCE.r1RowProvenance).toBe('STRUCTURAL_DERIVED');
    const { r1Result } = await goldenS1(true);
    expect(r1Result!.sourceFamily).toBe('RUPTELA_R1');
    expect(r1Result!.window.fromUtc).toBe(FULL_R1_002_GOLDEN.fromUtc);
    expect(r1Result!.counters.requestedBuckets).toBe(FULL_R1_002_GOLDEN.expectedBucketCount);
    expect(r1Result!.qualityFlags).toContain('SPARSE_SIGNAL');
  });

  it('ROW_ABSENT gap + R1 80 km/h → numeric speed stays null (no gap fill)', async () => {
    const { out } = await goldenS1(true);
    expect(at(out, FULL_R1_002_S3B_LABELS.insideGap).estimatedSpeedKmh).toBeNull();
    expect(at(out, FULL_R1_002_S3B_LABELS.gapEdge).estimatedSpeedKmh).toBeNull();
  });

  it('HOLD + R1 45 km/h → frozen intervals keep null speed and unchanged claim', async () => {
    const base = await goldenS1(false);
    const withR1 = await goldenS1(true);
    for (const label of FULL_R1_002_S3B_LABELS.hold) {
      const a = at(base.out, label);
      const b = at(withR1.out, label);
      expect(b.estimatedSpeedKmh).toBe(a.estimatedSpeedKmh);
      expect(b.positionState).toBe(a.positionState);
      expect(b.claimLevel).toBe(a.claimLevel);
      expect(b.positionState.startsWith('FROZEN')).toBe(true);
      expect(b.estimatedSpeedKmh).toBeNull();
    }
  });

  it('RELEASE + R1 30 km/h → no release-derived numeric speed', async () => {
    const base = await goldenS1(false);
    const withR1 = await goldenS1(true);
    const a = at(base.out, FULL_R1_002_S3B_LABELS.release);
    const b = at(withR1.out, FULL_R1_002_S3B_LABELS.release);
    expect(b.estimatedSpeedKmh).toBe(a.estimatedSpeedKmh);
    expect(b.claimLevel).toBe(a.claimLevel);
    expect(b.positionState).toBe('RELEASE');
    expect(b.estimatedSpeedKmh).toBeNull();
  });

  it('post-release incomplete support + R1 35 km/h → still null', async () => {
    const { out } = await goldenS1(true);
    const row = at(out, FULL_R1_002_S3B_LABELS.postReleaseIncomplete);
    expect(row.positionState).toBe('FRESH');
    expect(row.estimatedSpeedKmh).toBeNull();
    expect(row.claimLevel).not.toBe('L3');
  });

  it('valid L3 + conflicting R1 140 km/h → L3 numeric speed unchanged', async () => {
    const base = await goldenS1(false);
    const withR1 = await goldenS1(true);
    const a = at(base.out, FULL_R1_002_S3B_LABELS.validL3);
    const b = at(withR1.out, FULL_R1_002_S3B_LABELS.validL3);
    expect(typeof a.estimatedSpeedKmh).toBe('number');
    expect(b.estimatedSpeedKmh).toBe(a.estimatedSpeedKmh);
    expect(b.estimatedSpeedKmh).not.toBe(140);
    expect(b.sourceQualityFlags).toContain('R1_INTERVAL_ONLY');
  });

  it('every golden interval: R1 never changes numeric speed', async () => {
    const base = await goldenS1(false);
    const withR1 = await goldenS1(true);
    expect(withR1.out.intervals.map((i) => i.estimatedSpeedKmh)).toEqual(
      base.out.intervals.map((i) => i.estimatedSpeedKmh),
    );
  });
});
