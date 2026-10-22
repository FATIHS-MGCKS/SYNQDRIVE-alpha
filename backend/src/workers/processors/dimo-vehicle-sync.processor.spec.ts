import { DimoPollJobType, DimoPollStatus } from '@prisma/client';
import { DimoVehicleSyncProcessor } from './dimo-vehicle-sync.processor';

describe('DimoVehicleSyncProcessor', () => {
  it('12. shadow hook failure does not prevent successful sync poll log', async () => {
    const dimoApiSync = {
      fetchAndSyncFromDimoApi: jest.fn().mockResolvedValue({ synced: 2 }),
    };
    const prisma = {
      dimoPollLog: {
        create: jest.fn().mockResolvedValue({ id: 'log-1' }),
      },
    };
    const pdiIdentityDriftShadow = {
      runAfterSuccessfulDimoVehicleSync: jest.fn().mockRejectedValue(new Error('shadow boom')),
    };

    const processor = new DimoVehicleSyncProcessor(
      dimoApiSync as never,
      prisma as never,
      pdiIdentityDriftShadow as never,
    );

    await processor.process({} as never);

    expect(prisma.dimoPollLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jobType: DimoPollJobType.VEHICLE_SYNC,
          status: DimoPollStatus.SUCCESS,
          metaJson: { syncedCount: 2 },
        }),
      }),
    );
  });
});
