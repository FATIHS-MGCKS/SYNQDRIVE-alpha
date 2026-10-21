import { ConflictException } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import {
  LEGACY_VEHICLE_DELETE_DISABLED_ACTION,
  LEGACY_VEHICLE_DESTRUCTION_DISABLED_CODE,
  legacyVehicleDeleteDisabledException,
} from './legacy-vehicle-destruction.errors';

describe('VO5C-P2B3 VehiclesService.delete fail-closed', () => {
  function serviceWithMocks() {
    const prisma = {
      vehicle: {
        findFirstOrThrow: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        update: jest.fn(),
      },
    };
    const billingQuantity = { onVehicleRemoved: jest.fn() };
    const service = Object.create(VehiclesService.prototype) as VehiclesService;
    Object.assign(service, {
      prisma,
      billingQuantity,
      logger: { warn: jest.fn(), log: jest.fn() },
    });
    return { service, prisma, billingQuantity };
  }

  it('stable 409 delete retirement contract', () => {
    const err = legacyVehicleDeleteDisabledException();
    expect(err.getResponse()).toMatchObject({
      code: LEGACY_VEHICLE_DESTRUCTION_DISABLED_CODE,
      action: LEGACY_VEHICLE_DELETE_DISABLED_ACTION,
    });
  });

  it('never touches prisma or billing', async () => {
    const { service, prisma, billingQuantity } = serviceWithMocks();
    await expect(service.delete('veh-1', 'org-1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.vehicle.findFirstOrThrow).not.toHaveBeenCalled();
    expect(prisma.vehicle.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(prisma.vehicle.delete).not.toHaveBeenCalled();
    expect(billingQuantity.onVehicleRemoved).not.toHaveBeenCalled();
  });
});
