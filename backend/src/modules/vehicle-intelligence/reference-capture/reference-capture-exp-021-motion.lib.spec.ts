import {
  classifyMotionState,
  parseSpeedSampleFromSignalsLatest,
  PhysicalDrivePhaseTracker,
  PhysicalStartDetector,
} from './reference-capture-exp-021-motion.lib';

describe('reference-capture-exp-021-motion.lib', () => {
  const nowMs = Date.parse('2026-09-10T12:00:00.000Z');

  it('never uses gear as speed authority', () => {
    const sample = parseSpeedSampleFromSignalsLatest(
      {
        powertrainTransmissionCurrentGear: {
          timestamp: '2026-09-10T11:59:50.000Z',
          value: 6,
        },
      },
      nowMs,
    );
    expect(sample.speedKmh).toBeNull();
    expect(sample.speedProviderField).toBeNull();
  });

  it('parses speed with provider field and freshness', () => {
    const sample = parseSpeedSampleFromSignalsLatest(
      {
        speed: { timestamp: '2026-09-10T11:59:55.000Z', value: 42 },
      },
      nowMs,
    );
    expect(sample.speedKmh).toBe(42);
    expect(sample.speedProviderField).toBe('speed');
    expect(sample.speedUnit).toBe('km/h');
    expect(sample.speedSignalFresh).toBe(true);
    expect(sample.vehicleTelemetryFresh).toBe(true);
  });

  it('NULL_SPEED_COUNTS_AS_PARKED = NO — missing speed is UNKNOWN', () => {
    const sample = parseSpeedSampleFromSignalsLatest({}, nowMs);
    expect(classifyMotionState(sample, 3, 8)).toBe('UNKNOWN');
  });

  it('REPEATED_STALE_SPEED_CANNOT_TRIGGER_START', () => {
    const detector = new PhysicalStartDetector({
      movementSpeedKmh: 8,
      minDistinctFreshSamples: 3,
      minDistinctTimestamps: 3,
      maxSampleAgeMs: 120_000,
    });
    const stale = parseSpeedSampleFromSignalsLatest(
      { speed: { timestamp: '2026-09-10T11:50:00.000Z', value: 20 } },
      nowMs,
    );
    for (let i = 0; i < 5; i += 1) {
      detector.record(stale, nowMs);
    }
    expect(detector.isConfirmed()).toBe(false);
  });

  it('requires distinct fresh speed timestamps for physical start', () => {
    const detector = new PhysicalStartDetector({
      movementSpeedKmh: 8,
      minDistinctFreshSamples: 3,
      minDistinctTimestamps: 3,
      maxSampleAgeMs: 120_000,
    });
    const samples = ['11:59:40', '11:59:45', '11:59:50'].map((ts) =>
      parseSpeedSampleFromSignalsLatest(
        { speed: { timestamp: `2026-09-10T${ts}.000Z`, value: 25 } },
        nowMs,
      ),
    );
    for (const sample of samples) {
      detector.record(sample, nowMs);
    }
    expect(detector.isConfirmed()).toBe(true);
  });

  it('POST_DRIVE_PARKED_TIME_COUNTS_AS_VALID_PHASE = NO', () => {
    const tracker = new PhysicalDrivePhaseTracker();
    tracker.beginPhase(60_000, nowMs);
    tracker.tick('UNKNOWN', nowMs + 300_000);
    tracker.markPhysicalDriveEnded(nowMs + 300_000);
    const record = tracker.getCompletedPhases()[0];
    expect(record?.scientificallyValid).toBe(false);
    expect(record?.validMovementDurationMs).toBe(0);
  });
});
