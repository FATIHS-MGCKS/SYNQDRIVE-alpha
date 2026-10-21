import {
  CALIBRATION_UNSET_V0_BUNDLE,
  classifyPositionRows,
  computeDiV0TripIntervals,
  DEFAULT_DI_V0_VERSION_TUPLE,
} from '../../core';
import { acquireDiV0HistoricalPositions, toDiV0S1PositionInput } from '../di-v0-position-acquisition';
import {
  FULL_R1_002_DEVICE_IDENTITY,
  FULL_R1_002_GOLDEN,
  FULL_R1_002_PROVIDER_ROWS,
} from './fixtures/full-r1-002-golden.fixture';
import { buildRequest, expectAcquired, signalsBody, staticTransport } from './position-acquisition-test-helpers';

const ctx = { versions: DEFAULT_DI_V0_VERSION_TUPLE, calibration: CALIBRATION_UNSET_V0_BUNDLE };

async function acquireGolden() {
  const g = FULL_R1_002_GOLDEN;
  return expectAcquired(
    await acquireDiV0HistoricalPositions(
      buildRequest(g.fromUtc, g.toUtc, {
        organizationId: g.organizationId,
        vehicleId: g.vehicleId,
        tripId: g.tripId,
        dimoTokenId: g.dimoTokenId,
        dimoDeviceIdentity: FULL_R1_002_DEVICE_IDENTITY,
      }),
      staticTransport(signalsBody([...FULL_R1_002_PROVIDER_ROWS])),
      {},
    ),
  );
}

describe('S3A → S1 golden — C1-MOBILE-FULL-R1-002 structural regression', () => {
  it('fresh moving tail can yield numeric L3 once three consecutive PRESENT buckets exist', async () => {
    const result = await acquireGolden();
    const out = computeDiV0TripIntervals(toDiV0S1PositionInput(result), ctx);
    const center = out.intervals.find((r) => r.intervalStart === '2026-09-26T19:08:10Z');
    expect(center?.motionState).toBe('MOVING_SPEED_ESTIMATED');
    expect(typeof center?.estimatedSpeedKmh).toBe('number');
    expect(center?.estimatedSpeedKmh).toBeGreaterThan(0);
  });

  it('ROW_ABSENT inside the sealed gap blocks numeric L3 at the gap edge', async () => {
    const result = await acquireGolden();
    const out = computeDiV0TripIntervals(toDiV0S1PositionInput(result), ctx);
    expect(out.intervals.find((r) => r.intervalStart === '2026-09-26T19:07:30Z')?.estimatedSpeedKmh ?? null).toBeNull();
    expect(out.intervals.find((r) => r.intervalStart === '2026-09-26T19:07:49Z')?.estimatedSpeedKmh ?? null).toBeNull();
  });

  it('repeated coordinates are PRESENT in S3A and FROZEN in S1 without invented motion', async () => {
    const result = await acquireGolden();
    const holdLabels = ['2026-09-26T19:07:53Z', '2026-09-26T19:07:54Z', '2026-09-26T19:07:55Z'];
    for (const label of holdLabels) {
      expect(result.buckets.find((b) => b.bucketLabel === label)?.availability).toBe('PRESENT');
    }
    const classified = classifyPositionRows(result.observations, ctx.calibration);
    const frozen = classified.filter(
      (r) => holdLabels.includes(r.observation.bucketLabel) && r.positionState.startsWith('FROZEN'),
    );
    expect(frozen.length).toBeGreaterThanOrEqual(2);
    const out = computeDiV0TripIntervals(toDiV0S1PositionInput(result), ctx);
    expect(
      out.intervals
        .filter((r) => holdLabels.includes(r.intervalStart) && r.positionState.startsWith('FROZEN'))
        .every((r) => r.estimatedSpeedKmh == null),
    ).toBe(true);
  });

  it('release transition has no release-derived numeric speed; L3 resumes only after valid support', async () => {
    const result = await acquireGolden();
    const out = computeDiV0TripIntervals(toDiV0S1PositionInput(result), ctx);
    const release = out.intervals.find((r) => r.intervalStart === '2026-09-26T19:08:02Z');
    if (release?.positionState === 'RELEASE') {
      expect(release.estimatedSpeedKmh).toBeNull();
    }
    expect(out.intervals.find((r) => r.intervalStart === '2026-09-26T19:08:03Z')?.estimatedSpeedKmh ?? null).toBeNull();
    expect(out.intervals.find((r) => r.intervalStart === '2026-09-26T19:08:10Z')?.estimatedSpeedKmh ?? null).not.toBeNull();
  });
});
