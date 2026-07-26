import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@shared/database/prisma.service';
import { resolveEntityAvailability } from './notification-entity-availability.enricher';

describe('notification-entity-availability.enricher', () => {
  let prisma: {
    vehicle: { findMany: jest.Mock };
    station: { findMany: jest.Mock };
    booking: { findMany: jest.Mock };
    customer: { findMany: jest.Mock };
    orgInvoice: { findMany: jest.Mock };
    vehicleTrip: { findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      vehicle: { findMany: jest.fn().mockResolvedValue([]) },
      station: { findMany: jest.fn().mockResolvedValue([]) },
      booking: { findMany: jest.fn().mockResolvedValue([]) },
      customer: { findMany: jest.fn().mockResolvedValue([]) },
      orgInvoice: { findMany: jest.fn().mockResolvedValue([]) },
      vehicleTrip: { findMany: jest.fn().mockResolvedValue([]) },
    };
  });

  it('marks missing vehicle as unavailable within tenant', async () => {
    prisma.vehicle.findMany.mockResolvedValue([]);
    const result = await resolveEntityAvailability(
      prisma as unknown as PrismaService,
      'org-a',
      [{ id: 'n1', entityType: 'VEHICLE', entityId: 'veh-missing', templateParams: {} }],
    );
    expect(result.get('n1')).toBe(false);
  });

  it('marks existing booking as available', async () => {
    prisma.booking.findMany.mockResolvedValue([{ id: 'book-1' }]);
    const result = await resolveEntityAvailability(
      prisma as unknown as PrismaService,
      'org-a',
      [{ id: 'n2', entityType: 'BOOKING', entityId: 'book-1', templateParams: {} }],
    );
    expect(result.get('n2')).toBe(true);
  });

  it('does not mark foreign-org entities as available when lookup returns empty', async () => {
    prisma.customer.findMany.mockResolvedValue([]);
    const result = await resolveEntityAvailability(
      prisma as unknown as PrismaService,
      'org-b',
      [{ id: 'n3', entityType: 'CUSTOMER', entityId: 'cust-other-org', templateParams: {} }],
    );
    expect(result.get('n3')).toBe(false);
  });
});
