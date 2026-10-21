import { acquireDiV0HistoricalPositions } from '../di-v0-position-acquisition';
import {
  FULL_R1_002_DEVICE_IDENTITY,
  FULL_R1_002_GOLDEN,
  FULL_R1_002_PROVIDER_ROWS,
} from './fixtures/full-r1-002-golden.fixture';
import { buildRequest, expectAcquired, row, signalsBody, staticTransport } from './position-acquisition-test-helpers';

function goldenRequest() {
  const g = FULL_R1_002_GOLDEN;
  return buildRequest(g.fromUtc, g.toUtc, {
    organizationId: g.organizationId,
    vehicleId: g.vehicleId,
    tripId: g.tripId,
    dimoTokenId: g.dimoTokenId,
    dimoDeviceIdentity: FULL_R1_002_DEVICE_IDENTITY,
  });
}

async function acquireGolden(rows: readonly Record<string, unknown>[] = FULL_R1_002_PROVIDER_ROWS) {
  return expectAcquired(
    await acquireDiV0HistoricalPositions(goldenRequest(), staticTransport(signalsBody([...rows])), {}),
  );
}

describe('S3A golden — C1-MOBILE-FULL-R1-002 derived fixture', () => {
  it('builds the expected 1 s grid with distinct tri-state availability', async () => {
    const result = await acquireGolden();
    expect(result.expectedBucketCount).toBe(FULL_R1_002_GOLDEN.expectedBucketCount);
    expect(result.observations).toHaveLength(FULL_R1_002_GOLDEN.expectedBucketCount);
    expect(result.rowAbsentCount).toBe(33);
    expect(result.presentCount).toBe(34);
    expect(result.signalNullCount).toBe(0);

    const gap = result.buckets.filter(
      (b) =>
        b.bucketLabel >= FULL_R1_002_GOLDEN.rowAbsentGap.fromInclusive &&
        b.bucketLabel < FULL_R1_002_GOLDEN.rowAbsentGap.toExclusive,
    );
    expect(gap.every((b) => b.availability === 'ROW_ABSENT')).toBe(true);
    expect(gap.length).toBe(29);

    const hold = result.buckets.filter(
      (b) =>
        b.availability === 'PRESENT' &&
        b.observation.latitude === FULL_R1_002_GOLDEN.holdCoordinate.latitude &&
        b.observation.longitude === FULL_R1_002_GOLDEN.holdCoordinate.longitude,
    );
    expect(hold.length).toBeGreaterThanOrEqual(10);
    expect(hold.every((b) => b.temporalConfidence === 'BUCKET_BOUNDED')).toBe(true);

    const moving = result.buckets.filter((b) => b.bucketLabel >= '2026-09-26T19:08:06Z' && b.availability === 'PRESENT');
    const lats = moving.map((b) => b.observation.latitude);
    expect(new Set(lats).size).toBeGreaterThan(3);
  });

  it('does not fill ROW_ABSENT buckets (middle gap stays absent)', async () => {
    const result = await acquireGolden();
    const mid = result.buckets.find((b) => b.bucketLabel === '2026-09-26T19:07:30Z');
    expect(mid?.availability).toBe('ROW_ABSENT');
    expect(mid?.observation.latitude).toBeUndefined();
  });

  it('snapshot identity is deterministic under provider row reordering', async () => {
    const base = await acquireGolden();
    const reordered = [...FULL_R1_002_PROVIDER_ROWS].reverse();
    const shuffled = await acquireGolden(reordered);
    expect(shuffled.snapshotIdentity).toEqual(base.snapshotIdentity);
    expect(base.snapshotIdentity.digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('material coordinate change changes snapshot digest', async () => {
    const base = await acquireGolden();
    const mutated = FULL_R1_002_PROVIDER_ROWS.map((r) =>
      r.timestamp === '2026-09-26T19:08:10Z' ? row(r.timestamp, 51.33599, 9.50682) : r,
    );
    const changed = await acquireGolden(mutated);
    expect(changed.snapshotIdentity.digest).not.toBe(base.snapshotIdentity.digest);
  });

  it('pins expected snapshot digest for the sealed slice (regression lock)', async () => {
    const result = await acquireGolden();
    expect(result.snapshotIdentity.digest).toBe('2ab565e2c07877382a26dd4d1a84fc40e83c52ebca08fcef2af1e813ccd38e22');
  });
});
