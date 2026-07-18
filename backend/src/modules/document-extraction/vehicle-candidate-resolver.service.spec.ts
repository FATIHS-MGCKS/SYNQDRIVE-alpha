import { VehicleCandidateResolverService } from './vehicle-candidate-resolver.service';
import { VEHICLE_CANDIDATE_MATCH_REASONS } from './vehicle-candidate-resolver.types';

describe('VehicleCandidateResolverService', () => {
  function makeService(prismaOverrides: Record<string, unknown> = {}) {
    const prisma = {
      vehicle: { findMany: jest.fn() },
      booking: { findFirst: jest.fn() },
      ...prismaOverrides,
    };
    return { svc: new VehicleCandidateResolverService(prisma as any), prisma };
  }

  it('returns zero candidates when no org vehicles match signals', async () => {
    const { svc, prisma } = makeService({
      vehicle: { findMany: jest.fn().mockResolvedValue([]) },
    });

    const result = await svc.resolve({
      organizationId: 'org-1',
      extractedData: { licensePlate: 'UNKNOWN 1' },
    });

    expect(prisma.vehicle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-1' }),
      }),
    );
    expect(result.candidates).toHaveLength(0);
    expect(result.blockerPresent).toBe(false);
    expect(result.autoConfirmEligible).toBe(false);
  });

  it('returns one tenant-scoped candidate for exact VIN', async () => {
    const { svc } = makeService({
      vehicle: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'veh-1',
            licensePlate: 'B-AB 123',
            vin: 'WVWZZZ1JZ3W386752',
            make: 'VW',
            model: 'Golf',
            vehicleName: 'Fleet-01',
          },
        ]),
      },
    });

    const result = await svc.resolve({
      organizationId: 'org-1',
      extractedData: { vin: 'WVWZZZ1JZ3W386752' },
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].vehicleId).toBe('veh-1');
    expect(result.candidates[0].matchReasons).toContain(VEHICLE_CANDIDATE_MATCH_REASONS.VIN_EXACT);
  });

  it('returns multiple candidates and sets blocker for contradictory VIN/plate', async () => {
    const { svc } = makeService({
      vehicle: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'veh-1',
            licensePlate: 'B-AB 123',
            vin: 'WVWZZZ1JZ3W386752',
            make: 'VW',
            model: 'Golf',
            vehicleName: 'Fleet-01',
          },
          {
            id: 'veh-2',
            licensePlate: 'M-XY 999',
            vin: 'WAUZZZ8V5KA123456',
            make: 'Audi',
            model: 'A4',
            vehicleName: 'Fleet-02',
          },
          {
            id: 'veh-3',
            licensePlate: 'B-AB 456',
            vin: 'WVWZZZ1JZ3W999999',
            make: 'VW',
            model: 'Golf',
            vehicleName: 'Fleet-03',
          },
        ]),
      },
    });

    const result = await svc.resolve({
      organizationId: 'org-1',
      extractedData: {
        vin: 'WVWZZZ1JZ3W386752',
        licensePlate: 'M-XY 999',
        make: 'VW',
        model: 'Golf',
      },
    });

    expect(result.candidates.length).toBeGreaterThan(1);
    expect(result.blockerPresent).toBe(true);
    expect(result.candidates.every((c) => c.confirmationRequired)).toBe(true);
  });

  it('resolves booking reference to booking vehicle candidate', async () => {
    const { svc, prisma } = makeService({
      booking: {
        findFirst: jest.fn().mockResolvedValue({ vehicleId: 'veh-booking' }),
      },
      vehicle: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'veh-booking',
            licensePlate: 'HH-AB 100',
            vin: 'BOOKINGVIN00001',
            make: 'BMW',
            model: 'X1',
            vehicleName: 'Booking Car',
          },
        ]),
      },
    });

    const result = await svc.resolve({
      organizationId: 'org-1',
      extractedData: { bookingReference: 'book-1' },
      uploadContextBookingId: 'book-1',
    });

    expect(prisma.booking.findFirst).toHaveBeenCalledWith({
      where: { id: 'book-1', organizationId: 'org-1' },
      select: { vehicleId: true },
    });
    expect(result.candidates.some((c) => c.vehicleId === 'veh-booking')).toBe(true);
    expect(
      result.candidates.find((c) => c.vehicleId === 'veh-booking')?.matchReasons,
    ).toContain(VEHICLE_CANDIDATE_MATCH_REASONS.BOOKING_REFERENCE);
  });
});
