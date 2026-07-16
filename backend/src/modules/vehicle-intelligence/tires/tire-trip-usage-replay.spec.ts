import { Prisma } from '@prisma/client';
import {
  advisoryLockSeed,
  isActiveLedgerRow,
  isRetryableTripUsageError,
  pgAdvisoryLockKeys,
  rebuildSetupUsageAggregatesFromLedger,
  sumActiveLedgerRows,
  TireTripUsageReplayConflictError,
  withTripUsageReplayRetry,
} from './tire-trip-usage-replay';

describe('tire-trip-usage-replay', () => {
  describe('pgAdvisoryLockKeys', () => {
    it('is deterministic for the same seed', () => {
      const seed = advisoryLockSeed('trip-1', 'setup-1');
      expect(pgAdvisoryLockKeys(seed)).toEqual(pgAdvisoryLockKeys(seed));
    });

    it('differs for different trip/setup pairs', () => {
      const a = pgAdvisoryLockKeys(advisoryLockSeed('trip-1', 'setup-1'));
      const b = pgAdvisoryLockKeys(advisoryLockSeed('trip-2', 'setup-1'));
      expect(a).not.toEqual(b);
    });
  });

  describe('sumActiveLedgerRows', () => {
    it('sums only non-invalidated rows', () => {
      const totals = sumActiveLedgerRows([
        {
          invalidatedAt: null,
          distanceKm: 40,
          cityKm: 20,
          ruralKm: 8,
          highwayKm: 12,
          harshAccelerationCount: 1,
          harshBrakingCount: 2,
          harshCorneringCount: 0,
        },
        {
          invalidatedAt: new Date(),
          distanceKm: 99,
          cityKm: 99,
          ruralKm: 99,
          highwayKm: 99,
          harshAccelerationCount: 9,
          harshBrakingCount: 9,
          harshCorneringCount: 9,
        },
        {
          invalidatedAt: null,
          distanceKm: 5,
          cityKm: 2,
          ruralKm: 1,
          highwayKm: 2,
          harshAccelerationCount: 0,
          harshBrakingCount: 1,
          harshCorneringCount: 0,
        },
      ]);
      expect(totals).toEqual({
        distanceKm: 45,
        cityKm: 22,
        ruralKm: 9,
        highwayKm: 14,
        harshAccelerationCount: 1,
        harshBrakingCount: 3,
        harshCorneringCount: 0,
        activeLedgerRows: 2,
      });
    });
  });

  describe('isActiveLedgerRow', () => {
    it('treats null invalidatedAt as active', () => {
      expect(isActiveLedgerRow({ invalidatedAt: null })).toBe(true);
    });

    it('treats set invalidatedAt as inactive', () => {
      expect(isActiveLedgerRow({ invalidatedAt: new Date() })).toBe(false);
    });
  });

  describe('rebuildSetupUsageAggregatesFromLedger', () => {
    it('writes absolute totals from active ledger rows', async () => {
      const findMany = jest.fn().mockResolvedValue([
        {
          invalidatedAt: null,
          distanceKm: 42,
          cityKm: 21,
          ruralKm: 8.4,
          highwayKm: 12.6,
          harshAccelerationCount: 1,
          harshBrakingCount: 2,
          harshCorneringCount: 0,
        },
      ]);
      const update = jest.fn().mockResolvedValue({});
      const tx = {
        tireTripUsageLedger: { findMany },
        vehicleTireSetup: { update },
      };

      const totals = await rebuildSetupUsageAggregatesFromLedger(tx, 'setup-1');

      expect(findMany).toHaveBeenCalledWith({
        where: { tireSetupId: 'setup-1', invalidatedAt: null },
      });
      expect(update).toHaveBeenCalledWith({
        where: { id: 'setup-1' },
        data: {
          totalKmOnSet: 42,
          cityKm: 21,
          ruralKm: 8.4,
          highwayKm: 12.6,
          harshAccelEvents: 1,
          harshBrakeEvents: 2,
          harshCornerEvents: 0,
        },
      });
      expect(totals.activeLedgerRows).toBe(1);
    });
  });

  describe('isRetryableTripUsageError', () => {
    it('retries replay conflict and prisma unique/serialization errors', () => {
      expect(isRetryableTripUsageError(new TireTripUsageReplayConflictError('x'))).toBe(true);
      expect(
        isRetryableTripUsageError(
          new Prisma.PrismaClientKnownRequestError('unique', {
            code: 'P2002',
            clientVersion: 'test',
          }),
        ),
      ).toBe(true);
      expect(
        isRetryableTripUsageError(
          new Prisma.PrismaClientKnownRequestError('conflict', {
            code: 'P2034',
            clientVersion: 'test',
          }),
        ),
      ).toBe(true);
      expect(isRetryableTripUsageError(new Error('other'))).toBe(false);
    });
  });

  describe('withTripUsageReplayRetry', () => {
    it('retries retryable errors and eventually succeeds', async () => {
      let attempts = 0;
      const result = await withTripUsageReplayRetry(async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new TireTripUsageReplayConflictError('race');
        }
        return 'ok';
      });
      expect(result).toBe('ok');
      expect(attempts).toBe(3);
    });

    it('fails after max attempts', async () => {
      await expect(
        withTripUsageReplayRetry(async () => {
          throw new TireTripUsageReplayConflictError('race');
        }, { maxAttempts: 2 }),
      ).rejects.toThrow(/race/);
    });
  });

  describe('parallel workers (simulated)', () => {
    it('ensures exactly one create under concurrent upsert race', async () => {
      const store = new Map<string, unknown>();

      const prisma = {
        tireTripUsageLedger: {
          findUnique: jest.fn(async () =>
            store.has('ledger') ? (store.get('ledger') as object) : null,
          ),
          create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
            if (store.has('ledger')) {
              throw new Prisma.PrismaClientKnownRequestError('unique', {
                code: 'P2002',
                clientVersion: 'test',
              });
            }
            const entry = { id: 'ledger-1', ...data };
            store.set('ledger', entry);
            return entry;
          }),
          update: jest.fn(),
        },
      };

      const { upsertTireTripUsageLedgerEntry } = await import(
        './tire-trip-usage-ledger.repository'
      );
      const tenant = {
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        vehicleOrganizationId: 'org-1',
        tireSetupId: 'setup-1',
        setupVehicleId: 'veh-1',
        setupOrganizationId: 'org-1',
        tripId: 'trip-1',
        tripVehicleId: 'veh-1',
      };
      const input = {
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        tripId: 'trip-1',
        tireSetupId: 'setup-1',
        tripStartedAt: '2026-07-01T10:00:00.000Z',
        tripEndedAt: '2026-07-01T10:45:00.000Z',
        distanceKm: 10,
        cityKm: 5,
        ruralKm: 2,
        highwayKm: 3,
        harshAccelerationCount: 0,
        harshBrakingCount: 0,
        harshCorneringCount: 0,
        sourceVersion: 'tire-trip-usage-ledger-2026-07-v1',
      };

      const workers = Array.from({ length: 10 }, () =>
        withTripUsageReplayRetry(() =>
          upsertTireTripUsageLedgerEntry(prisma as any, input, tenant),
        ),
      );

      const results = await Promise.all(workers);
      const createdCount = results.filter((r) => r.action === 'CREATED').length;
      const unchangedCount = results.filter((r) => r.action === 'UNCHANGED').length;
      expect(createdCount).toBe(1);
      expect(unchangedCount).toBe(9);
      expect(prisma.tireTripUsageLedger.create).toHaveBeenCalledTimes(10);
    });
  });
});
