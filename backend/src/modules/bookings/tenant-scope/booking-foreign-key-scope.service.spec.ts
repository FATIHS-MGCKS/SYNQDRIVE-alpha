import { NotFoundException } from '@nestjs/common';
import { BookingForeignKeyScopeService } from './booking-foreign-key-scope.service';
import { BOOKING_TENANT_SCOPE_ERROR_CODE } from './booking-tenant-scope.constants';

describe('BookingForeignKeyScopeService', () => {
  function buildService(prisma: {
    customer: { findFirst: jest.Mock };
    vehicle: { findFirst: jest.Mock; updateMany: jest.Mock };
    station: { findFirst: jest.Mock; count: jest.Mock; findMany: jest.Mock };
    booking: { findFirst: jest.Mock; updateMany: jest.Mock };
    organizationMembership: { findFirst: jest.Mock };
    orgInvoice: { findFirst: jest.Mock };
    vehicleDamage: { updateMany: jest.Mock };
  }) {
    return new BookingForeignKeyScopeService(prisma as never);
  }

  it('rejects cross-tenant customer id', async () => {
    const prisma = {
      customer: { findFirst: jest.fn().mockResolvedValue(null) },
      vehicle: { findFirst: jest.fn(), updateMany: jest.fn() },
      station: { findFirst: jest.fn(), count: jest.fn(), findMany: jest.fn() },
      booking: { findFirst: jest.fn(), updateMany: jest.fn() },
      organizationMembership: { findFirst: jest.fn() },
      orgInvoice: { findFirst: jest.fn() },
      vehicleDamage: { updateMany: jest.fn() },
    };
    const service = buildService(prisma);

    await expect(service.assertCustomer('org-a', 'customer-from-org-b')).rejects.toMatchObject({
      response: { code: BOOKING_TENANT_SCOPE_ERROR_CODE },
    });
    expect(prisma.customer.findFirst).toHaveBeenCalledWith({
      where: { id: 'customer-from-org-b', organizationId: 'org-a' },
      select: { id: true },
    });
  });

  it('rejects cross-tenant vehicle id', async () => {
    const prisma = {
      customer: { findFirst: jest.fn() },
      vehicle: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn() },
      station: { findFirst: jest.fn(), count: jest.fn(), findMany: jest.fn() },
      booking: { findFirst: jest.fn(), updateMany: jest.fn() },
      organizationMembership: { findFirst: jest.fn() },
      orgInvoice: { findFirst: jest.fn() },
      vehicleDamage: { updateMany: jest.fn() },
    };
    const service = buildService(prisma);

    await expect(service.assertVehicle('org-a', 'vehicle-from-org-b')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects when not all stations belong to org', async () => {
    const prisma = {
      customer: { findFirst: jest.fn() },
      vehicle: { findFirst: jest.fn(), updateMany: jest.fn() },
      station: {
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn(),
      },
      booking: { findFirst: jest.fn(), updateMany: jest.fn() },
      organizationMembership: { findFirst: jest.fn() },
      orgInvoice: { findFirst: jest.fn() },
      vehicleDamage: { updateMany: jest.fn() },
    };
    const service = buildService(prisma);

    await expect(
      service.assertStations('org-a', ['station-1', 'station-foreign']),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assertBookingForeignKeys validates all provided refs', async () => {
    const prisma = {
      customer: { findFirst: jest.fn().mockResolvedValue({ id: 'c1' }) },
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({ id: 'v1' }),
        updateMany: jest.fn(),
      },
      station: {
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn(),
      },
      booking: { findFirst: jest.fn(), updateMany: jest.fn() },
      organizationMembership: { findFirst: jest.fn() },
      orgInvoice: { findFirst: jest.fn() },
      vehicleDamage: { updateMany: jest.fn() },
    };
    const service = buildService(prisma);

    await service.assertBookingForeignKeys('org-a', {
      customerId: 'c1',
      vehicleId: 'v1',
      stationIds: ['s1'],
    });

    expect(prisma.customer.findFirst).toHaveBeenCalled();
    expect(prisma.vehicle.findFirst).toHaveBeenCalled();
    expect(prisma.station.count).toHaveBeenCalled();
  });

  it('updateBookingScoped fails for cross-tenant booking id', async () => {
    const prisma = {
      customer: { findFirst: jest.fn() },
      vehicle: { findFirst: jest.fn(), updateMany: jest.fn() },
      station: { findFirst: jest.fn(), count: jest.fn(), findMany: jest.fn() },
      booking: {
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      organizationMembership: { findFirst: jest.fn() },
      orgInvoice: { findFirst: jest.fn() },
      vehicleDamage: { updateMany: jest.fn() },
    };
    const service = buildService(prisma);

    await expect(
      service.updateBookingScoped('org-a', 'booking-from-org-b', { notes: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
