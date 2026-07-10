import {
  DEVICE_QUALITY_ACTIVATION_FLAGGED_OF_LAST,
  DEVICE_QUALITY_EVALUATION_WINDOW,
  DEVICE_QUALITY_RECOVERY_CONSECUTIVE_NORMAL,
  evaluateTripDeviceQuality,
  transitionVehicleDeviceQualityState,
  shouldWarnOnTrip,
} from './driving-assessment-device-quality.detector';

describe('evaluateTripDeviceQuality', () => {
  const mkEvents = (count: number, gapMs = 14_000) => {
    const base = new Date('2026-07-08T19:40:00.000Z');
    return Array.from({ length: count }, (_, i) => ({
      eventType: 'HARSH_ACCELERATION',
      recordedAt: new Date(base.getTime() + i * gapMs),
    }));
  };

  it('flags high events/km pattern (WOB L 7503 style)', () => {
    const verdict = evaluateTripDeviceQuality({
      events: mkEvents(84),
      distanceKm: 1.4,
      durationMin: 29,
    });
    expect(verdict.flagged).toBe(true);
    expect(verdict.metrics.eventsPerKm).toBeGreaterThan(50);
  });

  it('does not flag calm trip', () => {
    const verdict = evaluateTripDeviceQuality({
      events: [],
      distanceKm: 12,
      durationMin: 20,
    });
    expect(verdict.flagged).toBe(false);
  });

  it('flags moderate urban trip above threshold', () => {
    const verdict = evaluateTripDeviceQuality({
      events: mkEvents(10, 30_000),
      distanceKm: 2.9,
      durationMin: 6,
    });
    expect(verdict.flagged).toBe(true);
  });
});

describe('transitionVehicleDeviceQualityState', () => {
  it('activates DEGRADED after 2 of 3 flagged trips', () => {
    const result = transitionVehicleDeviceQualityState({
      currentStatus: 'NORMAL',
      consecutiveNormalTrips: 0,
      degradedSince: null,
      recentTripFlagged: [true, true, false],
    });
    expect(result.nextStatus).toBe('DEGRADED');
    expect(result.degradedSince).not.toBeNull();
  });

  it('recovers after 3 consecutive normal trips from DEGRADED', () => {
    const result = transitionVehicleDeviceQualityState({
      currentStatus: 'DEGRADED',
      consecutiveNormalTrips: 2,
      degradedSince: new Date('2026-07-08T00:00:00Z'),
      recentTripFlagged: [false],
    });
    expect(result.nextStatus).toBe('NORMAL');
    expect(result.recoveredAt).not.toBeNull();
  });

  it('returns to DEGRADED from RECOVERING on new spike', () => {
    const result = transitionVehicleDeviceQualityState({
      currentStatus: 'RECOVERING',
      consecutiveNormalTrips: 1,
      degradedSince: new Date('2026-07-08T00:00:00Z'),
      recentTripFlagged: [true],
    });
    expect(result.nextStatus).toBe('DEGRADED');
  });
});

describe('shouldWarnOnTrip', () => {
  it('warns when vehicle degraded even on calm trip', () => {
    expect(shouldWarnOnTrip({ vehicleStatus: 'DEGRADED', tripFlagged: false })).toBe(true);
  });

  it('does not warn on normal vehicle and calm trip', () => {
    expect(shouldWarnOnTrip({ vehicleStatus: 'NORMAL', tripFlagged: false })).toBe(false);
  });
});

describe('constants', () => {
  it('uses stable hysteresis windows', () => {
    expect(DEVICE_QUALITY_EVALUATION_WINDOW).toBe(3);
    expect(DEVICE_QUALITY_ACTIVATION_FLAGGED_OF_LAST).toBe(2);
    expect(DEVICE_QUALITY_RECOVERY_CONSECUTIVE_NORMAL).toBe(3);
  });
});
