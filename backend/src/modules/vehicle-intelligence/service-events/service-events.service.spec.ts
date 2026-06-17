import { NotFoundException } from '@nestjs/common';
import { ServiceEventOrigin } from '@prisma/client';
import { ServiceEventsService } from './service-events.service';

const vehicleId = 'veh-1';
const otherVehicleId = 'veh-2';
const eventId = 'evt-1';

function makePrisma() {
  return {
    vehicleServiceEvent: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    vehicle: {
      update: jest.fn().mockResolvedValue({}),
    },
  } as any;
}

describe('ServiceEventsService', () => {
  it('update rejects when event belongs to another vehicle', async () => {
    const prisma = makePrisma();
    prisma.vehicleServiceEvent.findFirst.mockResolvedValue(null);
    const svc = new ServiceEventsService(prisma);

    await expect(
      svc.update(vehicleId, eventId, { notes: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.vehicleServiceEvent.findFirst).toHaveBeenCalledWith({
      where: { id: eventId, vehicleId },
    });
    expect(prisma.vehicleServiceEvent.update).not.toHaveBeenCalled();
  });

  it('update succeeds only for matching vehicleId', async () => {
    const prisma = makePrisma();
    prisma.vehicleServiceEvent.findFirst.mockResolvedValue({
      id: eventId,
      vehicleId,
      eventType: 'REPAIR',
    });
    prisma.vehicleServiceEvent.update.mockResolvedValue({
      id: eventId,
      vehicleId,
      notes: 'fixed',
    });
    prisma.vehicleServiceEvent.findFirst
      .mockResolvedValueOnce({ id: eventId, vehicleId, eventType: 'REPAIR' })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const svc = new ServiceEventsService(prisma);
    const result = await svc.update(vehicleId, eventId, { notes: 'fixed' }, { userId: 'u1' });

    expect(result.notes).toBe('fixed');
    expect(prisma.vehicleServiceEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: eventId },
        data: expect.objectContaining({ notes: 'fixed', updatedById: 'u1' }),
      }),
    );
  });

  it('delete uses deleteMany with vehicleId scope', async () => {
    const prisma = makePrisma();
    prisma.vehicleServiceEvent.deleteMany.mockResolvedValue({ count: 0 });
    const svc = new ServiceEventsService(prisma);

    await expect(svc.remove(vehicleId, eventId)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.vehicleServiceEvent.deleteMany).toHaveBeenCalledWith({
      where: { id: eventId, vehicleId },
    });
  });

  it('create does not set next-service fields on vehicle — only history denorm', async () => {
    const prisma = makePrisma();
    prisma.vehicleServiceEvent.create.mockResolvedValue({ id: eventId, vehicleId });
    prisma.vehicleServiceEvent.findFirst.mockResolvedValue(null);

    const svc = new ServiceEventsService(prisma);
    await svc.create(
      vehicleId,
      {
        eventType: 'REPAIR',
        eventDate: '2026-06-01T00:00:00.000Z',
        odometerKm: 12000,
      },
      { userId: 'u1', origin: ServiceEventOrigin.MANUAL },
    );

    expect(prisma.vehicle.update).toHaveBeenCalledWith({
      where: { id: vehicleId },
      data: expect.objectContaining({
        lastServiceDate: null,
        lastServiceOdometerKm: null,
      }),
    });
    expect(prisma.vehicle.update.mock.calls[0][0].data).not.toHaveProperty('nextServiceDueDate');
  });

  it('refreshVehicleHistoryDenorm uses only FULL_SERVICE / GENERAL_INSPECTION', async () => {
    const prisma = makePrisma();
    prisma.vehicleServiceEvent.findFirst
      .mockResolvedValueOnce({
        eventDate: new Date('2026-05-01'),
        odometerKm: 50000,
      })
      .mockResolvedValueOnce(null);

    const svc = new ServiceEventsService(prisma);
    await svc.refreshVehicleHistoryDenorm(vehicleId);

    expect(prisma.vehicleServiceEvent.findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          vehicleId,
          eventType: { in: ['FULL_SERVICE', 'GENERAL_INSPECTION'] },
        }),
      }),
    );
    expect(prisma.vehicle.update).toHaveBeenCalledWith({
      where: { id: vehicleId },
      data: {
        lastServiceDate: new Date('2026-05-01'),
        lastServiceOdometerKm: 50000,
        lastOilChangeDate: null,
        lastOilChangeOdometerKm: null,
      },
    });
  });
});

describe('Service event DTO validation', () => {
  it('rejects negative odometer and cost', async () => {
    const { validate } = await import('class-validator');
    const { plainToInstance } = await import('class-transformer');
    const { CreateVehicleServiceEventDto } = await import('./dto/create-vehicle-service-event.dto');

    const dto = plainToInstance(CreateVehicleServiceEventDto, {
      eventType: 'REPAIR',
      eventDate: '2026-06-01',
      odometerKm: -1,
      costCents: -5,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects invalid event type', async () => {
    const { validate } = await import('class-validator');
    const { plainToInstance } = await import('class-transformer');
    const { CreateVehicleServiceEventDto } = await import('./dto/create-vehicle-service-event.dto');

    const dto = plainToInstance(CreateVehicleServiceEventDto, {
      eventType: 'NOT_A_REAL_TYPE',
      eventDate: '2026-06-01',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'eventType')).toBe(true);
  });
});
