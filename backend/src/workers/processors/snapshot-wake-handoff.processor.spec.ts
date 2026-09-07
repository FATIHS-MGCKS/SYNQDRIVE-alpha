import { DelayedError } from 'bullmq';

import { SnapshotWakeHandoffProcessor } from './snapshot-wake-handoff.processor';
import { SnapshotWakeHandoffDeferError } from '../snapshot-wake/snapshot-wake-handoff-defer.error';

describe('SnapshotWakeHandoffProcessor', () => {
  it('re-arms current handoff job via moveToDelayed and throws DelayedError on defer', async () => {
    const moveToDelayed = jest.fn().mockResolvedValue(undefined);
    const dispatchSuccessorHandoff = jest
      .fn()
      .mockRejectedValue(new SnapshotWakeHandoffDeferError(1500, 'canonical_active'));

    const processor = new SnapshotWakeHandoffProcessor({
      dispatchSuccessorHandoff,
    } as never);

    const job = {
      data: { vehicleId: 'veh-1' },
      token: 'tok-1',
      moveToDelayed,
    };

    await expect(processor.process(job as never)).rejects.toBeInstanceOf(
      DelayedError,
    );
    expect(dispatchSuccessorHandoff).toHaveBeenCalledWith('veh-1');
    expect(moveToDelayed).toHaveBeenCalledWith(expect.any(Number), 'tok-1');
  });

  it('propagates non-defer failures', async () => {
    const processor = new SnapshotWakeHandoffProcessor({
      dispatchSuccessorHandoff: jest.fn().mockRejectedValue(new Error('fatal')),
    } as never);

    await expect(
      processor.process({ data: { vehicleId: 'veh-1' }, token: 't' } as never),
    ).rejects.toThrow('fatal');
  });
});
