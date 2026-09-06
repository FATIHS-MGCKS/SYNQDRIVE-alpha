import { TripDetectionState } from '@prisma/client';

import {
  classifyDimoStartWakeSignal,
  evaluateTrustedCompleteCooldownBypass,
  shouldRequestWakeProbe,
  wakeAlreadyCoveredBySnapshot,
} from './snapshot-wake.util';
import { buildSnapshotWakeContext } from './snapshot-wake.util';

const WORKER_NOW = new Date('2026-09-07T14:01:00.000Z');
const REST_ANCHOR = new Date('2026-09-07T14:00:00.000Z');

describe('snapshot-wake.util', () => {
  describe('classifyDimoStartWakeSignal', () => {
    it('accepts speed above movement threshold', () => {
      expect(
        classifyDimoStartWakeSignal({
          signalName: 'speed',
          value: 5,
          movementSpeedKmh: 3,
        }).eligible,
      ).toBe(true);
    });

    it('rejects speed at or below threshold', () => {
      expect(
        classifyDimoStartWakeSignal({
          signalName: 'speed',
          value: 3,
          movementSpeedKmh: 3,
        }).eligible,
      ).toBe(false);
    });

    it('accepts ignition ON', () => {
      expect(
        classifyDimoStartWakeSignal({
          signalName: 'isIgnitionOn',
          value: true,
          movementSpeedKmh: 3,
        }).eligible,
      ).toBe(true);
    });

    it('rejects ignition OFF', () => {
      expect(
        classifyDimoStartWakeSignal({
          signalName: 'isIgnitionOn',
          value: false,
          movementSpeedKmh: 3,
        }).eligible,
      ).toBe(false);
    });
  });

  describe('evaluateTrustedCompleteCooldownBypass', () => {
    const baseWake = buildSnapshotWakeContext({
      reason: 'SPEED_MOVEMENT',
      signalName: 'speed',
      providerObservedAt: new Date('2026-09-07T14:00:20.000Z'),
      receivedAt: WORKER_NOW,
    });

    it('allows bypass when wake and snapshot are fresh after rest anchor', () => {
      const result = evaluateTrustedCompleteCooldownBypass({
        lastRestingReason: 'complete',
        restAnchorAt: REST_ANCHOR,
        wakeContext: baseWake,
        snapshotSourceTimestamp: new Date('2026-09-07T14:00:21.000Z'),
        workerNow: WORKER_NOW,
      });
      expect(result.bypass).toBe(true);
      expect(result.cooldownBypassUsed).toBe(true);
    });

    it('rejects wake exactly at rest anchor', () => {
      const wake = buildSnapshotWakeContext({
        reason: 'SPEED_MOVEMENT',
        signalName: 'speed',
        providerObservedAt: REST_ANCHOR,
        receivedAt: WORKER_NOW,
      });
      expect(
        evaluateTrustedCompleteCooldownBypass({
          lastRestingReason: 'complete',
          restAnchorAt: REST_ANCHOR,
          wakeContext: wake,
          snapshotSourceTimestamp: new Date('2026-09-07T14:00:21.000Z'),
          workerNow: WORKER_NOW,
        }).bypass,
      ).toBe(false);
    });

    it('rejects wake before rest anchor', () => {
      const wake = buildSnapshotWakeContext({
        reason: 'SPEED_MOVEMENT',
        signalName: 'speed',
        providerObservedAt: new Date('2026-09-07T13:59:59.000Z'),
        receivedAt: WORKER_NOW,
      });
      expect(
        evaluateTrustedCompleteCooldownBypass({
          lastRestingReason: 'complete',
          restAnchorAt: REST_ANCHOR,
          wakeContext: wake,
          snapshotSourceTimestamp: new Date('2026-09-07T14:00:21.000Z'),
          workerNow: WORKER_NOW,
        }).bypass,
      ).toBe(false);
    });

    it('rejects missing providerObservedAt', () => {
      const wake = buildSnapshotWakeContext({
        reason: 'IGNITION_ON',
        signalName: 'isIgnitionOn',
        providerObservedAt: null,
        receivedAt: WORKER_NOW,
      });
      expect(
        evaluateTrustedCompleteCooldownBypass({
          lastRestingReason: 'complete',
          restAnchorAt: REST_ANCHOR,
          wakeContext: wake,
          snapshotSourceTimestamp: new Date('2026-09-07T14:00:21.000Z'),
          workerNow: WORKER_NOW,
        }).bypass,
      ).toBe(false);
    });

    it('rejects stale snapshot behind wake event', () => {
      expect(
        evaluateTrustedCompleteCooldownBypass({
          lastRestingReason: 'complete',
          restAnchorAt: REST_ANCHOR,
          wakeContext: baseWake,
          snapshotSourceTimestamp: new Date('2026-09-07T14:00:10.000Z'),
          workerNow: WORKER_NOW,
        }).bypass,
      ).toBe(false);
    });

    it('does not bypass discard cooldown path', () => {
      expect(
        evaluateTrustedCompleteCooldownBypass({
          lastRestingReason: 'discard',
          restAnchorAt: REST_ANCHOR,
          wakeContext: baseWake,
          snapshotSourceTimestamp: new Date('2026-09-07T14:00:21.000Z'),
          workerNow: WORKER_NOW,
        }).bypass,
      ).toBe(false);
    });
  });

  describe('shouldRequestWakeProbe', () => {
    const wake = buildSnapshotWakeContext({
      reason: 'SPEED_MOVEMENT',
      signalName: 'speed',
      providerObservedAt: new Date('2026-09-07T14:00:20.000Z'),
      receivedAt: WORKER_NOW,
    });

    it('schedules probe for stale monotonic skip on provider wake', () => {
      expect(
        shouldRequestWakeProbe({
          origin: 'PROVIDER_WAKE',
          wakeContext: wake,
          snapshotSourceTimestamp: null,
          staleMonotonicSkipped: true,
          tripStartEvalError: false,
          possibleStartCreated: false,
          fsmState: TripDetectionState.RESTING,
        }),
      ).toBe(true);
    });

    it('does not schedule generation 2', () => {
      expect(
        shouldRequestWakeProbe({
          origin: 'WAKE_PROBE',
          wakeContext: { ...wake, probeGeneration: 1 },
          snapshotSourceTimestamp: null,
          staleMonotonicSkipped: true,
          tripStartEvalError: false,
          possibleStartCreated: false,
          fsmState: TripDetectionState.RESTING,
        }),
      ).toBe(false);
    });

    it('skips probe when FSM already active during wake probe', () => {
      expect(
        shouldRequestWakeProbe({
          origin: 'WAKE_PROBE',
          wakeContext: wake,
          snapshotSourceTimestamp: new Date('2026-09-07T14:00:21.000Z'),
          staleMonotonicSkipped: false,
          tripStartEvalError: false,
          possibleStartCreated: false,
          fsmState: TripDetectionState.ACTIVE_TRIP,
        }),
      ).toBe(false);
    });
  });

  describe('wakeAlreadyCoveredBySnapshot', () => {
    it('detects coverage when snapshot sourceTimestamp >= wake event', () => {
      const wake = buildSnapshotWakeContext({
        reason: 'SPEED_MOVEMENT',
        signalName: 'speed',
        providerObservedAt: new Date('2026-09-07T14:00:20.000Z'),
        receivedAt: WORKER_NOW,
      });
      expect(
        wakeAlreadyCoveredBySnapshot({
          wakeContext: wake,
          snapshotSourceTimestamp: new Date('2026-09-07T14:00:21.000Z'),
        }),
      ).toBe(true);
    });
  });
});
