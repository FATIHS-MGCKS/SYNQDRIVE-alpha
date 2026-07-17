import { BadRequestException } from '@nestjs/common';
import { BookingAllowedDriversService } from './booking-allowed-drivers.service';

function makePrisma() {
  return {
    booking: { findFirst: jest.fn() },
    customer: { findFirst: jest.fn() },
    bookingAllowedDriver: {
      findUnique: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
    },
  } as any;
}

describe('BookingAllowedDriversService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let activityLog: { log: jest.Mock };
  let service: BookingAllowedDriversService;

  beforeEach(() => {
    prisma = makePrisma();
    activityLog = { log: jest.fn().mockResolvedValue({}) };
    service = new BookingAllowedDriversService(prisma, activityLog as any);
  });

  it('rejects adding contract holder as additional driver', async () => {
    prisma.booking.findFirst.mockResolvedValue({
      id: 'book-1',
      customerId: 'cust-contract',
      assignedDriverId: null,
    });

    await expect(
      service.addAdditionalDriver({
        organizationId: 'org-1',
        bookingId: 'book-1',
        customerId: 'cust-contract',
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('adds additional driver with audit log', async () => {
    prisma.booking.findFirst.mockResolvedValue({
      id: 'book-1',
      customerId: 'cust-contract',
      assignedDriverId: 'driver-main',
    });
    prisma.customer.findFirst.mockResolvedValue({
      id: 'driver-extra',
      firstName: 'Extra',
      lastName: 'Driver',
    });
    prisma.bookingAllowedDriver.findUnique.mockResolvedValue(null);
    prisma.bookingAllowedDriver.create.mockResolvedValue({
      id: 'row-1',
      customerId: 'driver-extra',
      role: 'ADDITIONAL',
      addedByUserId: 'user-1',
      createdAt: new Date(),
      customer: { firstName: 'Extra', lastName: 'Driver', email: 'extra@example.com' },
    });
    prisma.bookingAllowedDriver.findMany.mockResolvedValue([
      {
        id: 'row-1',
        customerId: 'driver-extra',
        role: 'ADDITIONAL',
        addedByUserId: 'user-1',
        createdAt: new Date(),
        customer: { firstName: 'Extra', lastName: 'Driver', email: 'extra@example.com' },
      },
    ]);

    const result = await service.addAdditionalDriver({
      organizationId: 'org-1',
      bookingId: 'book-1',
      customerId: 'driver-extra',
      userId: 'user-1',
    });

    expect(result.customerId).toBe('driver-extra');
    expect(activityLog.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        entity: 'BOOKING',
        metaJson: expect.objectContaining({ kind: 'BOOKING_ALLOWED_DRIVER_ADD' }),
      }),
    );
  });
});
