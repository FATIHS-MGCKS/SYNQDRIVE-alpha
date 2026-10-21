import { PrismaClient, TripDetectionState, TripStatus, TripTrackingRunType } from '@prisma/client';
import {
  correlateConsecutiveTripPauses,
  extractTripLifecycleTimestamps,
  formatShadowAuditRow,
} from './trip-fsm-shadow-audit.domain';
import {
  mergeShadowObservabilityIntoSummary,
  readShadowObservabilityState,
} from './trip-fsm-shadow-summary.builder';
import { runShadowActiveTickObservation } from './trip-fsm-shadow-observability.integration';
import {
  cleanupTripR11Fixture,
  createTripR11Ks661PreIdleFixture,
  probeTripR11Postgres,
  type TripR11PostgresFixture,
} from './testing/trip-r11-postgres-redis.integration.harness';

const LIVE = process.env.TRIP_FSM_SHADOW_POSTGRES_REDIS_INTEGRATION === '1';
const REQUIRED = process.env.TRIP_FSM_SHADOW_POSTGRES_REDIS_REQUIRED === '1';

if (REQUIRED) {
  if (!LIVE) {
    throw new Error(
      'TRIP_FSM_SHADOW_POSTGRES_REDIS_REQUIRED=1 but TRIP_FSM_SHADOW_POSTGRES_REDIS_INTEGRATION is not 1',
    );
  }
}

