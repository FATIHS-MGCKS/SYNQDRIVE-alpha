import { NotFoundException } from '@nestjs/common';
import { DrivingIntelligenceBookingResolutionPrismaAdapter } from './driving-intelligence-booking-resolution.adapter';

describe('DrivingIntelligenceBookingResolutionPrismaAdapter', () => {
  const prisma = { booking: { findFirst: jest.fn() } };
  let adapter: DrivingIntelligenceBookingResolutionPrismaAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new DrivingIntelligenceBookingResolutionPrismaAdapter(prisma as any);
  });

  it('scopes lookup by organizationId and bookingId', async () => {
    prisma.booking.findFirst.mockResolvedValue({ id: 'book-1', vehicleId: 'vehicle-1' });

    const result = await adapter.resolveBookingVehicleForOrganization({
      organizationId: 'org-1',
      bookingId: 'book-1',
    });

    expect(result).toEqual({ vehicleId: 'vehicle-1' });
    expect(prisma.booking.findFirst).toHaveBeenCalledWith({
      where: { id: 'book-1', organizationId: 'org-1' },
      select: { id: true, vehicleId: true },
    });
  });

  it('returns nullable vehicleId', async () => {
    prisma.booking.findFirst.mockResolvedValue({ id: 'book-1', vehicleId: null });

    await expect(
      adapter.resolveBookingVehicleForOrganization({
        organizationId: 'org-1',
        bookingId: 'book-1',
      }),
    ).resolves.toEqual({ vehicleId: null });
  });

  it('throws NotFoundException for missing or foreign booking', async () => {
    prisma.booking.findFirst.mockResolvedValue(null);

    await expect(
      adapter.resolveBookingVehicleForOrganization({
        organizationId: 'org-1',
        bookingId: 'missing',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      adapter.resolveBookingVehicleForOrganization({
        organizationId: 'org-1',
        bookingId: 'missing',
      }),
    ).rejects.toThrow('Booking not found for organization');
  });
});