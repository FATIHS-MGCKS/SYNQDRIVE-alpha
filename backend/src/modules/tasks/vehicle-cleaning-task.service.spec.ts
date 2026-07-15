import { VehicleCleaningTaskService } from './vehicle-cleaning-task.service';
import { TasksService } from './tasks.service';

describe('VehicleCleaningTaskService', () => {
  const prisma = {
    vehicle: { findFirst: jest.fn() },
    orgTask: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    booking: { findFirst: jest.fn() },
  };
  const tasks = {
    upsertByDedup: jest.fn(),
    getTaskById: jest.fn(),
    autoResolveTask: jest.fn(),
  };

  let svc: VehicleCleaningTaskService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = new VehicleCleaningTaskService(prisma as any, tasks as unknown as TasksService);
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'v1',
      licensePlate: 'M-AB 123',
      make: 'VW',
      model: 'Golf',
      organizationId: 'org1',
    });
    prisma.booking.findFirst.mockResolvedValue(null);
  });

  it('returns existing when an open cleaning task is already present', async () => {
    prisma.orgTask.findFirst.mockResolvedValue({ id: 't-open', dedupKey: null });
    tasks.getTaskById.mockResolvedValue({ id: 't-open' });

    const res = await svc.ensureCleaningTask('org1', 'v1');

    expect(res.action).toBe('existing');
    expect(res.taskId).toBe('t-open');
    expect(tasks.upsertByDedup).not.toHaveBeenCalled();
    expect(prisma.orgTask.update).toHaveBeenCalledWith({
      where: { id: 't-open' },
      data: { dedupKey: 'vehicle:cleaning:v1' },
    });
  });

  it('creates a deduplicated cleaning task when none is open', async () => {
    prisma.orgTask.findFirst.mockResolvedValue(null);
    tasks.upsertByDedup.mockResolvedValue({ id: 't-new' });

    const res = await svc.ensureCleaningTask('org1', 'v1');

    expect(res.action).toBe('created');
    expect(tasks.upsertByDedup).toHaveBeenCalledWith(
      'org1',
      'vehicle:cleaning:v1',
      expect.objectContaining({
        type: 'VEHICLE_CLEANING',
        source: 'VEHICLE_CLEANING',
        vehicleId: 'v1',
        blocksVehicleAvailability: true,
      }),
    );
  });

  it('auto-resolves open cleaning tasks when vehicle is marked clean', async () => {
    prisma.orgTask.findMany.mockResolvedValue([{ id: 't1' }, { id: 't2' }]);
    tasks.autoResolveTask.mockResolvedValue({ id: 't1', status: 'DONE', completionMode: 'AUTO_RESOLVED' });

    const res = await svc.completeOpenCleaningTasks('org1', 'v1', 'u1');

    expect(res.action).toBe('completed');
    expect(res.completedCount).toBe(2);
    expect(tasks.autoResolveTask).toHaveBeenCalledTimes(2);
    expect(tasks.autoResolveTask).toHaveBeenCalledWith('org1', 't1', {
      resolutionCode: 'VEHICLE_CLEANED',
      reason: 'Vehicle marked as clean',
      metadata: {
        ruleId: 'vehicle.cleaning_auto_resolve',
        vehicleId: 'v1',
        triggeredByUserId: 'u1',
      },
    });
  });
});
