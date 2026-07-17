import { NotFoundException } from '@nestjs/common';
import { DrivingEventsService } from './driving-events.service';

function makePrisma() {
  return {
    vehicle: { findFirst: jest.fn() },
    drivingEvent: { findMany: jest.fn() },
  } as any;
}

describe('DrivingEventsService tenant security', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: DrivingEventsService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new DrivingEventsService(prisma);
  });

  it('rejects insights for vehicle outside organization', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);

    await expect(service.getInsights('org-a', 'veh-foreign')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.drivingEvent.findMany).not.toHaveBeenCalled();
  });

  it('groups insights by driver customer ID instead of free-text name', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'veh-1' });
    prisma.drivingEvent.findMany.mockResolvedValue([
      {
        eventType: 'HARSH_BRAKING',
        driverName: 'Legacy Label',
        trip: {
          actualDriverId: 'driver-1',
          assignedDriverId: null,
          driverName: null,
        },
      },
      {
        eventType: 'HARSH_ACCELERATION',
        driverName: 'Other Label',
        trip: {
          actualDriverId: 'driver-1',
          assignedDriverId: null,
          driverName: null,
        },
      },
    ]);

    const insights = await service.getInsights('org-a', 'veh-1');
    expect(insights.byDriver).toHaveLength(1);
    expect(insights.byDriver[0]).toMatchObject({
      driverCustomerId: 'driver-1',
      HARSH_BRAKING: 1,
      HARSH_ACCELERATION: 1,
    });
  });
});
