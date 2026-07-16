import { BatteryCapabilityRefreshService } from './battery-capability-refresh.service';
import { BatteryCapabilityRefreshTrigger } from './battery-capability-lifecycle.policy';

describe('BatteryCapabilityRefreshService', () => {
  const prisma = {
    vehicle: { findFirst: jest.fn() },
    vehicleBatteryCapability: { findMany: jest.fn() },
  };
  const jobProducer = { enqueue: jest.fn() };

  const service = new BatteryCapabilityRefreshService(
    prisma as never,
    jobProducer as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    jobProducer.enqueue.mockResolvedValue('job-1');
  });

  it('enqueues HV_CAPABILITY_REFRESH with trigger metadata', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({
      dimoVehicle: { tokenId: 42 },
    });

    const jobId = await service.enqueueForDimoVehicle(
      'org-1',
      'veh-1',
      BatteryCapabilityRefreshTrigger.DIMO_INTEGRATION,
    );

    expect(jobId).toBe('job-1');
    expect(jobProducer.enqueue).toHaveBeenCalledWith(
      'HV_CAPABILITY_REFRESH',
      expect.objectContaining({
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        refreshTrigger: BatteryCapabilityRefreshTrigger.DIMO_INTEGRATION,
        idempotencyKey: expect.stringContaining('cap-refresh:veh-1'),
      }),
      expect.any(Object),
    );
  });

  it('skips enqueue without DIMO token', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({ dimoVehicle: null });

    const jobId = await service.enqueueForDimoVehicle(
      'org-1',
      'veh-1',
      BatteryCapabilityRefreshTrigger.VEHICLE_REGISTRATION,
    );

    expect(jobId).toBeNull();
    expect(jobProducer.enqueue).not.toHaveBeenCalled();
  });
});
