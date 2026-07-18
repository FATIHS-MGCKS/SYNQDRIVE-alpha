import { DriverCandidateResolverService } from './driver-candidate-resolver.service';
import { DRIVER_CANDIDATE_MATCH_REASONS } from './driver-candidate-resolver.types';

describe('DriverCandidateResolverService', () => {
  function makeService(prismaOverrides: Record<string, unknown> = {}) {
    const prisma = {
      booking: { findFirst: jest.fn() },
      customer: { findMany: jest.fn() },
      vehicleTrip: { findFirst: jest.fn() },
      ...prismaOverrides,
    };
    return { svc: new DriverCandidateResolverService(prisma as any), prisma };
  }

  const primaryDriver = {
    id: '11111111-1111-4111-8111-111111111111',
    firstName: 'Anna',
    lastName: 'Fahrer',
    company: null,
    fullNameNormalized: 'anna fahrer',
    licenseNumberNormalized: 'B1234567',
  };

  it('returns primary driver for linked booking with license signal', async () => {
    const { svc, prisma } = makeService({
      booking: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'book-1',
          customerId: '33333333-3333-4333-8333-333333333333',
          assignedDriverId: primaryDriver.id,
          allowedDrivers: [{ customerId: primaryDriver.id, role: 'PRIMARY' }],
        }),
      },
      vehicleTrip: { findFirst: jest.fn().mockResolvedValue(null) },
      customer: { findMany: jest.fn().mockResolvedValue([primaryDriver]) },
    });

    const result = await svc.resolve({
      organizationId: 'org-1',
      documentType: 'FINE',
      extractedData: { licenseNumber: 'B1234567', eventDate: '2025-10-24' },
      linkedBookingId: 'book-1',
      resolvedVehicleId: 'veh-1',
    });

    expect(prisma.booking.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-1', id: 'book-1' }),
      }),
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].matchReasons).toContain(
      DRIVER_CANDIDATE_MATCH_REASONS.LICENSE_EXACT,
    );
    expect(result.autoConfirmEligible).toBe(false);
    expect(result.unassignedDriver).toBe(false);
  });

  it('returns ambiguous pool for multiple allowed drivers without disambiguation', async () => {
    const { svc } = makeService({
      booking: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'book-1',
          customerId: '33333333-3333-4333-8333-333333333333',
          assignedDriverId: primaryDriver.id,
          allowedDrivers: [
            { customerId: primaryDriver.id, role: 'PRIMARY' },
            {
              customerId: '22222222-2222-4222-8222-222222222222',
              role: 'ADDITIONAL',
            },
          ],
        }),
      },
      vehicleTrip: { findFirst: jest.fn().mockResolvedValue(null) },
      customer: {
        findMany: jest.fn().mockResolvedValue([
          primaryDriver,
          {
            ...primaryDriver,
            id: '22222222-2222-4222-8222-222222222222',
            firstName: 'Ben',
            lastName: 'Zusatz',
            fullNameNormalized: 'ben zusatz',
          },
        ]),
      },
    });

    const result = await svc.resolve({
      organizationId: 'org-1',
      documentType: 'FINE',
      extractedData: { eventDate: '2025-10-24' },
      linkedBookingId: 'book-1',
    });

    expect(result.candidates.length).toBeGreaterThan(1);
    expect(result.ambiguousDriverPool).toBe(true);
    expect(result.unassignedDriver).toBe(true);
    expect(result.candidates.every((candidate) => candidate.confirmationRequired)).toBe(true);
  });
});
