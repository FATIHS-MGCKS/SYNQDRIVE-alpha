/**
 * Pre-production smoke: parallel registerFromDimo races are serialized by advisory xact lock.
 */
import { ConflictException } from '@nestjs/common';
import { vehicleDimoBindingLockKey } from '@shared/database/pg-advisory-lock.util';

type TxClient = {
  $executeRaw: jest.Mock;
  vehicle: { findFirst: jest.Mock; create: jest.Mock };
};

async function simulateLockedRegister(
  tx: TxClient,
  dimoVehicleId: string,
  committedVehicleIds: string[],
): Promise<string> {
  const lockKey = vehicleDimoBindingLockKey(dimoVehicleId);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

  const existing = await tx.vehicle.findFirst({
    where: { dimoVehicleId },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictException({ code: 'DIMO_VEHICLE_ALREADY_REGISTERED' });
  }

  const created = await tx.vehicle.create({
    data: { dimoVehicleId },
  });
  committedVehicleIds.push(created.id);
  return created.id;
}

describe('registerFromDimo parallel smoke (advisory lock)', () => {
  it('allows exactly one winner when two registrations race the same dimoVehicleId', async () => {
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
      vehicle: {
        findFirst: jest.fn().mockImplementation(async () => {
          if (committed.length > 0) {
            return { id: committed[0] };
          }
          return null;
        }),
        create: jest.fn().mockImplementation(async () => {
          const id = `veh-${committed.length + 1}`;
          releaseLock();
          return { id };
        }),
      },
    };

    const dimoVehicleId = 'dimo-veh-smoke';

    const results = await Promise.allSettled([
      simulateLockedRegister(tx, dimoVehicleId, committed),
      simulateLockedRegister(tx, dimoVehicleId, committed),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(committed).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      status: 'rejected',
      reason: expect.any(ConflictException),
    });
  });
});
