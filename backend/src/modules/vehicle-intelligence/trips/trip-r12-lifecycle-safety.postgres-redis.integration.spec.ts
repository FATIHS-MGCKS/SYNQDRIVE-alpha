import { PrismaClient, TripDetectionState, TripStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { QUEUE_NAMES } from '@workers/queues/queue-names';

import { END_DETECTION_MODES, TRIP_TRACKING_TRIGGERS, type TripTrackingJobData } from './trip-detection.types';
import {
  buildActiveTickJob,
  buildTripR11DetectorMock,
  buildTripR11OrchestrationHarness,
  buildTripTrackingJobId,
  cleanupTripR11Fixture,
  countTripTrackingJobs,
  createTripR11Ks661PreIdleFixture,
  drainTripTrackingQueue,
  probeTripR11Postgres,
  restoreTripR11Clock,
  startTripR11RedisStack,
  stopTripR11RedisStack,
  useTripR11FrozenClock,
  type TripR11PostgresFixture,
} from './testing/trip-r11-postgres-redis.integration.harness';
import {
  readActiveStopBoundaryAt,
  readLastPauseBoundaryAt,
  readStopBoundaryAt,
} from './trip-fsm-evidence-state';
import { resolveEndCycleToken } from './trip-end-cycle-reset';

const LIVE = process.env.TRIP_R12_POSTGRES_REDIS_INTEGRATION === '1';
const REQUIRED = process.env.TRIP_R12_POSTGRES_REDIS_REQUIRED === '1';

if (REQUIRED) {
  if (!LIVE) {
    throw new Error(
      'TRIP_R12_POSTGRES_REDIS_REQUIRED=1 but TRIP_R12_POSTGRES_REDIS_INTEGRATION is not 1',
    );
  }
  const url = process.env.DATABASE_URL ?? '';
  if (!url.includes('127.0.0.1') && !url.includes('localhost')) {
    throw new Error('Trip R12 integration requires CI-local DATABASE_URL');
  }
}

(LIVE ? describe : describe.skip)(
  'TDL-DEC-R12 lifecycle safety + idempotency (Postgres + BullMQ)',
  () => {
    let prisma: PrismaClient;
    let dbOk = false;
    let redisStack: Awaited<ReturnType<typeof startTripR11RedisStack>>;
    let trackingQueue: Queue<TripTrackingJobData>;
    let fixture: TripR11PostgresFixture;

    beforeAll(async () => {
      dbOk = await probeTripR11Postgres();
      if (REQUIRED && !dbOk) {
        throw new Error('Trip R12 postgres probe failed in required CI mode');
      }
      if (!dbOk) return;
      prisma = new PrismaClient();
      redisStack = await startTripR11RedisStack();
      trackingQueue = new Queue(QUEUE_NAMES.TRIP_TRACKING, {
        connection: redisStack.connectionOptions,
      });
      RuntimeStatusRegistry.setWorkersEnabled(true);
    }, 120_000);

    beforeEach(async () => {
      if (!dbOk) return;
      await trackingQueue.obliterate({ force: true });
      fixture = await createTripR11Ks661PreIdleFixture(prisma);
    });

    afterEach(async () => {
      restoreTripR11Clock();
      if (!dbOk || !fixture) return;
      await cleanupTripR11Fixture(prisma, fixture);
    });

    afterAll(async () => {
      await trackingQueue?.close().catch(() => undefined);
      await prisma?.$disconnect().catch(() => undefined);
      if (redisStack) await stopTripR11RedisStack(redisStack);
    }, 60_000);

    it('B1-resume-without-B2 — retired pause boundary must not authorize end', async () => {
      const b1At = new Date('2026-09-08T19:59:22.000Z');
      const pauseTickAt = new Date('2026-09-08T19:59:56.000Z');
      const resumeTickAt = new Date('2026-09-08T20:00:30.000Z');
      const resumeMovementAt = new Date('2026-09-08T20:00:15.000Z');
      const silenceTickAt = new Date('2026-09-08T20:04:00.000Z');
      const staleObsAt = new Date('2026-09-08T20:01:30.000Z');
      const b2At = new Date('2026-09-08T20:05:00.000Z');
      const finalEmptyTickAt = new Date('2026-09-08T20:08:00.000Z');
      const endCycleAt = new Date('2026-09-08T20:10:00.000Z');

      await prisma.vehicleLatestState.update({
        where: { vehicleId: fixture.vehicle.id },
        data: {
          isIgnitionOn: false,
          speedKmh: 0,
          engineLoad: 42,
          sourceTimestamp: b1At,
          updatedAt: b1At,
        },
      });

      const harness = buildTripR11OrchestrationHarness(
        prisma,
        trackingQueue,
        fixture,
        {
          fetchRawTripCoreData: jest.fn().mockResolvedValue([]),
          fetchRouteEnrichment: jest.fn().mockResolvedValue([]),
          fetchPerformance: jest.fn().mockResolvedValue([]),
          fetchEndValidationWindow: jest.fn().mockResolvedValue([
            {
              timestamp: b2At.toISOString(),
              speed: 0,
              isIgnitionOn: false,
              travelledDistance: 1000,
            },
          ]),
        },
        buildTripR11DetectorMock(b2At),
      );

      useTripR11FrozenClock(pauseTickAt);
      await harness.runJob(buildActiveTickJob(fixture, pauseTickAt));
      restoreTripR11Clock();

      let det = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(det?.state).toBe(TripDetectionState.ACTIVE_TRIP);
      expect(readStopBoundaryAt(det?.lastEvidenceSummary as Record<string, unknown>)?.toISOString()).toBe(
        b1At.toISOString(),
      );

      harness.segments.fetchRawTripCoreData = jest.fn().mockResolvedValue([
        {
          timestamp: resumeMovementAt.toISOString(),
          speed: 18,
          travelledDistance: 1001,
          isIgnitionOn: true,
        },
      ]);
      harness.segments.fetchRouteEnrichment = jest.fn().mockResolvedValue([
        {
          latitude: 51.34,
          longitude: 9.51,
          speedKmh: 18,
          timestamp: resumeMovementAt.toISOString(),
        },
      ]);

      useTripR11FrozenClock(resumeTickAt);
      await harness.runJob(buildActiveTickJob(fixture, resumeTickAt));
      restoreTripR11Clock();

      det = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      const resumeSummary = det?.lastEvidenceSummary as Record<string, unknown>;
      expect(det?.state).toBe(TripDetectionState.ACTIVE_TRIP);
      expect(det?.activeTripId).toBe(fixture.trip.id);
      expect(readActiveStopBoundaryAt(resumeSummary)).toBeNull();
      expect(readLastPauseBoundaryAt(resumeSummary)?.toISOString()).toBe(b1At.toISOString());

      await prisma.vehicleLatestState.update({
        where: { vehicleId: fixture.vehicle.id },
        data: {
          isIgnitionOn: false,
          speedKmh: 0,
          engineLoad: 42,
          sourceTimestamp: staleObsAt,
          updatedAt: staleObsAt,
        },
      });
      harness.segments.fetchRawTripCoreData = jest.fn().mockResolvedValue([]);
      harness.segments.fetchRouteEnrichment = jest.fn().mockResolvedValue([]);

      useTripR11FrozenClock(silenceTickAt);
      await harness.runJob(buildActiveTickJob(fixture, silenceTickAt));
      restoreTripR11Clock();

      det = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(det?.state).toBe(TripDetectionState.ACTIVE_TRIP);
      expect(det?.possibleEndAt).toBeNull();
      expect(
        readActiveStopBoundaryAt(det?.lastEvidenceSummary as Record<string, unknown>),
      ).toBeNull();

      await prisma.vehicleLatestState.update({
        where: { vehicleId: fixture.vehicle.id },
        data: {
          isIgnitionOn: false,
          speedKmh: 0,
          engineLoad: 42,
          sourceTimestamp: b2At,
          updatedAt: b2At,
        },
      });
      harness.segments.fetchRawTripCoreData = jest.fn().mockResolvedValue([
        {
          timestamp: b2At.toISOString(),
          speed: 0,
          travelledDistance: 1002,
          isIgnitionOn: false,
        },
      ]);

      useTripR11FrozenClock(new Date('2026-09-08T20:05:30.000Z'));
      await harness.runJob(
        buildActiveTickJob(fixture, new Date('2026-09-08T20:05:30.000Z')),
      );
      restoreTripR11Clock();

      det = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(readActiveStopBoundaryAt(det?.lastEvidenceSummary as Record<string, unknown>)?.toISOString()).toBe(
        b2At.toISOString(),
      );

      await prisma.vehicleLatestState.update({
        where: { vehicleId: fixture.vehicle.id },
        data: {
          sourceTimestamp: new Date('2026-09-08T20:05:30.000Z'),
          updatedAt: new Date('2026-09-08T20:05:30.000Z'),
        },
      });
      harness.segments.fetchRawTripCoreData = jest.fn().mockResolvedValue([]);
      useTripR11FrozenClock(finalEmptyTickAt);
      await harness.runJob(buildActiveTickJob(fixture, finalEmptyTickAt));
      restoreTripR11Clock();

      det = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(det?.state).toBe(TripDetectionState.POSSIBLE_END);
      expect(det?.possibleEndAt?.toISOString()).toBe(b2At.toISOString());
      expect(det?.possibleEndAt?.toISOString()).not.toBe(b1At.toISOString());

      jest.mocked(harness.decisionEngine.evaluateEndCandidate).mockReturnValue({
        shouldEnd: true,
        shouldReopen: false,
        detectedEndAt: b2At,
        confidence: 'MEDIUM',
        endMode: END_DETECTION_MODES.CUSUM_VALIDATED,
        reason: 'integration_cusum_end_b2',
        findings: [],
      });

      useTripR11FrozenClock(endCycleAt);
      await drainTripTrackingQueue({ queue: trackingQueue, runJob: harness.runJob });
      restoreTripR11Clock();

      const trip = await prisma.vehicleTrip.findUnique({ where: { id: fixture.trip.id } });
      det = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(trip?.tripStatus).toBe(TripStatus.COMPLETED);
      expect(det?.state).toBe(TripDetectionState.RESTING);
      expect(trip?.endTime?.toISOString()).toBe(b2At.toISOString());
    }, 180_000);

    it('K7-orchestration — fresh engineLoad blocks, stale allows boundary-backed end', async () => {
      const bAt = new Date('2026-09-09T05:07:00.000Z');
      const freshObsAt = new Date('2026-09-09T05:09:00.000Z');
      const staleTickAt = new Date('2026-09-09T05:12:00.000Z');

      await prisma.vehicleTripDetectionState.update({
        where: { vehicleId: fixture.vehicle.id },
        data: {
          state: TripDetectionState.ACTIVE_TRIP,
          lastEvidenceSummary: {
            stopBoundaryAt: bAt.toISOString(),
            stopBoundarySource: 'provider_stationary_vls',
          },
        },
      });
      await prisma.vehicleLatestState.update({
        where: { vehicleId: fixture.vehicle.id },
        data: {
          isIgnitionOn: false,
          speedKmh: 0,
          engineLoad: 39.6,
          sourceTimestamp: freshObsAt,
          updatedAt: freshObsAt,
        },
      });

      const harness = buildTripR11OrchestrationHarness(
        prisma,
        trackingQueue,
        fixture,
        {
          fetchRawTripCoreData: jest.fn().mockResolvedValue([]),
          fetchRouteEnrichment: jest.fn().mockResolvedValue([]),
          fetchPerformance: jest.fn().mockResolvedValue([]),
          fetchEndValidationWindow: jest.fn().mockResolvedValue([
            { timestamp: bAt.toISOString(), speed: 0, isIgnitionOn: false, travelledDistance: 1000 },
          ]),
        },
        buildTripR11DetectorMock(bAt),
      );

      useTripR11FrozenClock(new Date('2026-09-09T05:09:30.000Z'));
      await harness.runJob(buildActiveTickJob(fixture, new Date('2026-09-09T05:09:30.000Z')));
      restoreTripR11Clock();

      let det = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(det?.state).toBe(TripDetectionState.ACTIVE_TRIP);

      useTripR11FrozenClock(staleTickAt);
      await harness.runJob(buildActiveTickJob(fixture, staleTickAt));
      restoreTripR11Clock();

      det = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(det?.state).toBe(TripDetectionState.POSSIBLE_END);
      const summary = det?.lastEvidenceSummary as Record<string, unknown>;
      expect(summary.innerGateReason).toBe('boundary_backed_provider_silence');
    }, 120_000);

    it('K12 — boundary-backed end path survives duplicate end-cycle jobs', async () => {
      const bAt = new Date('2026-09-09T05:07:00.000Z');
      const emptyTickAt = new Date('2026-09-09T05:10:30.000Z');
      const endCycleAt = new Date('2026-09-09T05:12:00.000Z');

      await prisma.vehicleTripDetectionState.update({
        where: { vehicleId: fixture.vehicle.id },
        data: {
          state: TripDetectionState.ACTIVE_TRIP,
          lastEvidenceSummary: {
            stopBoundaryAt: bAt.toISOString(),
            stopBoundarySource: 'provider_stationary_vls',
            lastProviderActivityAt: bAt.toISOString(),
          },
          lastMeaningfulMovementAt: bAt,
          lastActivityAt: bAt,
        },
      });
      await prisma.vehicleLatestState.update({
        where: { vehicleId: fixture.vehicle.id },
        data: {
          isIgnitionOn: false,
          speedKmh: 0,
          engineLoad: 39.6,
          sourceTimestamp: new Date('2026-09-09T05:08:00.000Z'),
          updatedAt: new Date('2026-09-09T05:08:00.000Z'),
        },
      });

      const harness = buildTripR11OrchestrationHarness(
        prisma,
        trackingQueue,
        fixture,
        {
          fetchRawTripCoreData: jest.fn().mockResolvedValue([]),
          fetchRouteEnrichment: jest.fn().mockResolvedValue([]),
          fetchPerformance: jest.fn().mockResolvedValue([]),
          fetchEndValidationWindow: jest.fn().mockResolvedValue([
            { timestamp: bAt.toISOString(), speed: 0, isIgnitionOn: false, travelledDistance: 1000 },
          ]),
        },
        buildTripR11DetectorMock(bAt),
      );

      useTripR11FrozenClock(emptyTickAt);
      await harness.runJob(buildActiveTickJob(fixture, emptyTickAt));
      restoreTripR11Clock();

      const afterPe = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(afterPe?.state).toBe(TripDetectionState.POSSIBLE_END);
      const token = resolveEndCycleToken(afterPe!);

      const dupPec: TripTrackingJobData = {
        vehicleId: fixture.vehicle.id,
        organizationId: fixture.vehicle.organizationId,
        dimoTokenId: fixture.vehicle.dimoTokenId,
        trigger: TRIP_TRACKING_TRIGGERS.POSSIBLE_END_CHECK,
        requestedAt: emptyTickAt.toISOString(),
        endCycleToken: token ?? undefined,
      };
      await trackingQueue.add('dup-pec', dupPec, {
        jobId: buildTripTrackingJobId('pec', fixture.vehicle.id, fixture.trip.id),
      });

      useTripR11FrozenClock(endCycleAt);
      await drainTripTrackingQueue({ queue: trackingQueue, runJob: harness.runJob });
      restoreTripR11Clock();

      const trips = await prisma.vehicleTrip.findMany({
        where: { vehicleId: fixture.vehicle.id, tripStatus: TripStatus.COMPLETED },
      });
      expect(trips).toHaveLength(1);
      const det = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(det?.state).toBe(TripDetectionState.RESTING);
      expect(await countTripTrackingJobs(trackingQueue)).toBe(0);
    }, 120_000);

    it('R12-TRUST-A — worker→provider trust transition same tick stays ACTIVE_TRIP', async () => {
      const workerBoundaryAt = new Date('2026-09-09T05:07:00.000Z');
      const providerObsAt = new Date('2026-09-09T05:07:00.000Z');
      const lastMovement = new Date('2026-09-09T05:06:49.562Z');
      const stopTickAt = new Date('2026-09-09T05:07:30.000Z');
      const laterEmptyTickAt = new Date('2026-09-09T05:10:30.000Z');
      const staleObsAt = new Date('2026-09-09T05:07:00.000Z');

      await prisma.vehicleTripDetectionState.update({
        where: { vehicleId: fixture.vehicle.id },
        data: {
          lastMeaningfulMovementAt: lastMovement,
          lastActivityAt: lastMovement,
          lastEvidenceSummary: {
            stopBoundaryAt: workerBoundaryAt.toISOString(),
            stopBoundarySource: 'idle_within_trip_worker_now',
            stopBoundaryClockAuthority: 'WORKER_TIME',
            stopBoundaryTrust: false,
          },
        },
      });
      await prisma.vehicleLatestState.update({
        where: { vehicleId: fixture.vehicle.id },
        data: {
          isIgnitionOn: false,
          speedKmh: 0,
          engineLoad: 39.6,
          sourceTimestamp: providerObsAt,
          updatedAt: providerObsAt,
        },
      });

      const harness = buildTripR11OrchestrationHarness(
        prisma,
        trackingQueue,
        fixture,
        {
          fetchRawTripCoreData: jest.fn().mockResolvedValue([
            {
              timestamp: lastMovement.toISOString(),
              speed: 3.3,
              travelledDistance: 191075,
              isIgnitionOn: false,
            },
            {
              timestamp: providerObsAt.toISOString(),
              speed: 0,
              travelledDistance: 191075,
              isIgnitionOn: false,
            },
          ]),
          fetchRouteEnrichment: jest.fn().mockResolvedValue([
            {
              latitude: 51.33535,
              longitude: 9.5059516,
              speedKmh: 0,
              timestamp: providerObsAt.toISOString(),
            },
          ]),
          fetchPerformance: jest.fn().mockResolvedValue([]),
          fetchEndValidationWindow: jest.fn().mockResolvedValue([]),
        },
        buildTripR11DetectorMock(providerObsAt),
      );

      useTripR11FrozenClock(stopTickAt);
      await harness.runJob(buildActiveTickJob(fixture, stopTickAt));
      restoreTripR11Clock();

      let det = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      const sameTickSummary = det?.lastEvidenceSummary as Record<string, unknown>;
      expect(det?.state).toBe(TripDetectionState.ACTIVE_TRIP);
      expect(det?.possibleEndAt).toBeNull();
      expect(sameTickSummary.stopBoundaryClockAuthority).toBe('PROVIDER_EVENT_TIME');
      expect(sameTickSummary.stopBoundaryTrust).toBe(true);
      expect(readStopBoundaryAt(sameTickSummary)?.toISOString()).toBe(
        providerObsAt.toISOString(),
      );

      harness.segments.fetchRawTripCoreData = jest.fn().mockResolvedValue([]);
      harness.segments.fetchRouteEnrichment = jest.fn().mockResolvedValue([]);
      harness.segments.fetchPerformance = jest.fn().mockResolvedValue([]);

      useTripR11FrozenClock(laterEmptyTickAt);
      await harness.runJob(buildActiveTickJob(fixture, laterEmptyTickAt));
      restoreTripR11Clock();

      det = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(det?.state).toBe(TripDetectionState.POSSIBLE_END);
      const laterSummary = det?.lastEvidenceSummary as Record<string, unknown>;
      expect(laterSummary.boundaryBackedSilenceEligible).toBe(true);
    }, 120_000);

    it('R12-TRUST-B — untrusted worker boundary must not filter continuity movement', async () => {
      const workerBoundaryAt = new Date('2026-09-09T05:08:00.000Z');
      const lastMovement = new Date('2026-09-09T05:06:49.562Z');
      const resumeMovementAt = new Date('2026-09-09T05:07:15.000Z');
      const resumeTickAt = new Date('2026-09-09T05:08:30.000Z');

      await prisma.vehicleTripDetectionState.update({
        where: { vehicleId: fixture.vehicle.id },
        data: {
          lastMeaningfulMovementAt: lastMovement,
          lastActivityAt: lastMovement,
          lastEvidenceSummary: {
            stopBoundaryAt: workerBoundaryAt.toISOString(),
            stopBoundarySource: 'idle_within_trip_worker_now',
            stopBoundaryClockAuthority: 'WORKER_TIME',
            stopBoundaryTrust: false,
          },
        },
      });

      const harness = buildTripR11OrchestrationHarness(
        prisma,
        trackingQueue,
        fixture,
        {
          fetchRawTripCoreData: jest.fn().mockResolvedValue([
            {
              timestamp: resumeMovementAt.toISOString(),
              speed: 18,
              travelledDistance: 191076,
              isIgnitionOn: true,
            },
          ]),
          fetchRouteEnrichment: jest.fn().mockResolvedValue([
            {
              latitude: 51.34,
              longitude: 9.51,
              speedKmh: 18,
              timestamp: resumeMovementAt.toISOString(),
            },
          ]),
          fetchPerformance: jest.fn().mockResolvedValue([]),
          fetchEndValidationWindow: jest.fn().mockResolvedValue([]),
        },
        buildTripR11DetectorMock(workerBoundaryAt),
      );

      useTripR11FrozenClock(resumeTickAt);
      await harness.runJob(buildActiveTickJob(fixture, resumeTickAt));
      restoreTripR11Clock();

      const det = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      const summary = det?.lastEvidenceSummary as Record<string, unknown>;
      expect(det?.state).toBe(TripDetectionState.ACTIVE_TRIP);
      expect(det?.activeTripId).toBe(fixture.trip.id);
      expect(readActiveStopBoundaryAt(summary)).toBeNull();
      expect(readLastPauseBoundaryAt(summary)?.toISOString()).toBe(
        workerBoundaryAt.toISOString(),
      );
      expect(det?.lastMeaningfulMovementAt?.toISOString()).toBe(
        resumeMovementAt.toISOString(),
      );
    }, 120_000);
  },
);
