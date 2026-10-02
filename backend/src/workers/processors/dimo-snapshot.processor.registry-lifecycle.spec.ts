import { Job } from 'bullmq';

import {
  DimoSnapshotProcessor,
  type DimoSnapshotJobData,
} from './dimo-snapshot.processor';
import { DimoPollStatus } from '@prisma/client';

describe('DimoSnapshotProcessor — registry lifecycle gate', () => {
  const vehicleId = 'veh-offboarded';
  const dimoTokenId = 7;

  it('skips canonical pipeline for OFFBOARDED vehicles without provider fetch', async () => {
    const dimoTelemetry = {
      fetchLatestVehicleSnapshot: jest.fn(),
    };
    const prisma = {
      vehicle: {
        findUnique: jest.fn().mockResolvedValue({
          organizationId: 'org-1',
          registryLifecycle: 'OFFBOARDED',
          hardwareType: 'AUTOPI',
          dimoVehicle: { connectionStatus: 'CONNECTED' },
          dataSourceLinks: [],
        }),
      },
      dimoPollLog: {
        create: jest.fn().mockResolvedValue({ id: 'poll-skip' }),
      },
      vehicleLatestState: {
        upsert: jest.fn(),
        update: jest.fn(),
      },
    };

    const processor = new DimoSnapshotProcessor(
      { getVehicleJwt: jest.fn() } as never,
      dimoTelemetry as never,
      prisma as never,
      { evaluateSnapshotForTripStart: jest.fn() } as never,
      { classifyAndEnqueue: jest.fn() } as never,
      undefined as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );

    const job = {
      id: 'job-skip',
      data: { vehicleId, dimoTokenId },
    } as unknown as Job<DimoSnapshotJobData>;

    await processor.process(job);

    expect(dimoTelemetry.fetchLatestVehicleSnapshot).not.toHaveBeenCalled();
    expect(prisma.vehicleLatestState.upsert).not.toHaveBeenCalled();
    expect(prisma.dimoPollLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          vehicleId,
          status: DimoPollStatus.SKIPPED,
        }),
      }),
    );
  });
});
