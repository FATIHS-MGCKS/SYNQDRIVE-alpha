import { BookingsService } from './bookings.service';
import { ListBookingsQueryDto } from './dto/list-bookings-query.dto';
import { PrismaService } from '@shared/database/prisma.service';

function createListServiceHarness(bookingRows: Array<Record<string, unknown>>) {
  const prisma = {
    booking: {
      findMany: jest.fn().mockImplementation(({ skip, take }) => {
        const start = skip ?? 0;
        const end = start + take;
        return Promise.resolve(bookingRows.slice(start, end));
      }),
      count: jest.fn().mockResolvedValue(bookingRows.length),
    },
    station: { findMany: jest.fn().mockResolvedValue([]) },
    bookingHandoverProtocol: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;

  const service = Object.create(BookingsService.prototype) as BookingsService;
  Object.assign(service, {
    prisma,
    loadProtocolsMap: jest.fn().mockResolvedValue(new Map()),
    mapBookingListRow: jest.fn((b: { id: string }) => ({ id: b.id })),
  });
  return { service, prisma };
}

function makeBooking(id: string, startIso: string, endIso: string, vehicleId = 'veh-1') {
  return {
    id,
    organizationId: 'org-1',
    vehicleId,
    customerId: 'cust-1',
    pickupStationId: null,
    returnStationId: null,
    startDate: new Date(startIso),
    endDate: new Date(endIso),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    status: 'CONFIRMED',
    customer: { firstName: 'Max', lastName: 'Muster' },
    vehicle: { make: 'VW', model: 'Golf', licensePlate: 'B-XY 1', vehicleName: null },
    dailyRateCents: 1000,
    totalPriceCents: 5000,
    currency: 'eur',
    kmIncluded: 500,
    kmDriven: 0,
    notes: null,
    insuranceOptions: [],
    extrasJson: [],
    isOneWayRental: false,
    actualPickupStationId: null,
    actualReturnStationId: null,
  };
}

describe('BookingsService.findAll pagination', () => {
  it('returns totalCount, hasNextPage, and stable page slices for large orgs', async () => {
    const rows = Array.from({ length: 120 }, (_, i) =>
      makeBooking(
        `booking-${String(i).padStart(3, '0')}`,
        `2026-07-${String((i % 28) + 1).padStart(2, '0')}T10:00:00.000Z`,
        `2026-07-${String((i % 28) + 2).padStart(2, '0')}T10:00:00.000Z`,
      ),
    );
    const { service } = createListServiceHarness(rows);

    const page1 = await service.findAll(
      'org-1',
      Object.assign(new ListBookingsQueryDto(), { page: 1, limit: 50 }),
    );

    expect(page1.meta.total).toBe(120);
    expect(page1.data).toHaveLength(50);
    expect(page1.meta.hasNextPage).toBe(true);
    expect(page1.meta.nextCursor).toBeTruthy();

    const page3 = await service.findAll(
      'org-1',
      Object.assign(new ListBookingsQueryDto(), { page: 3, limit: 50 }),
    );
    expect(page3.data).toHaveLength(20);
    expect(page3.meta.hasNextPage).toBe(false);
    expect(page3.meta.totalPages).toBe(3);
  });

  it('applies half-open range overlap filters via buildBookingListWhere', async () => {
    const rows = [
      makeBooking('inside', '2026-07-10T10:00:00.000Z', '2026-07-12T10:00:00.000Z'),
      makeBooking('outside', '2026-08-10T10:00:00.000Z', '2026-08-12T10:00:00.000Z'),
    ];
    const { service, prisma } = createListServiceHarness(rows);

    await service.findAll(
      'org-1',
      Object.assign(new ListBookingsQueryDto(), {
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-08-01T00:00:00.000Z',
        limit: 50,
      }),
    );

    const where = (prisma.booking.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where).toEqual(
      expect.objectContaining({
        AND: expect.arrayContaining([
          { organizationId: 'org-1' },
          { startDate: { lt: new Date('2026-08-01T00:00:00.000Z') } },
          { endDate: { gte: new Date('2026-07-01T00:00:00.000Z') } },
        ]),
      }),
    );
  });
});
