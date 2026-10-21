import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { VehicleOnboardingOffboardController } from '../controllers/vehicle-onboarding-offboard.controller';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';

describe('VehicleOnboardingOffboardController HTTP boundary', () => {
  const organizationId = randomUUID();
  const vehicleId = randomUUID();
  const req = { user: { id: 'master-admin-1' } } as any;

  const service = {
    offboardVehicle: jest.fn(),
  };

  const controller = new VehicleOnboardingOffboardController(service as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('invalid body missing reason → 422', async () => {
    await expect(
      controller.offboardVehicle(organizationId, vehicleId, { idempotencyKey: 'k1' }, req),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(service.offboardVehicle).not.toHaveBeenCalled();
  });

  it('invalid idempotencyKey → 422', async () => {
    await expect(
      controller.offboardVehicle(
        organizationId,
        vehicleId,
        { reason: 'OFFBOARD_SOLD', idempotencyKey: '' },
        req,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('destinationOrganizationId → rejected', async () => {
    await expect(
      controller.offboardVehicle(
        organizationId,
        vehicleId,
        {
          reason: 'OFFBOARD_SOLD',
          idempotencyKey: 'k1',
          destinationOrganizationId: randomUUID(),
        },
        req,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('CASE_NOT_FOUND → 404', async () => {
    service.offboardVehicle.mockRejectedValue(
      new VehicleOnboardingError('CASE_NOT_FOUND', 'Vehicle not found for organization'),
    );
    await expect(
      controller.offboardVehicle(
        organizationId,
        vehicleId,
        { reason: 'REMOVE_FROM_PRODUCT', idempotencyKey: 'idem-1' },
        req,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('ORGANIZATION_MISMATCH → 403', async () => {
    service.offboardVehicle.mockRejectedValue(
      new VehicleOnboardingError('ORGANIZATION_MISMATCH', 'Organization mismatch'),
    );
    await expect(
      controller.offboardVehicle(
        organizationId,
        vehicleId,
        { reason: 'REMOVE_FROM_PRODUCT', idempotencyKey: 'idem-2' },
        req,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('OFFBOARD_OPERATIONALLY_BLOCKED → 409', async () => {
    service.offboardVehicle.mockRejectedValue(
      new VehicleOnboardingError('OFFBOARD_OPERATIONALLY_BLOCKED', 'blocked', {
        blockingReasons: ['ACTIVE_RENTAL'],
      }),
    );
    await expect(
      controller.offboardVehicle(
        organizationId,
        vehicleId,
        { reason: 'ADMINISTRATIVE_OFFBOARD', idempotencyKey: 'idem-3' },
        req,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('valid offboard delegates with route scope and actor', async () => {
    const offboardedAt = new Date();
    service.offboardVehicle.mockResolvedValue({
      vehicleId,
      organizationId,
      registryLifecycle: 'OFFBOARDED',
      offboardedAt,
      reason: 'OFFBOARD_SOLD',
      idempotentReplay: false,
      warnings: [],
    });
    const res = await controller.offboardVehicle(
      organizationId,
      vehicleId,
      { reason: 'OFFBOARD_SOLD', idempotencyKey: 'stable-key' },
      req,
    );
    expect(service.offboardVehicle).toHaveBeenCalledWith({
      organizationId,
      vehicleId,
      reason: 'OFFBOARD_SOLD',
      idempotencyKey: 'stable-key',
      actorUserId: 'master-admin-1',
      note: undefined,
    });
    expect(res).toMatchObject({
      vehicleId,
      organizationId,
      registryLifecycle: 'OFFBOARDED',
      idempotentReplay: false,
    });
  });
});
