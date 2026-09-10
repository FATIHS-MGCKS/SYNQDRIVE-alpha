import {
  classifyMotionState,
  parseSpeedSampleFromSignalsLatest,
  PhysicalDrivePhaseTracker,
  PhysicalEndDetector,
  PhysicalStartDetector,
} from './reference-capture-exp-021-motion.lib';
import { EXP021_CADENCE_PHASE_ORDER_MS } from './reference-capture-settlement-shadow.policy';

describe('EXP-021 full operator journey simulation', () => {
  const deployAt = Date.parse('2026-09-10T11:40:00.000Z');

  function sample(atMs: number, speed: number) {
    return parseSpeedSampleFromSignalsLatest(
      { speed: { timestamp: new Date(atMs).toISOString(), value: speed } },
      atMs,
    );
  }

  it('wake-and-go without operator second command', () => {
    const startDetector = new PhysicalStartDetector({
      movementSpeedKmh: 8,
      minDistinctFreshSamples: 4,
      minDistinctTimestamps: 3,
      maxSampleAgeMs: 120_000,
      confirmationWindowMs: 300_000,
      sustainedParkingResetMs: 90_000,
    });
    startDetector.reset();

    let recordingStarted = false;
    let preRollComplete: 'YES' | 'PARTIAL' = 'PARTIAL';
    let physicalDriveStarted = false;
    let phase60Effective = false;

    const wakeAt = deployAt + 20 * 60_000;
    const movingSample = sample(wakeAt, 20);
    const motion = classifyMotionState(movingSample, 3, 8);
    expect(motion).toBe('MOVING');

    recordingStarted = true;
    preRollComplete = motion === 'PARKED_CANDIDATE' ? 'YES' : 'PARTIAL';
    expect(preRollComplete).toBe('PARTIAL');

    const offsets = [0, 15, 30, 45];
    for (const offset of offsets) {
      const at = wakeAt + offset * 1000;
      const s = sample(at, 22);
      startDetector.record(s, at, 'MOVING');
    }
    expect(startDetector.isConfirmed()).toBe(true);
    const confirmation = startDetector.getConfirmation()!;
    expect(confirmation.firstQualifyingMovementAt.getTime()).toBeGreaterThanOrEqual(deployAt);
    physicalDriveStarted = true;
    phase60Effective = true;

    const phaseTracker = new PhysicalDrivePhaseTracker();
    const endDetector = new PhysicalEndDetector({
      parkedSpeedKmh: 3,
      movementSpeedKmh: 8,
      provisionalConfirmMs: 2_000,
      finalParkedMs: 10_000,
      maxSampleAgeMs: 120_000,
      minDistinctParkedSamples: 2,
    });
    const required = 60_000;
    let now = wakeAt + 60_000;
    const phaseOrder = EXP021_CADENCE_PHASE_ORDER_MS;
    for (let i = 0; i < phaseOrder.length; i += 1) {
      phaseTracker.beginPhase(phaseOrder[i], now, required);
      for (let tick = 0; tick < 10; tick += 1) {
        now += 10_000;
        const moving = tick % 3 !== 2;
        phaseTracker.tick(moving ? 'MOVING' : 'PARKED_CANDIDATE', now);
      }
      for (let tick = 0; tick < 8; tick += 1) {
        now += 10_000;
        phaseTracker.tick('MOVING', now);
      }
      if (i < phaseOrder.length - 1) {
        phaseTracker.advancePhaseAtEffectiveBoundary(now, phaseOrder[i + 1], required);
      }
    }

    const falsePark = sample(now + 5_000, 0);
    endDetector.observe(falsePark, 'PARKED_CANDIDATE', now + 5_000);
    endDetector.observe(sample(now + 10_000, 25), 'MOVING', now + 10_000);
    endDetector.observe(sample(now + 15_000, 0), 'PARKED_CANDIDATE', now + 15_000);
    endDetector.observe(sample(now + 20_000, 0), 'PARKED_CANDIDATE', now + 20_000);
    const ignitionOff = endDetector.observe(sample(now + 20_000, 0), 'UNKNOWN', now + 30_000);

    const finalPhase = phaseTracker.markPhysicalDriveEnded(now + required);
    expect(recordingStarted).toBe(true);
    expect(physicalDriveStarted).toBe(true);
    expect(phase60Effective).toBe(true);
    expect(finalPhase?.scientificallyValid).toBe(true);
    expect(phaseTracker.computeRunCompleteness(4)).toBe('FULL');
    expect(ignitionOff.shouldAutoStop).toBe(true);
    expect(startDetector.getConfirmation()?.firstQualifyingMovementAt.getTime()).toBeGreaterThanOrEqual(
      deployAt,
    );
  });

  it('pre-deploy samples cannot confirm post-deploy start', () => {
    const detector = new PhysicalStartDetector({
      movementSpeedKmh: 8,
      minDistinctFreshSamples: 4,
      minDistinctTimestamps: 3,
      maxSampleAgeMs: 120_000,
      confirmationWindowMs: 300_000,
      sustainedParkingResetMs: 90_000,
    });
    const preDeployOffsets = [0, 15, 30];
    for (const offset of preDeployOffsets) {
      detector.record(sample(deployAt - 60_000 + offset * 1000, 20), deployAt - 60_000 + offset * 1000, 'MOVING');
    }
    detector.reset();
    detector.record(sample(deployAt + 15_000, 20), deployAt + 15_000, 'MOVING');
    expect(detector.isConfirmed()).toBe(false);
  });
});
