import {
  classifyMotionState,
  parseSpeedSampleFromSignalsLatest,
  PhysicalDrivePhaseTracker,
  PhysicalEndDetector,
  PhysicalStartDetector,
  PreDeployMovementGate,
  rankCanonicalVehicleTripCandidates,
} from './reference-capture-exp-021-motion.lib';
import {
  EXP021_CADENCE_PHASE_ORDER_MS,
  EXP021_MANDATORY_AGES_MS,
} from './reference-capture-settlement-shadow.policy';

describe('reference-capture-exp-021-motion.lib', () => {
  const baseMs = Date.parse('2026-09-10T12:00:00.000Z');

  function speedSample(tsOffsetSec: number, speed: number) {
    const ts = new Date(baseMs + tsOffsetSec * 1000).toISOString();
    return parseSpeedSampleFromSignalsLatest({ speed: { timestamp: ts, value: speed } }, baseMs + tsOffsetSec * 1000);
  }

  it('never uses gear as speed authority', () => {
    const sample = parseSpeedSampleFromSignalsLatest(
      {
        powertrainTransmissionCurrentGear: {
          timestamp: '2026-09-10T11:59:50.000Z',
          value: 6,
        },
      },
      baseMs,
    );
    expect(sample.speedKmh).toBeNull();
    expect(sample.speedProviderField).toBeNull();
  });

  it('parses speed with provider field and freshness', () => {
    const sample = speedSample(0, 42);
    expect(sample.speedKmh).toBe(42);
    expect(sample.speedProviderField).toBe('speed');
    expect(sample.speedSignalFresh).toBe(true);
  });

  it('NULL_SPEED_COUNTS_AS_PARKED = NO — missing speed is UNKNOWN', () => {
    const sample = parseSpeedSampleFromSignalsLatest({}, baseMs);
    expect(classifyMotionState(sample, 3, 8)).toBe('UNKNOWN');
  });

  it('REPEATED_STALE_SPEED_CANNOT_TRIGGER_START', () => {
    const detector = new PhysicalStartDetector({
      movementSpeedKmh: 8,
      minDistinctFreshSamples: 3,
      minDistinctTimestamps: 3,
      maxSampleAgeMs: 120_000,
      confirmationWindowMs: 180_000,
      sustainedParkingResetMs: 90_000,
    });
    const stale = parseSpeedSampleFromSignalsLatest(
      { speed: { timestamp: '2026-09-10T11:50:00.000Z', value: 20 } },
      baseMs,
    );
    for (let i = 0; i < 5; i += 1) {
      detector.record(stale, baseMs, 'MOVING');
    }
    expect(detector.isConfirmed()).toBe(false);
  });

  it('START_BOUNDARY_ALWAYS_INSIDE_CONFIRMATION_WINDOW', () => {
    const detector = new PhysicalStartDetector({
      movementSpeedKmh: 8,
      minDistinctFreshSamples: 4,
      minDistinctTimestamps: 3,
      maxSampleAgeMs: 120_000,
      confirmationWindowMs: 180_000,
      sustainedParkingResetMs: 90_000,
    });
    const t0 = baseMs;
    detector.record(speedSample(0, 20), t0, 'MOVING');
    const lateOffsets = [200, 215, 230, 245];
    for (const offset of lateOffsets) {
      detector.record(speedSample(offset, 20), baseMs + offset * 1000, 'MOVING');
    }
    expect(detector.isConfirmed()).toBe(true);
    const confirmation = detector.getConfirmation();
    expect(confirmation?.firstQualifyingMovementAt.getTime()).toBe(baseMs + 200_000);
    expect(confirmation!.firstQualifyingMovementAt.getTime()).toBeGreaterThanOrEqual(
      baseMs + 180_000 - 15_000,
    );
  });

  it('URBAN_STOP_GO_START_REACHABLE', () => {
    const detector = new PhysicalStartDetector({
      movementSpeedKmh: 8,
      minDistinctFreshSamples: 4,
      minDistinctTimestamps: 3,
      maxSampleAgeMs: 120_000,
      confirmationWindowMs: 300_000,
      sustainedParkingResetMs: 90_000,
    });
    const movingTs = [0, 15, 30, 45, 75, 90, 105, 120];
    for (const offset of movingTs) {
      const sample = speedSample(offset, 25);
      detector.record(sample, baseMs + offset * 1000, 'MOVING');
      if (offset === 30) {
        detector.record(speedSample(35, 0), baseMs + 35_000, 'PARKED_CANDIDATE');
      }
    }
    expect(detector.isConfirmed()).toBe(true);
    const confirmation = detector.getConfirmation();
    expect(confirmation?.firstQualifyingMovementAt.toISOString()).toBe(
      new Date(baseMs).toISOString(),
    );
  });

  it('POST_DRIVE_PARKED_TIME_COUNTS_AS_VALID_PHASE = NO', () => {
    const tracker = new PhysicalDrivePhaseTracker();
    tracker.beginPhase(60_000, baseMs, 300_000);
    tracker.tick('UNKNOWN', baseMs + 300_000);
    const record = tracker.markPhysicalDriveEnded(baseMs + 300_000);
    expect(record?.scientificallyValid).toBe(false);
    expect(record?.validMovementDurationMs).toBe(0);
  });

  it('FINAL_PHASE_CAN_BE_VALID and FULL_RUN_REACHABLE', () => {
    const tracker = new PhysicalDrivePhaseTracker();
    const required = 300_000;
    let now = baseMs;
    const phaseOrder = EXP021_CADENCE_PHASE_ORDER_MS;
    for (let phaseIndex = 0; phaseIndex < phaseOrder.length; phaseIndex += 1) {
      const pollMs = phaseOrder[phaseIndex];
      tracker.beginPhase(pollMs, now, required);
      for (let i = 0; i < 21; i += 1) {
        now += 15_000;
        tracker.tick('MOVING', now);
      }
      if (phaseIndex < phaseOrder.length - 1) {
        const nextPollMs = phaseOrder[phaseIndex + 1];
        const sealed = tracker.advancePhaseAtEffectiveBoundary(now, nextPollMs, required);
        expect(sealed?.scientificallyValid).toBe(true);
      }
    }
    const final = tracker.markPhysicalDriveEnded(now + required);
    expect(final?.scientificallyValid).toBe(true);
    expect(tracker.computeRunCompleteness(4)).toBe('FULL');
  });

  it('prospective PDI schedules before boundary+30s', () => {
    const detector = new PhysicalEndDetector({
      parkedSpeedKmh: 3,
      movementSpeedKmh: 8,
      provisionalConfirmMs: 120_000,
      finalParkedMs: 600_000,
      maxSampleAgeMs: 120_000,
      minDistinctParkedSamples: 2,
    });
    const parked = speedSample(0, 0);
    const result = detector.observe(parked, 'PARKED_CANDIDATE', baseMs);
    expect(result.newProvisionalCandidate).not.toBeNull();
    const boundary = result.newProvisionalCandidate!.candidateBoundaryAt.getTime();
    const scheduleCreatedAt = new Date(baseMs + 1_000);
    detector.markSchedulesCreated(scheduleCreatedAt);
    expect(
      result.newProvisionalCandidate!.prospectiveAtCreationForAgeMs(30_000, scheduleCreatedAt),
    ).toBe(true);
    expect(scheduleCreatedAt.getTime()).toBeLessThanOrEqual(boundary + 30_000);
  });

  it('SINGLE_PARKED_SAMPLE_PLUS_UNKNOWN_CAN_STOP = NO', () => {
    const detector = new PhysicalEndDetector({
      parkedSpeedKmh: 3,
      movementSpeedKmh: 8,
      provisionalConfirmMs: 5_000,
      finalParkedMs: 600_000,
      maxSampleAgeMs: 120_000,
      minDistinctParkedSamples: 2,
    });
    detector.observe(speedSample(0, 0), 'PARKED_CANDIDATE', baseMs);
    const stop = detector.observe(speedSample(0, 0), 'UNKNOWN', baseMs + 10_000);
    expect(stop.shouldAutoStop).toBe(false);
  });

  it('invalidated candidate cannot auto-stop from stale parked evidence after MOVING', () => {
    const detector = new PhysicalEndDetector({
      parkedSpeedKmh: 3,
      movementSpeedKmh: 8,
      provisionalConfirmMs: 2_000,
      finalParkedMs: 600_000,
      maxSampleAgeMs: 120_000,
      minDistinctParkedSamples: 2,
    });
    detector.observe(speedSample(0, 0), 'PARKED_CANDIDATE', baseMs);
    detector.observe(speedSample(5, 0), 'PARKED_CANDIDATE', baseMs + 5_000);
    const invalidated = detector.observe(speedSample(10, 25), 'MOVING', baseMs + 10_000);
    const stop = detector.observe(speedSample(10, 25), 'UNKNOWN', baseMs + 20_000);
    expect(invalidated.candidateInvalidated).toBe(true);
    expect(stop.shouldAutoStop).toBe(false);
  });

  it('STRONG_PARKED_EVIDENCE_REQUIRED_FOR_UNKNOWN_STOP', () => {
    const detector = new PhysicalEndDetector({
      parkedSpeedKmh: 3,
      movementSpeedKmh: 8,
      provisionalConfirmMs: 2_000,
      finalParkedMs: 600_000,
      maxSampleAgeMs: 120_000,
      minDistinctParkedSamples: 2,
    });
    detector.observe(speedSample(0, 0), 'PARKED_CANDIDATE', baseMs);
    detector.observe(speedSample(5, 0), 'PARKED_CANDIDATE', baseMs + 5_000);
    const stop = detector.observe(speedSample(5, 0), 'UNKNOWN', baseMs + 8_000);
    expect(stop.shouldAutoStop).toBe(true);
  });

  function preDeployGateConfig(
    overrides: Partial<{
      movementSpeedKmh: number;
      minDistinctFreshSamples: number;
      maxSampleAgeMs: number;
      confirmationWindowMs: number;
      sustainedParkingResetMs: number;
    }> = {},
  ) {
    return {
      movementSpeedKmh: 8,
      minDistinctFreshSamples: 3,
      maxSampleAgeMs: 120_000,
      confirmationWindowMs: 180_000,
      sustainedParkingResetMs: 90_000,
      ...overrides,
    };
  }

  it('PRE_DEPLOY_REPEATED_TIMESTAMP_FALSE_START = NO', () => {
    const gate = new PreDeployMovementGate(preDeployGateConfig());
    const sample = speedSample(0, 20);
    for (let i = 0; i < 5; i += 1) {
      gate.record(sample, 'MOVING', baseMs + i * 15_000);
    }
    expect(gate.isDriveStartBeforeDeploy()).toBe(false);
    expect(gate.getDistinctSampleCount()).toBe(1);
  });

  it('PRE_DEPLOY_MOVEMENT_USES_DISTINCT_PROVIDER_EVIDENCE', () => {
    const gate = new PreDeployMovementGate(preDeployGateConfig());
    for (const offset of [0, 15, 30, 45]) {
      gate.record(speedSample(offset, 20), 'MOVING', baseMs + offset * 1000);
    }
    expect(gate.isDriveStartBeforeDeploy()).toBe(true);
  });

  it('PRE_DEPLOY_SEPARATED_MOVEMENT_FALSE_START = NO', () => {
    const gate = new PreDeployMovementGate(
      preDeployGateConfig({ sustainedParkingResetMs: 60_000 }),
    );
    gate.record(speedSample(0, 20), 'MOVING', baseMs);
    gate.record(speedSample(15, 20), 'MOVING', baseMs + 15_000);
    gate.record(speedSample(30, 0), 'PARKED_CANDIDATE', baseMs + 30_000);
    gate.record(speedSample(91, 0), 'PARKED_CANDIDATE', baseMs + 91_000);
    gate.record(speedSample(105, 20), 'MOVING', baseMs + 105_000);
    expect(gate.isDriveStartBeforeDeploy()).toBe(false);
    expect(gate.getDistinctSampleCount()).toBe(1);
  });

  it('PRE_DEPLOY_EXPIRED_MOVEMENT_FALSE_START = NO', () => {
    const gate = new PreDeployMovementGate(
      preDeployGateConfig({ confirmationWindowMs: 60_000 }),
    );
    gate.record(speedSample(0, 20), 'MOVING', baseMs);
    gate.record(speedSample(15, 20), 'MOVING', baseMs + 15_000);
    gate.record(speedSample(200, 20), 'MOVING', baseMs + 200_000);
    expect(gate.isDriveStartBeforeDeploy()).toBe(false);
    expect(gate.getDistinctSampleCount()).toBe(1);
  });

  it('PRE_DEPLOY_URBAN_STOP_GO_REACHABLE = YES', () => {
    const gate = new PreDeployMovementGate(
      preDeployGateConfig({
        minDistinctFreshSamples: 4,
        confirmationWindowMs: 300_000,
        sustainedParkingResetMs: 90_000,
      }),
    );
    gate.record(speedSample(0, 20), 'MOVING', baseMs);
    gate.record(speedSample(20, 0), 'PARKED_CANDIDATE', baseMs + 20_000);
    gate.record(speedSample(40, 20), 'MOVING', baseMs + 40_000);
    gate.record(speedSample(55, 20), 'UNKNOWN', baseMs + 55_000);
    gate.record(speedSample(70, 20), 'MOVING', baseMs + 70_000);
    gate.record(speedSample(85, 20), 'MOVING', baseMs + 85_000);
    expect(gate.isDriveStartBeforeDeploy()).toBe(true);
    expect(gate.getDistinctSampleCount()).toBe(4);
  });

  it('ONGOING_ENDTIME_CAN_BIND = NO — requires tripStatus COMPLETED', () => {
    const physicalStartMs = Date.parse('2026-09-10T12:00:00.000Z');
    const physicalEndMs = Date.parse('2026-09-10T12:30:00.000Z');
    const ranked = rankCanonicalVehicleTripCandidates({
      physicalStartMs,
      physicalEndMs,
      trips: [
        {
          id: 'trip-ongoing-provisional-end',
          tripStatus: 'ONGOING',
          startTime: new Date('2026-09-10T12:00:00.000Z'),
          endTime: new Date('2026-09-10T12:30:00.000Z'),
        },
      ],
    });
    expect(ranked.binding).toBe('NOT_FOUND');
  });

  it('rankCanonicalVehicleTripCandidates prefers highest overlap', () => {
    const physicalStartMs = Date.parse('2026-09-10T12:00:00.000Z');
    const physicalEndMs = Date.parse('2026-09-10T12:30:00.000Z');
    const ranked = rankCanonicalVehicleTripCandidates({
      physicalStartMs,
      physicalEndMs,
      trips: [
        {
          id: 'trip-a',
          tripStatus: 'COMPLETED',
          startTime: new Date('2026-09-10T12:05:00.000Z'),
          endTime: new Date('2026-09-10T12:10:00.000Z'),
        },
        {
          id: 'trip-b',
          tripStatus: 'COMPLETED',
          startTime: new Date('2026-09-10T12:00:00.000Z'),
          endTime: new Date('2026-09-10T12:30:00.000Z'),
        },
      ],
    });
    expect(ranked.binding).toBe('SINGLE_MATCH');
    if (ranked.binding === 'SINGLE_MATCH') {
      expect(ranked.trip.id).toBe('trip-b');
    }
  });
});

