import { BrakeInitializationWorkflowService } from './brake-initialization-workflow.service';
import { BrakeLifecycleService } from './brake-lifecycle.service';

const mockPrisma = {
  brakeHealthCurrent: {
    findUnique: jest.fn(),
  },
} as any;

const mockLifecycle = {
  initializeFromRegistration: jest.fn(),
} as any;

const svc = new BrakeInitializationWorkflowService(mockPrisma, mockLifecycle as BrakeLifecycleService);

describe('BrakeInitializationWorkflowService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.brakeHealthCurrent.findUnique.mockResolvedValue(null);
  });

  const baseInput = {
    vehicleId: 'veh-1',
    organizationId: 'org-1',
    brakes: { condition: 'NEW' as const, odometerKm: 1200 },
    registrationMileageKm: 1200,
    latestStateOdometerKm: 1200,
  };

  it('direct registration initializes via BrakeLifecycleService', async () => {
    mockLifecycle.initializeFromRegistration.mockResolvedValue({
      initialized: true,
      status: 'initialized',
      message: 'ok',
      serviceEventId: 'evt-1',
    });

    const result = await svc.initializeFromRegistration(baseInput);

    expect(result.outcome).toBe('initialized');
    expect(result.initialized).toBe(true);
    expect(mockLifecycle.initializeFromRegistration).toHaveBeenCalledTimes(1);
  });

  it('duplicate registration is idempotent when baseline already initialized', async () => {
    mockPrisma.brakeHealthCurrent.findUnique.mockResolvedValue({ isInitialized: true });

    const result = await svc.initializeFromRegistration(baseInput);

    expect(result.outcome).toBe('already_initialized');
    expect(result.skipped).toBe(true);
    expect(mockLifecycle.initializeFromRegistration).not.toHaveBeenCalled();
  });

  it('retry after failure does not claim initialized when lifecycle throws', async () => {
    mockLifecycle.initializeFromRegistration.mockRejectedValue(new Error('db unavailable'));

    const first = await svc.initializeFromRegistration(baseInput);
    const second = await svc.initializeFromRegistration(baseInput);

    expect(first.outcome).toBe('failed');
    expect(first.initialized).toBe(false);
    expect(second.outcome).toBe('failed');
    expect(mockLifecycle.initializeFromRegistration).toHaveBeenCalledTimes(2);
  });

  it('skips when registration payload is not eligible', async () => {
    const result = await svc.initializeFromRegistration({
      ...baseInput,
      brakes: { condition: 'USED' },
    });

    expect(result.outcome).toBe('skipped_not_eligible');
    expect(mockLifecycle.initializeFromRegistration).not.toHaveBeenCalled();
  });

  it('skips when odometer anchor is missing', async () => {
    const result = await svc.initializeFromRegistration({
      ...baseInput,
      brakes: { condition: 'USED', frontPadThickness: 8.5 },
      registrationMileageKm: null,
      latestStateOdometerKm: null,
    });

    expect(result.outcome).toBe('skipped_no_odometer');
    expect(mockLifecycle.initializeFromRegistration).not.toHaveBeenCalled();
  });
});
