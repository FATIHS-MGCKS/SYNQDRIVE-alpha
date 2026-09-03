import { PrismaClient } from '@prisma/client';
import { TripDecisionEngine } from '../decision/trip-decision.engine';
import { TripReconciliationService } from './trip-reconciliation.service';
import { buildIntraTripGapSplitRepairAuditId } from './intra-trip-gap-split-repair-id.util';
import { REPAIR_STATUS } from './reconciliation.types';
import {
  cleanupIntraTripGapSplitPostgresFixture,
  createIntraTripGapSplitPostgresFixture,
  probeIntraTripGapSplitDatabase,
  type IntraTripGapSplitPostgresFixture,
} from '../testing/intra-trip-gap-split-postgres.integration.harness';

const LIVE = process.env.INTRA_TRIP_GAP_SPLIT_POSTGRES_INTEGRATION === '1';

function buildService(prisma: PrismaClient): TripReconciliationService {
  const engine = new TripDecisionEngine(prisma as never);
  return new TripReconciliationService(
    prisma as never,
    engine,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

(LIVE ? describe : describe.skip)(
  'INTRA_TRIP_GAP_SPLIT PostgreSQL atomicity (DATABASE_URL)',
  () => {
    let prisma: PrismaClient;
    let dbOk = false;
    let fixture: IntraTripGapSplitPostgresFixture;

    beforeAll(async () => {
      dbOk = await probeIntraTripGapSplitDatabase();
      if (!dbOk) return;
      prisma = new PrismaClient();
    }, 60_000);

    beforeEach(async () => {
      if (!dbOk) return;
      fixture = await createIntraTripGapSplitPostgresFixture(prisma);
    });

    afterEach(async () => {
      if (!dbOk || !fixture) return;
      await cleanupIntraTripGapSplitPostgresFixture(prisma, fixture);
    });

    afterAll(async () => {
      if (prisma) await prisma.$disconnect().catch(() => undefined);
    });

    const applyOnce = async (service: TripReconciliationService) => {
      const repairId = buildIntraTripGapSplitRepairAuditId(
        fixture.vehicle.id,
        fixture.gap.firstEndAt,
        fixture.gap.secondStartAt,
      );
      return (
        service as never as {
          applyIntraTripGapSplitRepairAtomically: (input: unknown) => Promise<unknown>;
        }
      ).applyIntraTripGapSplitRepairAtomically({
        repairId,
        vehicleId: fixture.vehicle.id,
        tripId: fixture.trip.id,
        gap: {
          ...fixture.gap,
          driftM: 12,
          preWaypointCount: 4,
          postWaypointCount: 3,
        },
        tier: 'warm',
        reason: 'pg integration',
        detectorEvidence: { repairIdentity: repairId },
        current: {
          id: fixture.trip.id,
          startTime: fixture.trip.startTime,
          endTime: fixture.trip.endTime,
          endLatitude: fixture.trip.endLatitude,
          endLongitude: fixture.trip.endLongitude,
          distanceKm: fixture.trip.distanceKm,
          detectionProfile: 'ICE',
        },
      });
    };

    it('POSTGRES_CONCURRENT_TWIN_TEST: two connections, one committed mutation', async () => {
      if (!dbOk) return;
      const serviceA = buildService(prisma);
      const serviceB = buildService(prisma);
      const [a, b] = await Promise.all([applyOnce(serviceA), applyOnce(serviceB)]);
      const outcomes = [a, b].map((r: any) => r.outcome);
      expect(outcomes.filter((o) => o === 'APPLY_COMMITTED').length).toBe(1);
      expect(outcomes.filter((o) => o === 'IDEMPOTENT_SKIP').length).toBe(1);

      const trips = await prisma.vehicleTrip.findMany({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(trips).toHaveLength(2);

      const repairs = await prisma.tripRepair.findMany({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(repairs.filter((r) => r.status === REPAIR_STATUS.APPLIED)).toHaveLength(1);
    });

    it('rolls back split + repair when transaction aborts mid-apply', async () => {
      if (!dbOk) return;
      const engine = new TripDecisionEngine(prisma as never);
      const splitSpy = jest
        .spyOn(engine, 'splitTripAtGap')
        .mockImplementationOnce(async () => {
          throw new Error('forced mid-split failure');
        });

      const service = new TripReconciliationService(
        prisma as never,
        engine,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );

      await expect(applyOnce(service)).rejects.toThrow('forced mid-split failure');
      splitSpy.mockRestore();

      const trips = await prisma.vehicleTrip.findMany({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(trips).toHaveLength(1);

      const repair = await prisma.tripRepair.findFirst({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(repair).toBeNull();
    });

    it('CRASH_AFTER_SPLIT_BEFORE_APPLIED_TEST: retry after rollback applies once', async () => {
      if (!dbOk) return;
      const engine = new TripDecisionEngine(prisma as never);
      jest.spyOn(engine, 'finalizeRepairedTrip').mockImplementationOnce(async () => {
        throw new Error('forced before APPLIED');
      });

      const service = new TripReconciliationService(
        prisma as never,
        engine,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );

      await expect(applyOnce(service)).rejects.toThrow('forced before APPLIED');

      const tripsAfterFail = await prisma.vehicleTrip.findMany({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(tripsAfterFail).toHaveLength(1);

      const engineClean = new TripDecisionEngine(prisma as never);
      const serviceClean = new TripReconciliationService(
        prisma as never,
        engineClean,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );

      const retry = (await applyOnce(serviceClean)) as { outcome: string };
      expect(retry.outcome).toBe('APPLY_COMMITTED');

      const tripsAfterRetry = await prisma.vehicleTrip.findMany({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(tripsAfterRetry).toHaveLength(2);
    });
  },
);
