import { VehicleFindingSourceType } from '@prisma/client';
import { FindingLifecycleService } from './finding-lifecycle.service';

describe('FindingLifecycleService', () => {
  const prisma = {
    vehicleFinding: {
      upsert: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  let service: FindingLifecycleService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FindingLifecycleService(prisma as any);
  });

  it('upserts active findings by org+dedupeKey', async () => {
    prisma.vehicleFinding.upsert.mockResolvedValue({ id: 'f-1' });
    await service.upsertActiveFinding({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      sourceType: VehicleFindingSourceType.DTC,
      dedupeKey: 'dtc:veh-1:P0420',
      title: 'P0420',
    });
    expect(prisma.vehicleFinding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_dedupeKey: {
            organizationId: 'org-1',
            dedupeKey: 'dtc:veh-1:P0420',
          },
        },
      }),
    );
  });
});
