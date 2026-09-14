/**
 * Read-only audit for Trip FSM shadow observability payloads.
 */
import {
  aggregateShadowAuditRows,
  correlateConsecutiveTripPauses,
  extractTripLifecycleTimestamps,
  formatShadowAuditRow,
  validateShadowAuditCliArgs,
  type ShadowAuditTripInput,
} from '../../src/modules/vehicle-intelligence/trips/trip-fsm-shadow-audit.domain';
import type { ShadowTerminalSummary } from '../../src/modules/vehicle-intelligence/trips/trip-fsm-shadow-observability.types';
import { TripTrackingRunType } from '@prisma/client';

const AUDIT_VERSION = 'trip-fsm-shadow-audit-v2';

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function readShadowFromRawMeta(raw: unknown): ShadowTerminalSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const shadow = (raw as Record<string, unknown>).shadowObservability;
  if (!shadow || typeof shadow !== 'object') return null;
  return shadow as ShadowTerminalSummary;
}

function buildFixtureRows(): ShadowAuditTripInput[] {
  return [
    {
      vehicleId: 'vehicle-fixture-a',
      tripId: 'fixture-trip-a',
      startAt: new Date('2026-09-13T10:00:00.000Z'),
      endTime: new Date('2026-09-13T10:01:15.000Z'),
      tripStatus: 'COMPLETED',
      rawDetectionMeta: {
        endTimeSource: 'CLICKHOUSE_END_ASSIST',
        endRecognizedAt: '2026-09-13T10:01:20.000Z',
        shadowObservability: {
          providerSilence: {
            everEvaluated: true,
            everEligible: false,
            firstEligibleAt: null,
            candidateAt: '2026-09-13T10:00:30.000Z',
            candidateSource: 'provider_silence_candidate',
            trust: false,
            clockAuthority: 'PROVIDER_EVENT_TIME',
            realWinningEndPath: 'CLICKHOUSE_END_ASSIST',
            invalidatedByMovement: false,
            blockedReasons: ['provider_silence_below_liveness_bound'],
            counterfactualStatus: 'NOT_REACHED_BEFORE_TERMINAL',
            candidateEndCycleGeneration: 'token-a',
            candidateTripId: 'fixture-trip-a',
          },
          pauses: {
            episodeCount: 1,
            resumedEpisodeCount: 0,
            longestPauseMs: 0,
            outcomes: ['NO_RESUME_OBSERVED'],
            sameTripResumeCount: 0,
            newTripAfterTerminalCount: 0,
            ambiguousCount: 0,
            episodes: [
              {
                pauseEpisodeId: 'pause-a',
                vehicleId: 'vehicle-fixture-a',
                tripId: 'fixture-trip-a',
                episodeStartedAt: '2026-09-13T10:00:10.000Z',
                episodeStartSource: 'fixture',
                bestObservedStopAnchorAt: '2026-09-13T10:00:10.000Z',
                realFsmStateAtPauseStart: 'IDLE_WITHIN_TRIP',
                possibleEndAt: null,
                completedAt: null,
                restingAt: null,
                activeTripIdAtPauseStart: 'fixture-trip-a',
                shadowPauseOutcome: 'NO_RESUME_OBSERVED',
              },
            ],
          },
        },
      },
      restingObservedAt: new Date('2026-09-13T10:01:25.000Z'),
    },
    {
      vehicleId: 'vehicle-fixture-a',
      tripId: 'fixture-trip-b',
      startAt: new Date('2026-09-13T10:05:00.000Z'),
      endTime: null,
      tripStatus: 'ONGOING',
      rawDetectionMeta: {
        shadowObservability: {
          providerSilence: {
            everEvaluated: false,
            everEligible: false,
            firstEligibleAt: null,
            candidateAt: null,
            candidateSource: null,
            trust: null,
            clockAuthority: null,
            realWinningEndPath: null,
            invalidatedByMovement: false,
            blockedReasons: [],
            counterfactualStatus: null,
            candidateEndCycleGeneration: null,
            candidateTripId: null,
          },
          pauses: {
            episodeCount: 0,
            resumedEpisodeCount: 0,
            longestPauseMs: 0,
            outcomes: [],
            sameTripResumeCount: 0,
            newTripAfterTerminalCount: 0,
            ambiguousCount: 0,
            episodes: [],
          },
        },
      },
      restingObservedAt: null,
    },
  ];
}

