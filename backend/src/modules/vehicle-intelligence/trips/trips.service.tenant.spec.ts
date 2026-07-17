import { NotFoundException } from '@nestjs/common';
import { TripsService } from './trips.service';

function makePrisma() {
  return {
    vehicle: { findFirst: jest.fn() },
    vehicleTrip: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn(), aggregate: jest.fn() },
    tripDrivingImpact: { aggregate: jest.fn() },
  } as any;
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new TripsService(
    prisma,
    {} as any,
    {} as any,
    {} as any,
  );
}

describe('TripsService tenant security', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: TripsService;

  beforeEach(() => {
    prisma = makePrisma();
    service = makeService(prisma);
  });

  it('rejects findByVehicle for foreign organization', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);

    await expect(service.findByVehicle('org-a', 'veh-foreign')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.vehicleTrip.findMany).not.toHaveBeenCalled();
  });

  it('rejects findById for foreign organization trip', async () => {
    prisma.vehicleTrip.findFirst.mockResolvedValue(null);

    await expect(service.findById('org-a', 'trip-foreign')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('scopes findByVehicle queries through organization relation', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'veh-1' });
    prisma.vehicleTrip.findMany.mockResolvedValue([]);

    await service.findByVehicle('org-a', 'veh-1', {
      driverCustomerId: 'driver-uuid-1',
    });

    expect(prisma.vehicleTrip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          vehicleId: 'veh-1',
          vehicle: { organizationId: 'org-a' },
          OR: expect.arrayContaining([
            { actualDriverId: 'driver-uuid-1' },
          ]),
        }),
      }),
    );
  });
});
