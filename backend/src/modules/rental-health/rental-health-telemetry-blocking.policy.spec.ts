import {
  TELEMETRY_SIGNAL_DELAYED_THRESHOLD_MS,
  TELEMETRY_STANDBY_THRESHOLD_MS,
} from '@modules/vehicles/vehicle-state-interpreter';
import {
  evaluateTelemetryRentalBlocking,
  RENTAL_HEALTH_TELEMETRY_OFFLINE_BLOCKING_REASON,
} from './rental-health-telemetry-blocking.policy';

const NOW_MS = Date.parse('2026-08-20T12:00:00.000Z');

function hoursAgo(hours: number): Date {
  return new Date(NOW_MS - hours * 60 * 60 * 1000);
}

describe('evaluateTelemetryRentalBlocking', () => {
  it('does not block live telemetry', () => {
    const result = evaluateTelemetryRentalBlocking(
      { lastSignal: new Date(NOW_MS - 5 * 60 * 1000) },
      NOW_MS,
    );
    expect(result.blocksRental).toBe(false);
    expect(result.freshness).toBe('live');
  });

  it('does not block standby telemetry', () => {
    const result = evaluateTelemetryRentalBlocking(
      { lastSignal: hoursAgo(10) },
      NOW_MS,
    );
    expect(result.blocksRental).toBe(false);
    expect(result.freshness).toBe('standby');
  });

  it('does not block soft-offline (signal_delayed) below 48h', () => {
    const justUnder48hMs = TELEMETRY_SIGNAL_DELAYED_THRESHOLD_MS - 60_000;
    const result = evaluateTelemetryRentalBlocking(
      { lastSignal: new Date(NOW_MS - justUnder48hMs) },
      NOW_MS,
    );
    expect(result.blocksRental).toBe(false);
    expect(result.freshness).toBe('signal_delayed');
  });

  it('blocks at exactly 48h (offline boundary)', () => {
    const result = evaluateTelemetryRentalBlocking(
      { lastSignal: new Date(NOW_MS - TELEMETRY_SIGNAL_DELAYED_THRESHOLD_MS) },
      NOW_MS,
    );
    expect(result.blocksRental).toBe(true);
    expect(result.freshness).toBe('offline');
    expect(result.reason).toBe(RENTAL_HEALTH_TELEMETRY_OFFLINE_BLOCKING_REASON);
  });

  it('blocks beyond 48h', () => {
    const result = evaluateTelemetryRentalBlocking(
      { lastSignal: hoursAgo(72) },
      NOW_MS,
    );
    expect(result.blocksRental).toBe(true);
    expect(result.freshness).toBe('offline');
  });

  it('does not block no_signal (never connected / missing timestamp)', () => {
    const result = evaluateTelemetryRentalBlocking({}, NOW_MS);
    expect(result.blocksRental).toBe(false);
    expect(result.freshness).toBe('no_signal');
    expect(result.reason).toBeNull();
  });

  it('does not block malformed timestamps', () => {
    const result = evaluateTelemetryRentalBlocking(
      { lastSignal: 'not-a-date' },
      NOW_MS,
    );
    expect(result.blocksRental).toBe(false);
    expect(result.freshness).toBe('no_signal');
  });

  it('preserves standby upper bound (24h) without blocking', () => {
    const justUnder24hMs = TELEMETRY_STANDBY_THRESHOLD_MS - 1;
    const result = evaluateTelemetryRentalBlocking(
      { lastSignal: new Date(NOW_MS - justUnder24hMs) },
      NOW_MS,
    );
    expect(result.blocksRental).toBe(false);
    expect(result.freshness).toBe('standby');
  });
});

describe('production scenario regression (5 vehicles)', () => {
  it('counts 3 ready and 2 notReady when two vehicles are hard-offline', () => {
    const vehicles = [
      { id: 'v1', lastSignal: hoursAgo(2) },
      { id: 'v2', lastSignal: hoursAgo(12) },
      { id: 'v3', lastSignal: hoursAgo(30) },
      { id: 'v4', lastSignal: hoursAgo(680) },
      { id: 'v5', lastSignal: hoursAgo(801) },
    ];

    let ready = 0;
    let notReady = 0;

    for (const vehicle of vehicles) {
      const telemetry = evaluateTelemetryRentalBlocking(
        { lastSignal: vehicle.lastSignal },
        NOW_MS,
      );
      if (telemetry.blocksRental) notReady++;
      else ready++;
    }

    expect(ready).toBe(3);
    expect(notReady).toBe(2);
  });
});