describe('reference-capture-exp-021 full-run simulation', () => {
  const baseMs = Date.parse('2026-09-10T12:00:00.000Z');

  function speedSample(atMs: number, speed: number) {
    return parseSpeedSampleFromSignalsLatest(
      { speed: { timestamp: new Date(atMs).toISOString(), value: speed } },
      atMs,
    );
  }

  it('FULL_RUN_SIMULATION deterministic accelerated path', () => {
    const startDetector = new PhysicalStartDetector({
      movementSpeedKmh: 8,
      minDistinctFreshSamples: 4,
      minDistinctTimestamps: 3,
      maxSampleAgeMs: 120_000,
      confirmationWindowMs: 300_000,
      sustainedParkingResetMs: 90_000,
    });
    const endDetector = new PhysicalEndDetector({
      parkedSpeedKmh: 3,
      movementSpeedKmh: 8,
      provisionalConfirmMs: 2_000,
      finalParkedMs: 10_000,
      maxSampleAgeMs: 120_000,
      minDistinctParkedSamples: 2,
    });
    const phaseTracker = new PhysicalDrivePhaseTracker();
    const required = 60_000;
    let now = baseMs;
    let pdiScheduled = false;
    let falseCandidateInvalidated = false;

    for (let i = 0; i < 4; i += 1) {
      now += 10_000;
      const sample = speedSample(now, 20);
      startDetector.record(sample, now, 'MOVING');
    }
    expect(startDetector.isConfirmed()).toBe(true);
    const driveStart = startDetector.getConfirmation()!.firstQualifyingMovementAt.getTime();

    const phaseOrder = EXP021_CADENCE_PHASE_ORDER_MS;
    for (let phaseIndex = 0; phaseIndex < phaseOrder.length; phaseIndex += 1) {
      const pollMs = phaseOrder[phaseIndex];
      phaseTracker.beginPhase(pollMs, now, required);
      for (let tick = 0; tick < 8; tick += 1) {
        now += 10_000;
        const moving = tick % 3 !== 2;
        phaseTracker.tick(moving ? 'MOVING' : 'PARKED_CANDIDATE', now);
      }
      for (let tick = 0; tick < 8; tick += 1) {
        now += 10_000;
        phaseTracker.tick('MOVING', now);
      }
      if (phaseIndex < phaseOrder.length - 1) {
        phaseTracker.advancePhaseAtEffectiveBoundary(now, phaseOrder[phaseIndex + 1], required);
      }
    }
    const finalPhase = phaseTracker.markPhysicalDriveEnded(now + required);
    expect(finalPhase?.scientificallyValid).toBe(true);
    expect(phaseTracker.computeRunCompleteness(4)).toBe('FULL');

    now += 5_000;
    const parked = speedSample(now, 0);
    const provisional = endDetector.observe(parked, 'PARKED_CANDIDATE', now);
    expect(provisional.newProvisionalCandidate).not.toBeNull();
    pdiScheduled = true;

    now += 5_000;
    const movingAgain = speedSample(now, 20);
    const invalidated = endDetector.observe(movingAgain, 'MOVING', now);
    expect(invalidated.candidateInvalidated).toBe(true);
    falseCandidateInvalidated = true;

    now += 5_000;
    const parked2 = speedSample(now, 0);
    endDetector.observe(parked2, 'PARKED_CANDIDATE', now);
    now += 5_000;
    const parked3 = speedSample(now, 0);
    endDetector.observe(parked3, 'PARKED_CANDIDATE', now);
    const ignitionOff = endDetector.observe(parked3, 'UNKNOWN', now + 12_000);

    expect(pdiScheduled).toBe(true);
    expect(falseCandidateInvalidated).toBe(true);
    expect(ignitionOff.shouldAutoStop).toBe(true);
    expect(driveStart).toBeLessThanOrEqual(now);
    expect(EXP021_CADENCE_PHASE_ORDER_MS.length).toBe(4);
    expect(EXP021_MANDATORY_AGES_MS.length).toBe(6);
    expect(EXP021_CADENCE_PHASE_ORDER_MS.length * 2 * EXP021_MANDATORY_AGES_MS.length).toBe(48);
  });
});
