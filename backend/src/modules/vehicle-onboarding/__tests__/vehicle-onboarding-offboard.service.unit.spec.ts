import { randomUUID } from 'node:crypto';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import { VehicleOnboardingOffboardService } from '../services/vehicle-onboarding-offboard.service';

describe('VehicleOnboardingOffboardService', () => {
  const preflight = {
    assess: jest.fn(),
    assertBlockingAbsentInTransaction: jest.fn(),
  };
  const offboarding = {
    offboardVehicle: jest.fn(),
  };
  const svc = new VehicleOnboardingOffboardService(preflight as any, offboarding as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects when preflight blocks', async () => {
    preflight.assess.mockResolvedValue({
      allowed: false,
      blockingReasons: ['ONGOING_TRIP'],
      warnings: [],
    });
    await expect(
      svc.offboardVehicle({
        organizationId: randomUUID(),
        vehicleId: randomUUID(),
        reason: 'OFFBOARD_SOLD',
        actorUserId: 'actor',
        idempotencyKey: 'k1',
      }),
    ).rejects.toMatchObject({ code: 'OFFBOARD_OPERATIONALLY_BLOCKED' });
    expect(offboarding.offboardVehicle).not.toHaveBeenCalled();
  });

  it('passes operationalGate into offboarding authority', async () => {
    preflight.assess.mockResolvedValue({ allowed: true, blockingReasons: [], warnings: [] });
    const offboardedAt = new Date();
    offboarding.offboardVehicle.mockResolvedValue({
      vehicleId: 'v1',
      organizationId: 'o1',
      registryLifecycle: 'OFFBOARDED',
      offboardedAt,
      idempotentReplay: false,
    });
    await svc.offboardVehicle({
      organizationId: 'o1',
      vehicleId: 'v1',
      reason: 'REMOVE_FROM_PRODUCT',
      actorUserId: 'actor',
      idempotencyKey: 'k2',
    });
    expect(offboarding.offboardVehicle).toHaveBeenCalledWith(
      expect.objectContaining({
        operationalGate: expect.any(Function),
      }),
    );
  });

  it('requires actorUserId', async () => {
    await expect(
      svc.offboardVehicle({
        organizationId: 'o1',
        vehicleId: 'v1',
        reason: 'REMOVE_FROM_PRODUCT',
        actorUserId: null,
        idempotencyKey: 'k3',
      }),
    ).rejects.toBeInstanceOf(VehicleOnboardingError);
  });
});
