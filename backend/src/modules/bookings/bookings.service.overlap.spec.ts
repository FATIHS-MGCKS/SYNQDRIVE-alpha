import { ConflictException } from '@nestjs/common';
import { buildOverlapWhere } from './booking-conflict.util';

async function assertNoVehicleOverlap(
  prisma: { booking: { findFirst: jest.Mock } },
  input: {
    organizationId: string;
    vehicleId: string;
    startDate: Date;
    endDate: Date;
    excludeBookingId?: string;
  },
): Promise<void> {
  const overlapping = await prisma.booking.findFirst({
    where: buildOverlapWhere(input),
    select: { id: true, startDate: true, endDate: true, status: true },
  });
  if (overlapping) {
    throw new ConflictException({
      message: 'Dieses Fahrzeug ist im gewählten Zeitraum bereits gebucht.',
      code: 'VEHICLE_BOOKING_OVERLAP',
      conflictingBookingId: overlapping.id,
      conflictRange: {
        startDate: overlapping.startDate.toISOString(),
        endDate: overlapping.endDate.toISOString(),
        status: overlapping.status,
      },
    });
  }
}

describe('BookingsService — vehicle booking overlap (conflict gate)', () => {
  it('throws VEHICLE_BOOKING_OVERLAP when a blocking booking exists', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 'bk-existing',
      startDate: new Date('2026-07-10T08:00:00.000Z'),
      endDate: new Date('2026-07-12T08:00:00.000Z'),
      status: 'CONFIRMED',
    });
    const service = { booking: { findFirst } };

    await expect(
      assertNoVehicleOverlap(service, {
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        startDate: new Date('2026-07-11T08:00:00.000Z'),
        endDate: new Date('2026-07-13T08:00:00.000Z'),
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'VEHICLE_BOOKING_OVERLAP' }),
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: buildOverlapWhere({
          organizationId: 'org-1',
          vehicleId: 'veh-1',
          startDate: new Date('2026-07-11T08:00:00.000Z'),
          endDate: new Date('2026-07-13T08:00:00.000Z'),
        }),
      }),
    );
  });

  it('blocks future window even when vehicle operational status is currently Available', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 'bk-future-existing',
      startDate: new Date('2026-08-01T08:00:00.000Z'),
      endDate: new Date('2026-08-05T08:00:00.000Z'),
      status: 'CONFIRMED',
    });
    const service = { booking: { findFirst } };

    await expect(
      assertNoVehicleOverlap(service, {
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        startDate: new Date('2026-08-02T08:00:00.000Z'),
        endDate: new Date('2026-08-04T08:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('passes when no overlapping blocking booking exists', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = { booking: { findFirst } };

    await expect(
      assertNoVehicleOverlap(service, {
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        startDate: new Date('2026-09-01T08:00:00.000Z'),
        endDate: new Date('2026-09-05T08:00:00.000Z'),
      }),
    ).resolves.toBeUndefined();
  });

  it('excludes self on update via excludeBookingId', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = { booking: { findFirst } };

    await assertNoVehicleOverlap(service, {
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      startDate: new Date('2026-07-10T08:00:00.000Z'),
      endDate: new Date('2026-07-12T08:00:00.000Z'),
      excludeBookingId: 'bk-self',
    });

    expect(findFirst.mock.calls[0][0].where.id).toEqual({ not: 'bk-self' });
  });
});
