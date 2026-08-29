import { PrismaClient, TripStatus } from '@prisma/client';
import { TripDecisionEngine } from '../decision/trip-decision.engine';
import { BoundaryRepairConcurrentMutationError } from '../decision/decision.types';
import { REPAIR_STATUS, REPAIR_TYPES, BOUNDARY_REFRESH_STATE } from './reconciliation.types';
import {
  readBoundaryRefreshRecord,
} from '../boundary-repair.state.util';
import { BoundaryRefreshLifecycleService } from '../boundary-refresh-lifecycle.service';
import {
  cleanupBoundaryRepairPostgresFixture,
  createBoundaryRepairPostgresFixture,
  probeBoundaryRepairDatabase,
  type BoundaryRepairPostgresFixture,
} from '../testing/boundary-repair-postgres.integration.harness';

const LIVE = process.env.BOUNDARY_REPAIR_POSTGRES_INTEGRATION === '1';

(LIVE ? describe : describe.skip)(
  'Boundary repair PostgreSQL integration (DATABASE_URL)',
  () => {
    let prisma: PrismaClient;
    let dbOk = false;
    let fixture: BoundaryRepairPostgresFixture;

    beforeAll(async () => {
      dbOk = await probeBoundaryRepairDatabase();
      if (!dbOk) return;
      prisma = new PrismaClient();
    }, 60_000);

    beforeEach(async () => {
      if (!dbOk) return;
      fixture = await createBoundaryRepairPostgresFixture(prisma);
    });

    afterEach(async () => {
      if (!dbOk || !fixture) return;
      await cleanupBoundaryRepairPostgresFixture(prisma, fixture);
    });

    afterAll(async () => {
      if (prisma) await prisma.$disconnect().catch(() => undefined);
    });

    it('1 — commits VehicleTrip boundary + TripRepair BOUNDARY_APPLIED atomically', async () => {
      if (!dbOk) return;
      const engine = new TripDecisionEngine(prisma as never);
      const auditId = `audit-${fixture.suffix}`;
      const newStart = new Date('2026-08-29T12:01:00.000Z');
      const newEnd = new Date('2026-08-29T12:50:00.000Z');

      const result = await engine.repairTripBoundariesWithAudit(
        {
          tripId: fixture.trip.id,
          vehicleId: fixture.vehicle.id,
          organizationId: fixture.org.id,
          providerSegmentId: 'seg-pg-1',
          providerMechanism: 'changePointDetection',
          oldStartTime: fixture.trip.startTime,
          oldEndTime: fixture.trip.endTime!,
          newStartTime: newStart,
          newEndTime: newEnd,
          confidence: 'HIGH',
          reason: 'pg integration',
          source: 'test',
        },
        {
          auditId,
          repairType: REPAIR_TYPES.PARTIAL_TRIP_BOUNDARY_EXTENSION,
          windowFrom: newStart,
          windowTo: newEnd,
          confidence: 'HIGH',
          reason: 'pg integration',
          detectorEvidence: {},
        },
      );

      expect(result.applied).toBe(true);
      const trip = await prisma.vehicleTrip.findUnique({ where: { id: fixture.trip.id } });
      const repair = await prisma.tripRepair.findUnique({ where: { id: auditId } });
      expect(trip?.startTime).toEqual(newStart);
      expect(repair?.status).toBe(REPAIR_STATUS.BOUNDARY_APPLIED);
      expect(readBoundaryRefreshRecord(trip?.rawDetectionMeta)?.state).toBe(
        BOUNDARY_REFRESH_STATE.PENDING,
      );
    });

    it('2 — rolls back both rows when transaction aborts', async () => {
      if (!dbOk) return;
      const auditId = `audit-${fixture.suffix}`;
      const originalStart = fixture.trip.startTime;
      const newStart = new Date('2026-08-29T12:01:00.000Z');

      await expect(
        prisma.$transaction(async (tx) => {
          const updated = await tx.vehicleTrip.updateMany({
            where: {
              id: fixture.trip.id,
              startTime: fixture.trip.startTime,
              endTime: fixture.trip.endTime,
            },
            data: {
              startTime: newStart,
              rawDetectionMeta: { boundaryRefresh: { state: 'PENDING' } },
            },
          });
          if (updated.count !== 1) {
            throw new Error('optimistic lock failed');
          }
          await tx.tripRepair.upsert({
            where: { id: auditId },
            create: {
              id: auditId,
              tripId: fixture.trip.id,
              vehicleId: fixture.vehicle.id,
              repairType: REPAIR_TYPES.PARTIAL_TRIP_BOUNDARY_EXTENSION,
              status: REPAIR_STATUS.BOUNDARY_APPLIED,
              appliedAt: new Date(),
              windowFrom: newStart,
              windowTo: fixture.trip.endTime!,
              confidence: 'HIGH',
              reason: 'rollback test',
              detectorEvidence: {},
            },
            update: { status: REPAIR_STATUS.BOUNDARY_APPLIED },
          });
          throw new Error('forced rollback');
        }),
      ).rejects.toThrow('forced rollback');

      const trip = await prisma.vehicleTrip.findUnique({
        where: { id: fixture.trip.id },
        select: { startTime: true },
      });
      const repair = await prisma.tripRepair.findUnique({ where: { id: auditId } });
      expect(trip?.startTime).toEqual(originalStart);
      expect(repair).toBeNull();
    });

    it('3/4 — concurrent optimistic updates: one wins, loser does not overwrite', async () => {
      if (!dbOk) return;
      const engine = new TripDecisionEngine(prisma as never);
      const params = {
        tripId: fixture.trip.id,
        vehicleId: fixture.vehicle.id,
        organizationId: fixture.org.id,
        providerSegmentId: 'seg-pg-concurrent',
        providerMechanism: 'changePointDetection',
        oldStartTime: fixture.trip.startTime,
        oldEndTime: fixture.trip.endTime!,
        newStartTime: new Date('2026-08-29T12:01:00.000Z'),
        newEndTime: fixture.trip.endTime!,
        confidence: 'HIGH' as const,
        reason: 'concurrent',
        source: 'test',
      };

      const results = await Promise.allSettled([
        engine.repairTripBoundariesWithAudit(params, {
          auditId: `audit-a-${fixture.suffix}`,
          repairType: REPAIR_TYPES.PARTIAL_TRIP_BOUNDARY_EXTENSION,
          windowFrom: params.newStartTime,
          windowTo: params.newEndTime,
          confidence: 'HIGH',
          reason: 'concurrent',
          detectorEvidence: {},
        }),
        engine.repairTripBoundariesWithAudit(params, {
          auditId: `audit-b-${fixture.suffix}`,
          repairType: REPAIR_TYPES.PARTIAL_TRIP_BOUNDARY_EXTENSION,
          windowFrom: params.newStartTime,
          windowTo: params.newEndTime,
          confidence: 'HIGH',
          reason: 'concurrent',
          detectorEvidence: {},
        }),
      ]);

      const applied = results.filter((r) => r.status === 'fulfilled' && r.value.applied).length;
      const concurrentErrors = results.filter(
        (r) =>
          r.status === 'rejected' &&
          r.reason instanceof BoundaryRepairConcurrentMutationError,
      ).length;
      expect(applied).toBe(1);
      expect(concurrentErrors + applied).toBeGreaterThanOrEqual(1);

      const trip = await prisma.vehicleTrip.findUnique({ where: { id: fixture.trip.id } });
      expect(trip?.startTime).toEqual(params.newStartTime);
    });

    it('5 — boundaryRefresh survives new Prisma client re-read', async () => {
      if (!dbOk) return;
      const engine = new TripDecisionEngine(prisma as never);
      const auditId = `audit-${fixture.suffix}`;
      await engine.repairTripBoundariesWithAudit(
        {
          tripId: fixture.trip.id,
          vehicleId: fixture.vehicle.id,
          organizationId: fixture.org.id,
          providerSegmentId: 'seg-pg-persist',
          providerMechanism: 'changePointDetection',
          oldStartTime: fixture.trip.startTime,
          oldEndTime: fixture.trip.endTime!,
          newStartTime: new Date('2026-08-29T12:01:00.000Z'),
          newEndTime: fixture.trip.endTime!,
          confidence: 'HIGH',
          reason: 'persist',
          source: 'test',
        },
        {
          auditId,
          repairType: REPAIR_TYPES.PARTIAL_TRIP_BOUNDARY_EXTENSION,
          windowFrom: new Date('2026-08-29T12:01:00.000Z'),
          windowTo: fixture.trip.endTime!,
          confidence: 'HIGH',
          reason: 'persist',
          detectorEvidence: {},
        },
      );

      const fresh = new PrismaClient();
      const trip = await fresh.vehicleTrip.findUnique({ where: { id: fixture.trip.id } });
      await fresh.$disconnect();
      const refresh = readBoundaryRefreshRecord(trip?.rawDetectionMeta);
      expect(refresh?.state).toBe(BOUNDARY_REFRESH_STATE.PENDING);
      expect(refresh?.generation).toContain(auditId);
    });

    it('completion lifecycle marks COMPLETED only after mandatory stages', async () => {
      if (!dbOk) return;
      const lifecycle = new BoundaryRefreshLifecycleService(prisma as never);
      const engine = new TripDecisionEngine(prisma as never);
      const auditId = `audit-${fixture.suffix}`;
      await engine.repairTripBoundariesWithAudit(
        {
          tripId: fixture.trip.id,
          vehicleId: fixture.vehicle.id,
          organizationId: fixture.org.id,
          providerSegmentId: 'seg-pg-complete',
          providerMechanism: 'changePointDetection',
          oldStartTime: fixture.trip.startTime,
          oldEndTime: fixture.trip.endTime!,
          newStartTime: new Date('2026-08-29T12:01:00.000Z'),
          newEndTime: fixture.trip.endTime!,
          confidence: 'HIGH',
          reason: 'complete',
          source: 'test',
        },
        {
          auditId,
          repairType: REPAIR_TYPES.PARTIAL_TRIP_BOUNDARY_EXTENSION,
          windowFrom: new Date('2026-08-29T12:01:00.000Z'),
          windowTo: fixture.trip.endTime!,
          confidence: 'HIGH',
          reason: 'complete',
          detectorEvidence: {},
        },
      );

      const tripAfter = await prisma.vehicleTrip.findUnique({ where: { id: fixture.trip.id } });
      const generation = readBoundaryRefreshRecord(tripAfter?.rawDetectionMeta)!.generation;

      await lifecycle.persistBoundaryRefreshState(
        fixture.trip.id,
        BOUNDARY_REFRESH_STATE.ENQUEUED,
        undefined,
        { generation },
      );

      expect(await lifecycle.tryMarkCompleted(fixture.trip.id)).toBe(false);

      await lifecycle.markBoundaryStageProgress(fixture.trip.id, 'route', 'done');
      await lifecycle.markBoundaryStageProgress(fixture.trip.id, 'behavior', 'done');
      await lifecycle.markBoundaryStageProgress(fixture.trip.id, 'drivingImpact', 'done');

      const completed = await prisma.vehicleTrip.findUnique({ where: { id: fixture.trip.id } });
      expect(readBoundaryRefreshRecord(completed?.rawDetectionMeta)?.state).toBe(
        BOUNDARY_REFRESH_STATE.COMPLETED,
      );
      expect(await lifecycle.tryMarkCompleted(fixture.trip.id)).toBe(false);
    });
  },
);
