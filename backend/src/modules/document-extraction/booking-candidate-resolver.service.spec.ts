import { BookingCandidateResolverService } from './booking-candidate-resolver.service';
import { BOOKING_CANDIDATE_MATCH_REASONS } from './booking-candidate-resolver.types';

describe('BookingCandidateResolverService', () => {
  function makeService(prismaOverrides: Record<string, unknown> = {}) {
    const prisma = {
      booking: { findMany: jest.fn(), findFirst: jest.fn() },
      ...prismaOverrides,
    };
    return { svc: new BookingCandidateResolverService(prisma as any), prisma };
  }

  const bookingRow = {
    id: '11111111-1111-4111-8111-111111111111',
    vehicleId: 'veh-1',
    customerId: 'cust-1',
    assignedDriverId: null,
    startDate: new Date('2026-07-10T08:00:00.000Z'),
    endDate: new Date('2026-07-12T18:00:00.000Z'),
    status: 'ACTIVE',
    customer: { firstName: 'Max', lastName: 'Muster', company: null },
  };

  it('returns empty candidates without vehicle anchor', async () => {
    const { svc } = makeService();
    const result = await svc.resolve({
      organizationId: 'org-1',
      vehicleId: null,
      documentType: 'FINE',
      extractedData: { eventDate: '2026-07-11' },
    });
    expect(result.candidates).toHaveLength(0);
    expect(result.autoConfirmEligible).toBe(false);
  });

  it('returns one tenant-scoped candidate for unique fine offense date', async () => {
    const { svc, prisma } = makeService({
      booking: {
        findMany: jest.fn().mockResolvedValue([bookingRow]),
        findFirst: jest.fn(),
      },
    });

    const result = await svc.resolve({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      documentType: 'FINE',
      extractedData: { eventDate: '2026-07-11' },
    });

    expect(prisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          vehicleId: 'veh-1',
          status: { in: ['ACTIVE', 'COMPLETED', 'CONFIRMED'] },
        }),
      }),
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].matchReasons).toContain(BOOKING_CANDIDATE_MATCH_REASONS.DATE_OVERLAP);
    expect(result.ambiguousOverlap).toBe(false);
  });

  it('marks ambiguous overlap for multiple bookings', async () => {
    const { svc } = makeService({
      booking: {
        findMany: jest.fn().mockResolvedValue([
          bookingRow,
          {
            ...bookingRow,
            id: '22222222-2222-4222-8222-222222222222',
            startDate: new Date('2026-07-11T09:00:00.000Z'),
            endDate: new Date('2026-07-13T18:00:00.000Z'),
          },
        ]),
        findFirst: jest.fn(),
      },
    });

    const result = await svc.resolve({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      documentType: 'FINE',
      extractedData: { eventDate: '2026-07-11' },
    });

    expect(result.candidates.length).toBeGreaterThan(1);
    expect(result.ambiguousOverlap).toBe(true);
    expect(result.candidates.every((candidate) => candidate.confirmationRequired)).toBe(true);
  });

  it('returns no temporal overlap candidates when offense date is missing', async () => {
    const { svc, prisma } = makeService({
      booking: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
      },
    });

    const result = await svc.resolve({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      documentType: 'INVOICE',
      extractedData: { customerName: 'Max Muster' },
    });

    expect(prisma.booking.findMany).toHaveBeenCalled();
    expect(result.candidates).toHaveLength(0);
    expect(result.hints.eventTimePrecision).toBe('missing');
  });
});