async function loadRestingObservedAtByTrip(
  prisma: import('@prisma/client').PrismaClient,
  tripIds: string[],
): Promise<Map<string, Date>> {
  const runs = await prisma.vehicleTripTrackingRun.findMany({
    where: {
      tripId: { in: tripIds },
      resultState: 'RESTING',
      runType: TripTrackingRunType.FINALIZATION_CHECK,
    },
    select: { tripId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const map = new Map<string, Date>();
  for (const run of runs) {
    if (run.tripId && !map.has(run.tripId)) {
      map.set(run.tripId, run.createdAt);
    }
  }
  return map;
}

async function main(): Promise<void> {
  const fixturesOnly = hasFlag('--fixtures-only');
  const allowUnbounded = hasFlag('--allow-unbounded');
  const vehicleId = parseArg('--vehicle-id');
  const sinceRaw = parseArg('--since');
  const untilRaw = parseArg('--until');
  const since = sinceRaw ? new Date(sinceRaw) : undefined;
  const until = untilRaw ? new Date(untilRaw) : undefined;

  const validation = validateShadowAuditCliArgs({
    fixturesOnly,
    databaseUrl: process.env.DATABASE_URL,
    vehicleId,
    since,
    until,
    allowUnbounded,
  });
  if (!validation.ok) {
    console.error(validation.message);
    process.exit(1);
  }

  let trips: ShadowAuditTripInput[];

  if (fixturesOnly) {
    trips = buildFixtureRows();
  } else {
    const { NestFactory } = await import('@nestjs/core');
    const { AppModule } = await import('../../src/app.module');
    const { PrismaService } = await import('../../src/shared/database/prisma.service');
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn'],
    });
    try {
      const prisma = app.get(PrismaService);
      const dbTrips = await prisma.vehicleTrip.findMany({
        where: {
          vehicleId: vehicleId!,
          startTime: {
            gte: since!,
            lte: until!,
          },
        },
        select: {
          id: true,
          vehicleId: true,
          startTime: true,
          endTime: true,
          rawDetectionMeta: true,
          tripStatus: true,
        },
        orderBy: { startTime: 'asc' },
        take: 500,
      });
      const restingMap = await loadRestingObservedAtByTrip(
        prisma,
        dbTrips.map((t) => t.id),
      );
      trips = dbTrips
        .filter((t) => t.rawDetectionMeta != null)
        .map((t) => ({
          vehicleId: t.vehicleId,
          tripId: t.id,
          startAt: t.startTime,
          endTime: t.endTime,
          tripStatus: t.tripStatus,
          rawDetectionMeta: t.rawDetectionMeta,
          restingObservedAt: restingMap.get(t.id) ?? null,
        }));
    } finally {
      await app.close();
    }
  }

  const enriched = trips.map((trip) => ({
    ...trip,
    lifecycle: extractTripLifecycleTimestamps(trip),
    shadow: readShadowFromRawMeta(trip.rawDetectionMeta),
  }));

  const rows = enriched.map((trip, index) => {
    const prior = index > 0 ? enriched[index - 1] : null;
    return formatShadowAuditRow(trip, trip.lifecycle, prior
      ? {
          tripId: prior.tripId,
          vehicleId: prior.vehicleId,
          shadow: prior.shadow,
        }
      : null);
  });

  const crossTripCorrelations = correlateConsecutiveTripPauses(enriched);
  const totals = aggregateShadowAuditRows(rows);

  console.log(
    JSON.stringify(
      {
        auditVersion: AUDIT_VERSION,
        readOnly: true,
        fixturesOnly,
        vehicleId: vehicleId ?? null,
        since: since?.toISOString() ?? null,
        until: until?.toISOString() ?? null,
        rows,
        crossTripCorrelations,
        aggregates: totals,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
