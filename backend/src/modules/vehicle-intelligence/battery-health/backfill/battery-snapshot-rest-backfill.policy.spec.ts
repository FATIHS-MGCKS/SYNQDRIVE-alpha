import { BatteryMeasurementQuality } from '@prisma/client';
import {
  classifySnapshotRestBackfillBatch,
  classifySnapshotRestBackfillCandidate,
  buildSnapshotRestBackfillIdempotencyKey,
} from './battery-snapshot-rest-backfill.policy';
import type { SnapshotRestBackfillCandidate } from './battery-snapshot-rest-backfill.types';

function candidate(
  overrides: Partial<SnapshotRestBackfillCandidate> = {},
): SnapshotRestBackfillCandidate {
  return {
    snapshotId: 'snap-1',
    vehicleId: 'veh-1',
    organizationId: 'org-1',
    observedAt: new Date('2026-07-01T08:00:00.000Z'),
    voltageV: 12.45,
    restingVoltage: 12.45,
    engineRunning: false,
    temperatureC: null,
    createdAt: new Date('2026-07-01T08:00:01.000Z'),
    ...overrides,
  };
}

describe('battery-snapshot-rest-backfill.policy', () => {
  it('builds stable idempotency keys', () => {
    expect(buildSnapshotRestBackfillIdempotencyKey('abc')).toBe(
      'hist-snap-rest:abc:REST_60M',
    );
  });

  it('skips snapshots without restingVoltage', () => {
    const result = classifySnapshotRestBackfillCandidate({
      candidate: candidate({ restingVoltage: null }),
    });
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('missing_rest_voltage');
  });

  it('classifies plausible historical rest capture as VALID', () => {
    const result = classifySnapshotRestBackfillCandidate({
      candidate: candidate({ restingVoltage: 12.45, voltageV: 12.45 }),
    });
    expect(result.quality).toBe(BatteryMeasurementQuality.VALID);
    expect(result.evidenceEligible).toBe(true);
    expect(result.reasonCode).toBe('valid_historical_rest_capture');
  });

  it('classifies charging contamination above max resting voltage', () => {
    const result = classifySnapshotRestBackfillCandidate({
      candidate: candidate({ restingVoltage: 13.5, voltageV: 13.5 }),
      policy: { maxRestingVoltage: 13.2, wakeVoltageThreshold: 13.8 },
    });
    expect(result.quality).toBe(
      BatteryMeasurementQuality.CONTAMINATED_BY_CHARGING,
    );
  });

  it('classifies engine running as active trip contamination', () => {
    const result = classifySnapshotRestBackfillCandidate({
      candidate: candidate({ engineRunning: true }),
    });
    expect(result.quality).toBe(
      BatteryMeasurementQuality.CONTAMINATED_BY_ACTIVE_TRIP,
    );
  });

  it('detects wake flank across a vehicle batch', () => {
    const rows = [
      candidate({
        snapshotId: 'snap-a',
        observedAt: new Date('2026-07-01T06:00:00.000Z'),
        restingVoltage: 12.4,
        voltageV: 12.4,
      }),
      candidate({
        snapshotId: 'snap-b',
        observedAt: new Date('2026-07-01T07:00:00.000Z'),
        restingVoltage: 14.1,
        voltageV: 14.1,
      }),
    ];
    const classified = classifySnapshotRestBackfillBatch({ candidates: rows });
    expect(classified.get('snap-b')?.wakeFlank).toBe(true);
    expect(classified.get('snap-b')?.quality).toBe(
      BatteryMeasurementQuality.CONTAMINATED_BY_WAKE,
    );
  });
});
