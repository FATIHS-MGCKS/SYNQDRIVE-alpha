import {
  CALIBRATION_UNSET_V0_BUNDLE,
  classifyPositionRows,
  computeDiV0TripIntervals,
  DEFAULT_DI_V0_VERSION_TUPLE,
} from '../../core';
import { pilotFreshL3Triple, PILOT_HOLD_COORD } from '../../core/__tests__/fixtures/wob-pilot-golden.fixture';
import { acquireDiV0HistoricalPositions, toDiV0S1PositionInput } from '../di-v0-position-acquisition';
import {
  API_SYNTHETIC_IDENTITY,
  buildRequest,
  expectAcquired,
  labelAt,
  nullLocationRow,
  row,
  signalsBody,
  staticTransport,
  UNKNOWN_IDENTITY,
} from './position-acquisition-test-helpers';

const ctx = { versions: DEFAULT_DI_V0_VERSION_TUPLE, calibration: CALIBRATION_UNSET_V0_BUNDLE };
const FRESH_FROM = '2026-09-26T09:57:19Z';
const FRESH_TO = '2026-09-26T09:57:23Z';

/** WOB pilot golden fixture re-expressed in DIMO provider row shape. */
function pilotFreshProviderRows(): Record<string, unknown>[] {
  return pilotFreshL3Triple().map((o) => row(o.bucketLabel, o.latitude, o.longitude));
}

function pilotHoldReleaseProviderRows(base: string): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (let s = 0; s < 5; s++) rows.push(row(labelAt(base, s), PILOT_HOLD_COORD.lat, PILOT_HOLD_COORD.lon));
  const releaseLat = PILOT_HOLD_COORD.lat + 303 / 111_320;
  for (let s = 0; s < 6; s++) {
    rows.push(row(labelAt(base, 5 + s), releaseLat + s * 0.00005, PILOT_HOLD_COORD.lon));
  }
  return rows;
}

async function acquire(rows: unknown[], from: string, to: string, identity: unknown = undefined) {
  return expectAcquired(
    await acquireDiV0HistoricalPositions(
      buildRequest(from, to, identity === undefined ? {} : { dimoDeviceIdentity: identity }),
      staticTransport(signalsBody(rows)),
      {},
    ),
  );
}

