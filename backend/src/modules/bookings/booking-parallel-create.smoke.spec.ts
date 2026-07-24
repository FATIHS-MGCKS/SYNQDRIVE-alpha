/**
 * Pre-production smoke: parallel create race is serialized by advisory xact lock.
 */
import { ConflictException } from '@nestjs/common';
import { bookingVehicleOverlapLockKey } from './booking-input.sanitizer';
import { buildOverlapWhere } from './booking-conflict.util';

type TxClient = {
  $executeRaw: jest.Mock;
  booking: { findFirst: jest.Mock; create: jest.Mock };
};

async function simulateLockedCreate(
  tx: TxClient,
  input: {
    organizationId: string;
    vehicleId: string;
    startDate: Date;
    endDate: Date;
  },
  committedBookingIds: string[],
): Promise<string> {
  const lockKey = bookingVehicleOverlapLockKey(input.organizationId, input.vehicleId);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

  const overlapping = await tx.booking.findFirst({
    where: buildOverlapWhere(input),
    select: { id: true },
  });
  if (overlapping) {
    throw new ConflictException({ code: 'VEHICLE_BOOKING_OVERLAP' });
  }

  const created = await tx.booking.create({
    data: { organizationId: input.organizationId, vehicleId: input.vehicleId },
  });
  committedBookingIds.push(created.id);
  return created.id;
}

describe('Booking parallel create smoke (advisory lock)', () => {
  it('allows exactly one winner when two creates race the same vehicle window', async () => {
    const committed: string[] = [];
    let lockHeld = false;
    const waitQueue: Array<() => void> = [];

    const acquireLock = async () => {
      while (lockHeld) {
        await new Promise<void>((resolve) => waitQueue.push(resolve));
      }
      lockHeld = true;
    };
    const releaseLock = () => {
      lockHeld = false;
      const next = waitQueue.shift();
      if (next) next();
    };

    const tx: TxClient = {
      $executeRaw: jest.fn().mockImplementation(async () => {
        await acquireLock();
      }),
      booking: {
        findFirst: jest.fn().mockImplementation(async () => {
          if (committed.length > 0) {
            return { id: committed[0] };
          }
          return null;
        }),
        create: jest.fn().mockImplementation(async () => {
          const id = `bk-${committed.length + 1}`;
          releaseLock();
          return { id };
        }),
      },
    };

    const input = {
      organizationId: 'org-smoke',
      vehicleId: 'veh-smoke',
      startDate: new Date('2026-08-01T10:00:00.000Z'),
      endDate: new Date('2026-08-05T10:00:00.000Z'),
    };

    const results = await Promise.allSettled([
      simulateLockedCreate(tx, input, committed),
      simulateLockedCreate(tx, input, committed),
    ]);

    const winners = results.filter((r) => r.status === 'fulfilled');
    const losers = results.filter((r) => r.status === 'rejected');
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(committed).toHaveLength(1);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(
      losers[0].status === 'rejected' &&
        (losers[0].reason as ConflictException).getResponse(),
    ).toMatchObject({ code: 'VEHICLE_BOOKING_OVERLAP' });
  });
});
