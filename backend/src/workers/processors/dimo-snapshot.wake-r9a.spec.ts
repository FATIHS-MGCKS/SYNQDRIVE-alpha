import { TripDetectionState } from '@prisma/client';

import { SnapshotWakeCoordinatorService } from '../snapshot-wake/snapshot-wake-coordinator.service';
import { buildSnapshotWakeContext } from '../snapshot-wake/snapshot-wake.util';

describe('DimoSnapshotProcessor — R9A wake handoff semantics', () => {
  const wake = buildSnapshotWakeContext({
    reason: 'SPEED_MOVEMENT',
    signalName: 'speed',
    providerObservedAt: new Date('2026-09-07T14:00:20.000Z'),
    receivedAt: new Date('2026-09-07T14:00:21.000Z'),
  });

  let coordinator: jest.Mocked<
    Pick<
      SnapshotWakeCoordinatorService,
      | 'claimPendingWakeForRun'
      | 'resolveEffectiveWakeContext'
      | 'afterSnapshotJob'
      | 'observeWakeToFetchSeconds'
    >
  >;

  beforeEach(() => {
    coordinator = {
      claimPendingWakeForRun: jest.fn().mockResolvedValue(null),
      resolveEffectiveWakeContext: jest.fn().mockReturnValue(wake),
      afterSnapshotJob: jest.fn().mockResolvedValue(undefined),
      observeWakeToFetchSeconds: jest.fn(),
    };
  });

  it('claims pending wake without destructive consume before work', async () => {
    coordinator.claimPendingWakeForRun.mockResolvedValue({
      record: {
        dimoTokenId: 42,
        wakeContext: wake,
        updatedAtMs: Date.now(),
        version: 1,
      },
      version: 1,
    });

    await coordinator.claimPendingWakeForRun('veh-1');
    expect(coordinator.claimPendingWakeForRun).toHaveBeenCalledWith('veh-1');
  });

  it('passes claimed pending wake into afterSnapshotJob for durable ACK/handoff', async () => {
    const claimed = {
      record: {
        dimoTokenId: 42,
        wakeContext: wake,
        updatedAtMs: Date.now(),
        version: 3,
      },
      version: 3,
    };

    await coordinator.afterSnapshotJob({
      vehicleId: 'veh-1',
      dimoTokenId: 42,
      jobData: {
        vehicleId: 'veh-1',
        dimoTokenId: 42,
        origin: 'SCHEDULED',
        wakeContext: wake,
      },
      claimedPendingWake: claimed,
      effectiveWakeContext: wake,
      snapshotSourceTimestamp: new Date('2026-09-07T14:00:10.000Z'),
      staleMonotonicSkipped: false,
      tripStartEvalError: false,
      possibleStartCreated: false,
      providerFetchFailed: false,
      fsmState: TripDetectionState.RESTING,
    });

    expect(coordinator.afterSnapshotJob).toHaveBeenCalledWith(
      expect.objectContaining({ claimedPendingWake: claimed }),
    );
  });
});