describe('S3A → S1 integration (test-only; S1 contract unchanged)', () => {
  it('WOB golden fresh triple reproduces the S1 golden L3 at 09:57:21Z', async () => {
    const result = await acquire(pilotFreshProviderRows(), FRESH_FROM, FRESH_TO);
    const out = computeDiV0TripIntervals(toDiV0S1PositionInput(result), ctx);
    const direct = computeDiV0TripIntervals({ sourceFamily: 'RUPTELA_R1', positions: pilotFreshL3Triple() }, ctx);
    const center = out.intervals.find((r) => r.intervalStart === '2026-09-26T09:57:21Z');
    expect(center?.motionState).toBe('MOVING_SPEED_ESTIMATED');
    expect(center?.claimLevel).toBe('L2');
    const directCenter = direct.intervals.find((r) => r.intervalStart === '2026-09-26T09:57:21Z');
    expect(center?.estimatedSpeedKmh).toBe(directCenter?.estimatedSpeedKmh);
  });

  it('ROW_ABSENT in support blocks numeric L3 (no interpolation)', async () => {
    const rows = pilotFreshProviderRows().filter((r) => r.timestamp !== '2026-09-26T09:57:20Z');
    const result = await acquire(rows, FRESH_FROM, FRESH_TO);
    expect(result.buckets[1].availability).toBe('ROW_ABSENT');
    const out = computeDiV0TripIntervals(toDiV0S1PositionInput(result), ctx);
    for (const label of ['2026-09-26T09:57:20Z', '2026-09-26T09:57:21Z']) {
      expect(out.intervals.find((r) => r.intervalStart === label)?.estimatedSpeedKmh ?? null).toBeNull();
    }
  });

  it('SIGNAL_NULL in support blocks numeric L3', async () => {
    const rows = pilotFreshProviderRows().map((r) =>
      r.timestamp === '2026-09-26T09:57:20Z' ? nullLocationRow(r.timestamp) : r,
    );
    const result = await acquire(rows, FRESH_FROM, FRESH_TO);
    expect(result.buckets[1].availability).toBe('SIGNAL_NULL');
    const out = computeDiV0TripIntervals(toDiV0S1PositionInput(result), ctx);
    expect(out.intervals.find((r) => r.intervalStart === '2026-09-26T09:57:21Z')?.estimatedSpeedKmh ?? null).toBeNull();
  });

  it.each([
    ['invalid coordinate', (r: Record<string, unknown>) => row(r.timestamp, 95, 9.5)],
    ['conflicting duplicate', null],
  ])('%s at support label yields no numeric speed there', async (_name, mutate) => {
    let rows = pilotFreshProviderRows();
    if (mutate) {
      rows = rows.map((r) => (r.timestamp === '2026-09-26T09:57:20Z' ? mutate(r) : r));
    } else {
      rows.push(row('2026-09-26T09:57:20Z', 51.4, 9.6));
    }
    const result = await acquire(rows, FRESH_FROM, FRESH_TO);
    expect(result.buckets[1].observation.latitude).toBeUndefined();
    const out = computeDiV0TripIntervals(toDiV0S1PositionInput(result), ctx);
    expect(out.intervals.find((r) => r.intervalStart === '2026-09-26T09:57:21Z')?.estimatedSpeedKmh ?? null).toBeNull();
  });

  it('hold is left to S1: identical coordinates are PRESENT in S3A and FROZEN in S1, never stop-inferred', async () => {
    const base = '2026-09-26T10:00:00Z';
    const result = await acquire(pilotHoldReleaseProviderRows(base), base, labelAt(base, 11));
    expect(result.buckets.slice(0, 5).every((b) => b.availability === 'PRESENT')).toBe(true);
    const classified = classifyPositionRows(result.observations, ctx.calibration);
    expect(classified.slice(1, 5).every((r) => r.positionState.startsWith('FROZEN'))).toBe(true);
    const out = computeDiV0TripIntervals(toDiV0S1PositionInput(result), ctx);
    expect(out.intervals.filter((r) => r.positionState.startsWith('FROZEN') && r.estimatedSpeedKmh != null)).toHaveLength(0);
  });

  it('303 m release keeps S1 release protection (no numeric speed on RELEASE)', async () => {
    const base = '2026-09-26T10:00:00Z';
    const result = await acquire(pilotHoldReleaseProviderRows(base), base, labelAt(base, 11));
    const out = computeDiV0TripIntervals(toDiV0S1PositionInput(result), ctx);
    expect(out.intervals.some((r) => r.positionState === 'RELEASE')).toBe(true);
    expect(out.intervals.filter((r) => r.positionState === 'RELEASE' && r.estimatedSpeedKmh != null)).toHaveLength(0);
    expect(out.intervals.some((r) => r.positionState === 'FRESH' && r.estimatedSpeedKmh != null)).toBe(true);
  });

  it('API_SYNTHETIC control flows through S1 with its own family', async () => {
    const result = await acquire(pilotFreshProviderRows(), FRESH_FROM, FRESH_TO, API_SYNTHETIC_IDENTITY);
    const out = computeDiV0TripIntervals(toDiV0S1PositionInput(result), ctx);
    expect(out.warnings).not.toContain('UNSUPPORTED_SOURCE_FAMILY');
    expect(out.intervals.every((r) => r.provenance.sourceFamily === 'API_SYNTHETIC')).toBe(true);
  });

  it('UNKNOWN control: S3A normalizes, S1 abstains with UNSUPPORTED_SOURCE_FAMILY', async () => {
    const result = await acquire(pilotFreshProviderRows(), FRESH_FROM, FRESH_TO, UNKNOWN_IDENTITY);
    expect(result.presentCount).toBe(4);
    const out = computeDiV0TripIntervals(toDiV0S1PositionInput(result), ctx);
    expect(out.intervals).toHaveLength(0);
    expect(out.warnings).toContain('UNSUPPORTED_SOURCE_FAMILY');
  });

  it('S3A observation shape matches S1 canonical ROW_ABSENT construction', async () => {
    const { buildRowAbsentObservation } = await import('../../core/grid/densify-grid');
    const result = await acquire([], FRESH_FROM, labelAt(FRESH_FROM, 1));
    const s1 = buildRowAbsentObservation(FRESH_FROM, 'RUPTELA_R1');
    const s3a = result.observations[0];
    expect({ ...s3a, provenance: undefined }).toEqual({ ...s1, provenance: undefined });
    expect(s3a.provenance.sourceSignal).toBe(s1.provenance.sourceSignal);
  });
});
