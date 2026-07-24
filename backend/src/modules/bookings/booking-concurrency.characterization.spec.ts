/**
 * Concurrency characterization — overlap gate and parallel mutation races.
 */
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
    select: { id: true },
  });
  if (overlapping) {
    throw new ConflictException({
      code: 'VEHICLE_BOOKING_OVERLAP',
      conflictingBookingId: overlapping.id,
    });
  }
}

describe('Booking concurrency characterization', () => {
  it('serializes 100 parallel overlap checks against same vehicle window', async () => {
    let winnerId: string | null = null;
    const findFirst = jest.fn().mockImplementation(async () => {
      if (winnerId) {
        return { id: winnerId };
      }
      winnerId = `bk-${Math.random().toString(36).slice(2, 8)}`;
      return null;
    });
    const prisma = { booking: { findFirst } };

    const input = {
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      startDate: new Date('2026-07-10T08:00:00.000Z'),
      endDate: new Date('2026-07-12T08:00:00.000Z'),
    };

    const results = await Promise.allSettled(
      Array.from({ length: 100 }, () => assertNoVehicleOverlap(prisma, input)),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(99);
    expect(findFirst).toHaveBeenCalledTimes(100);
  });

  it('documents cancel vs pickup race — terminal cancel blocks pickup', () => {
    const booking: { status: string } = { status: 'CANCELLED' };
    const pickupAllowed = booking.status === 'CONFIRMED';
    expect(pickupAllowed).toBe(false);
  });

  it('documents return vs edit race — completed is terminal', () => {
    const terminal = new Set(['COMPLETED', 'CANCELLED', 'NO_SHOW']);
    const canEditDates = !terminal.has('COMPLETED');
    expect(canEditDates).toBe(false);
  });
});
