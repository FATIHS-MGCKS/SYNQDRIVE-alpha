import { VehicleCleaningTaskService } from './vehicle-cleaning-task.service';
import { TasksService } from './tasks.service';
import { createNoopTaskAutomationOutboxDeps } from './outbox/task-automation-outbox-test.util';
import { createDefaultTaskAutomationRuleResolverMock } from './automation/task-automation-rule-resolver.test.util';

describe('VehicleCleaningTaskService', () => {
  const prisma = {
    vehicle: { findFirst: jest.fn() },
    orgTask: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    booking: { findFirst: jest.fn() },
    organization: { findUnique: jest.fn() },
  };
  const tasks = {
    upsertByDedup: jest.fn(),
    getTaskById: jest.fn(),
    autoResolveTask: jest.fn(),
    supersedeLegacyBookingCleanTasks: jest.fn().mockResolvedValue(0),
    supersedeTask: jest.fn(),
    updateTaskTiming: jest.fn(),
  };

  let svc: VehicleCleaningTaskService;

  beforeEach(() => {
    jest.clearAllMocks();
    const { outboxEnqueue, outboxContext } = createNoopTaskAutomationOutboxDeps();
    svc = new VehicleCleaningTaskService(
      prisma as any,
      tasks as unknown as TasksService,
      outboxEnqueue,
      outboxContext,
      createDefaultTaskAutomationRuleResolverMock(),
    );
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'v1',
      licensePlate: 'M-AB 123',
      make: 'VW',
      model: 'Golf',
      organizationId: 'org1',
      cleaningStatus: 'NEEDS_CLEANING',
    });
    prisma.booking.findFirst.mockResolvedValue(null);
    prisma.orgTask.findMany.mockResolvedValue([]);
    prisma.organization.findUnique.mockResolvedValue({ timezone: 'Europe/Berlin' });
    tasks.supersedeLegacyBookingCleanTasks.mockResolvedValue(0);
  });

  it('returns existing when an open cleaning task is already present', async () => {
    prisma.orgTask.findMany.mockResolvedValue([{ id: 't-open', dedupKey: null, metadata: {} }]);
    tasks.getTaskById.mockResolvedValue({ id: 't-open' });

    const res = await svc.ensureCleaningTask('org1', 'v1');

    expect(res.action).toBe('existing');
    expect(res.taskId).toBe('t-open');
    expect(tasks.upsertByDedup).not.toHaveBeenCalled();
    expect(prisma.orgTask.update).toHaveBeenCalled();
  });

  it('creates a deduplicated cleaning task with canonical pre-booking key when none is open', async () => {
    prisma.orgTask.findMany.mockResolvedValue([]);
    tasks.upsertByDedup.mockResolvedValue({ id: 't-new' });

    const res = await svc.ensureCleaningTask('org1', 'v1');

    expect(res.action).toBe('created');
    expect(tasks.upsertByDedup).toHaveBeenCalledWith(
      'org1',
      'vehicle:cleaning:v1:standalone',
      expect.objectContaining({
        type: 'VEHICLE_CLEANING',
        source: 'VEHICLE_CLEANING',
        vehicleId: 'v1',
        blocksVehicleAvailability: true,
      }),
    );
  });

  it('does not materialise on booking context sync when vehicle is clean and no open task', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'v1',
      licensePlate: 'M-AB 123',
      make: 'VW',
      model: 'Golf',
      organizationId: 'org1',
      cleaningStatus: 'CLEAN',
    });

    const res = await svc.syncBookingPreparationContext({
      id: 'b1',
      organizationId: 'org1',
      vehicleId: 'v1',
      customerId: 'c1',
      status: 'CONFIRMED',
      startDate: new Date('2026-07-25T10:00:00.000Z'),
      endDate: new Date('2026-07-28T10:00:00.000Z'),
    });

    expect(res.action).toBe('none');
    expect(tasks.upsertByDedup).not.toHaveBeenCalled();
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
