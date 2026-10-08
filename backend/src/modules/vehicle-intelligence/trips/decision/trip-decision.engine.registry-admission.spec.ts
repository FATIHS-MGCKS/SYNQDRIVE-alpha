import { BadRequestException } from '@nestjs/common';
import { TripDecisionEngine } from './trip-decision.engine';
import { VEHICLE_REGISTRY_NOT_OPERATIONAL_CODE } from '@modules/vehicles/registry/vehicle-registry-admission';

describe('TripDecisionEngine registry admission', () => {
  it('rejects createTrip when vehicle registry is OFFBOARDED', async () => {
    const prisma = {
      vehicle: {
        findUnique: jest.fn().mockResolvedValue({ registryLifecycle: 'OFFBOARDED' }),
      },
      vehicleTrip: { create: jest.fn() },
    };
    const engine = new TripDecisionEngine(prisma as any);
    try {
      await engine.createTrip({
        vehicleId: 'veh-1',
        organizationId: null,
        startTime: new Date(),
      });
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: VEHICLE_REGISTRY_NOT_OPERATIONAL_CODE,
      });
    }
    expect(prisma.vehicleTrip.create).not.toHaveBeenCalled();
  });

  it('allows createTrip when vehicle registry is ACTIVE', async () => {
    const prisma = {
      vehicle: {
        findUnique: jest.fn().mockResolvedValue({ registryLifecycle: 'ACTIVE' }),
      },
      vehicleTrip: {
        create: jest.fn().mockResolvedValue({
          id: 'trip-1',
          vehicleId: 'veh-1',
          tripStatus: 'ONGOING',
          startTime: new Date(),
          tripSource: 'V2_LIVE',
        }),
      },
    };
    const engine = new TripDecisionEngine(prisma as any);
    await engine.createTrip({
      vehicleId: 'veh-1',
      organizationId: 'org-1',
      startTime: new Date(),
    });
    expect(prisma.vehicleTrip.create).toHaveBeenCalled();
  });
});