(LIVE ? describe : describe.skip)(
  'trip-fsm-shadow-observability (Postgres integration)',
  () => {
    let prisma: PrismaClient;
    let dbOk = false;
    let fixture: TripR11PostgresFixture;

    beforeAll(async () => {
      dbOk = await probeTripR11Postgres();
      if (REQUIRED && !dbOk) {
        throw new Error('Shadow postgres probe failed in required CI mode');
      }
      if (!dbOk) return;
      prisma = new PrismaClient();
    }, 120_000);

    beforeEach(async () => {
      if (!dbOk) return;
      process.env.TRIP_FSM_SHADOW_OBSERVABILITY_ENABLED = 'true';
      process.env.TRIP_FSM_SHADOW_VEHICLE_IDS = '';
      fixture = await createTripR11Ks661PreIdleFixture(prisma);
      process.env.TRIP_FSM_SHADOW_VEHICLE_IDS = fixture.vehicle.id;
    });

    afterEach(async () => {
      delete process.env.TRIP_FSM_SHADOW_OBSERVABILITY_ENABLED;
      delete process.env.TRIP_FSM_SHADOW_VEHICLE_IDS;
      if (!dbOk || !fixture) return;
      await cleanupTripR11Fixture(prisma, fixture);
    });

    afterAll(async () => {
      await prisma?.$disconnect().catch(() => undefined);
    });

    it('persists shadow under last_evidence_summary without altering authoritative fields', async () => {
      const workerNow = new Date('2026-09-13T10:26:00.000Z');
      const prior = {
        stopBoundaryAt: fixture.stopBoundaryAt.toISOString(),
        stopBoundarySource: 'provider_stationary_vls',
      };
      const patch = runShadowActiveTickObservation({
        vehicleId: fixture.vehicle.id,
        tripId: fixture.trip.id,
        activeTripId: fixture.trip.id,
        fsmState: TripDetectionState.ACTIVE_TRIP,
        workerNow,
        operationalInactiveMs: 130_000,
        minInactivityBeforeCusumMs: 120_000,
        telemetry: {
          isIgnitionOn: false,
          speedKmh: 0,
          engineLoad: 40,
          sourceTimestamp: new Date('2026-09-13T10:23:00.000Z'),
        },
        profile: 'ICE',
        performanceActivity: false,
        routeMotion: false,
        hasCrediblePostMovement: false,
        providerSilenceAnchorAt: new Date('2026-09-13T10:23:00.000Z'),
        endCycleGeneration: 'cycle-token-a',
        priorSummary: prior,
        evaluateProviderSilence: true,
      });
      expect(patch?.shadowObservability).toBeDefined();
      await prisma.vehicleTripDetectionState.update({
        where: { vehicleId: fixture.vehicle.id },
        data: {
          lastEvidenceSummary: patch as any,
        },
      });
      const det = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect((det?.lastEvidenceSummary as any).stopBoundaryAt).toBe(
        prior.stopBoundaryAt,
      );
      expect(
        readShadowObservabilityState(det?.lastEvidenceSummary as Record<string, unknown>)
          .providerSilence.everEvaluated,
      ).toBe(true);
    });

    it('rejects stale stored generation in real integration path', async () => {
      const workerNow = new Date('2026-09-13T10:26:00.000Z');
      const priorPatch = runShadowActiveTickObservation({
        vehicleId: fixture.vehicle.id,
        tripId: fixture.trip.id,
        activeTripId: fixture.trip.id,
        fsmState: TripDetectionState.ACTIVE_TRIP,
        workerNow,
        operationalInactiveMs: 130_000,
        minInactivityBeforeCusumMs: 120_000,
        telemetry: {
          isIgnitionOn: false,
          speedKmh: 0,
          engineLoad: 40,
          sourceTimestamp: new Date('2026-09-13T10:23:00.000Z'),
        },
        profile: 'ICE',
        performanceActivity: false,
        routeMotion: false,
        hasCrediblePostMovement: false,
        providerSilenceAnchorAt: new Date('2026-09-13T10:23:00.000Z'),
        endCycleGeneration: 'cycle-token-a',
        priorSummary: {},
        evaluateProviderSilence: true,
      });
      const secondPatch = runShadowActiveTickObservation({
        vehicleId: fixture.vehicle.id,
        tripId: fixture.trip.id,
        activeTripId: fixture.trip.id,
        fsmState: TripDetectionState.POSSIBLE_END,
        workerNow: new Date('2026-09-13T10:27:00.000Z'),
        operationalInactiveMs: 130_000,
        minInactivityBeforeCusumMs: 120_000,
        telemetry: {
          isIgnitionOn: false,
          speedKmh: 0,
          engineLoad: 40,
          sourceTimestamp: new Date('2026-09-13T10:23:00.000Z'),
        },
        profile: 'ICE',
        performanceActivity: false,
        routeMotion: false,
        hasCrediblePostMovement: false,
        providerSilenceAnchorAt: new Date('2026-09-13T10:23:00.000Z'),
        endCycleGeneration: 'cycle-token-b',
        priorSummary: priorPatch ?? {},
        evaluateProviderSilence: true,
      });
      const shadow = readShadowObservabilityState(secondPatch ?? undefined);
      expect(shadow.providerSilence.lastEvaluation?.blockedBy).toBe(
        'old_end_cycle_generation',
      );
      expect(shadow.providerSilence.lastEvaluation?.eligible).toBe(false);
      expect(shadow.providerSilence.candidateEndCycleGeneration).toBe(
        'cycle-token-a',
      );
    });

    it('audit extracts resting timestamp from persisted tracking run', async () => {
      const endTime = new Date('2026-09-13T11:00:00.000Z');
      const completedAt = new Date('2026-09-13T11:00:05.000Z');
      const restingAt = new Date('2026-09-13T11:00:10.000Z');
      await prisma.vehicleTrip.update({
        where: { id: fixture.trip.id },
        data: {
          endTime,
          tripStatus: TripStatus.COMPLETED,
          rawDetectionMeta: {
            endTimeSource: 'CLICKHOUSE_END_ASSIST',
            endRecognizedAt: completedAt.toISOString(),
            shadowObservability: {
              providerSilence: { everEvaluated: true, everEligible: false },
              pauses: { episodeCount: 0, resumedEpisodeCount: 0, longestPauseMs: 0, outcomes: [], sameTripResumeCount: 0, newTripAfterTerminalCount: 0, ambiguousCount: 0, episodes: [] },
            },
          },
        },
      });
      await prisma.vehicleTripTrackingRun.create({
        data: {
          vehicleId: fixture.vehicle.id,
          organizationId: fixture.org.id,
          tripId: fixture.trip.id,
          stateAtRun: TripDetectionState.POSSIBLE_END,
          runType: TripTrackingRunType.FINALIZATION_CHECK,
          resultState: TripDetectionState.RESTING,
          createdAt: restingAt,
        },
      });
      const trip = await prisma.vehicleTrip.findUniqueOrThrow({
        where: { id: fixture.trip.id },
      });
      const lifecycle = extractTripLifecycleTimestamps({
        endTime: trip.endTime,
        tripStatus: trip.tripStatus,
        rawDetectionMeta: trip.rawDetectionMeta,
        restingObservedAt: restingAt,
      });
      const row = formatShadowAuditRow(
        {
          vehicleId: fixture.vehicle.id,
          tripId: trip.id,
          startAt: trip.startTime,
          endTime: trip.endTime,
          tripStatus: trip.tripStatus,
          rawDetectionMeta: trip.rawDetectionMeta,
          restingObservedAt: restingAt,
        },
        lifecycle,
      );
      expect(row.END_AT).toBe(endTime.toISOString());
      expect(row.REAL_COMPLETED_AT).toBe(completedAt.toISOString());
      expect(row.REAL_RESTING_AT).toBe(restingAt.toISOString());
      expect(row.END_AT).not.toBe(row.REAL_COMPLETED_AT);
    });

    it('correlates Trip A terminal → Trip B start for same vehicle', async () => {
      const tripAEnd = new Date('2026-09-13T10:01:15.000Z');
      const tripAResting = new Date('2026-09-13T10:01:25.000Z');
      const tripBStart = new Date('2026-09-13T10:05:00.000Z');
      const tripB = await prisma.vehicleTrip.create({
        data: {
          vehicleId: fixture.vehicle.id,
          startTime: tripBStart,
          tripStatus: TripStatus.ONGOING,
          rawDetectionMeta: {},
        },
      });
      await prisma.vehicleTrip.update({
        where: { id: fixture.trip.id },
        data: {
          endTime: tripAEnd,
          tripStatus: TripStatus.COMPLETED,
          rawDetectionMeta: mergeShadowObservabilityIntoSummary(
            { endRecognizedAt: '2026-09-13T10:01:20.000Z' },
            {
              providerSilence: readShadowObservabilityState(null).providerSilence,
              pause: {
                ...readShadowObservabilityState(null).pause,
                episodes: [
                  {
                    pauseEpisodeId: 'pause-a',
                    vehicleId: fixture.vehicle.id,
                    tripId: fixture.trip.id,
                    episodeStartedAt: '2026-09-13T10:00:10.000Z',
                    episodeStartSource: 'integration',
                    bestObservedStopAnchorAt: '2026-09-13T10:00:10.000Z',
                    realFsmStateAtPauseStart: TripDetectionState.IDLE_WITHIN_TRIP,
                    possibleEndAt: null,
                    completedAt: null,
                    restingAt: null,
                    activeTripIdAtPauseStart: fixture.trip.id,
                    shadowPauseOutcome: 'NO_RESUME_OBSERVED',
                  },
                ],
                episodeCount: 1,
              },
            },
          ) as any,
        },
      });
      const tripA = await prisma.vehicleTrip.findUniqueOrThrow({
        where: { id: fixture.trip.id },
      });
      const enrichedA = {
        vehicleId: fixture.vehicle.id,
        tripId: tripA.id,
        startAt: tripA.startTime,
        endTime: tripA.endTime,
        tripStatus: tripA.tripStatus,
        rawDetectionMeta: tripA.rawDetectionMeta,
        restingObservedAt: tripAResting,
        lifecycle: extractTripLifecycleTimestamps({
          endTime: tripA.endTime,
          tripStatus: tripA.tripStatus,
          rawDetectionMeta: tripA.rawDetectionMeta,
          restingObservedAt: tripAResting,
        }),
        shadow: (tripA.rawDetectionMeta as any)?.shadowObservability ?? null,
      };
      const enrichedB = {
        vehicleId: fixture.vehicle.id,
        tripId: tripB.id,
        startAt: tripB.startTime,
        endTime: tripB.endTime,
        tripStatus: tripB.tripStatus,
        rawDetectionMeta: tripB.rawDetectionMeta,
        restingObservedAt: null,
        lifecycle: extractTripLifecycleTimestamps({
          endTime: tripB.endTime,
          tripStatus: tripB.tripStatus,
          rawDetectionMeta: tripB.rawDetectionMeta,
          restingObservedAt: null,
        }),
        shadow: null,
      };
      const correlations = correlateConsecutiveTripPauses([enrichedA, enrichedB]);
      expect(correlations[0]?.crossTripPauseOutcome).toBe('NEW_TRIP_AFTER_RESTING');
      expect(correlations[0]?.priorTripId).toBe(fixture.trip.id);
      expect(correlations[0]?.nextTripId).toBe(tripB.id);
      await prisma.vehicleTrip.delete({ where: { id: tripB.id } });
    });
  },
);
