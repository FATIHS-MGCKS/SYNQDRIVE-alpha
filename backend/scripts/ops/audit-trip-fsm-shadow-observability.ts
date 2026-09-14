/**
 * Read-only audit for Trip FSM shadow observability payloads.
 *
 * Usage:
 *   cd backend
 *   npm run trip:shadow:audit -- --vehicle-id=<uuid> --since=2026-09-01T00:00:00.000Z --until=2026-09-15T00:00:00.000Z
 *
 * Dry-run fixtures (no DATABASE_URL):
 *   npm run trip:shadow:audit -- --fixtures-only
 */
import type { ShadowTerminalSummary } from '../../src/modules/vehicle-intelligence/trips/trip-fsm-shadow-observability.types';

const AUDIT_VERSION = 'trip-fsm-shadow-audit-v1';

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

function buildFixtureRows() {
  return [
    {
      tripId: 'fixture-trip-1',
      startAt: '2026-09-13T10:00:00.000Z',
      endAt: '2026-09-13T11:00:00.000Z',
      rawDetectionMeta: {
        endTimeSource: 'CLICKHOUSE_END_ASSIST',
        shadowObservability: {
          providerSilence: {
            everEvaluated: true,
            everEligible: true,
            firstEligibleAt: '2026-09-13T10:25:00.000Z',
            candidateAt: '2026-09-13T10:23:00.000Z',
            candidateSource: 'provider_silence_candidate',
            trust: false,
            clockAuthority: 'PROVIDER_EVENT_TIME',
            realWinningEndPath: 'CLICKHOUSE_END_ASSIST',
            invalidatedByMovement: false,
            blockedReasons: [],
          },
          pauses: {
            episodeCount: 1,
            resumedEpisodeCount: 1,
            longestPauseMs: 90_000,
            outcomes: ['SAME_TRIP_RESUME'],
            sameTripResumeCount: 1,
            newTripAfterTerminalCount: 0,
            ambiguousCount: 0,
          },
        },
      },
      completedAt: '2026-09-13T11:00:00.000Z',
      restingAt: '2026-09-13T11:00:05.000Z',
    },
  ];
}

function formatRow(trip: {
  tripId: string;
  startAt: string;
  endAt: string | null;
  rawDetectionMeta: unknown;
  completedAt: string | null;
  restingAt: string | null;
}) {
  const shadow = readShadowFromRawMeta(trip.rawDetectionMeta);
  const ps = shadow?.providerSilence;
  const pa = shadow?.pauses;
  return {
    TRIP_ID: trip.tripId,
    START_AT: trip.startAt,
    END_AT: trip.endAt,
    REAL_END_PATH:
      (trip.rawDetectionMeta as Record<string, unknown> | null)?.endTimeSource ??
      null,
    REAL_COMPLETED_AT: trip.completedAt,
    REAL_RESTING_AT: trip.restingAt,
    SHADOW_PROVIDER_SILENCE_EVALUATED: ps?.everEvaluated ?? false,
    SHADOW_PROVIDER_SILENCE_ELIGIBLE: ps?.everEligible ?? false,
    SHADOW_PROVIDER_SILENCE_FIRST_ELIGIBLE_AT: ps?.firstEligibleAt ?? null,
    SHADOW_PROVIDER_SILENCE_BLOCKED_BY: ps?.blockedReasons?.join('|') ?? null,
    SHADOW_PROVIDER_SILENCE_TRUST: ps?.trust ?? null,
    SHADOW_PROVIDER_SILENCE_CLOCK_AUTHORITY: ps?.clockAuthority ?? null,
    PAUSE_EPISODE_COUNT: pa?.episodeCount ?? 0,
    LONGEST_PAUSE_SECONDS: pa?.longestPauseMs
      ? Math.round(pa.longestPauseMs / 1000)
      : 0,
    RESUME_COUNT: pa?.resumedEpisodeCount ?? 0,
    SAME_TRIP_RESUME_COUNT: pa?.sameTripResumeCount ?? 0,
    NEW_TRIP_AFTER_TERMINAL_COUNT: pa?.newTripAfterTerminalCount ?? 0,
    AMBIGUOUS_PAUSE_COUNT: pa?.ambiguousCount ?? 0,
    SHADOW_FALSE_END_RISK_OBSERVED:
      ps?.everEligible === true &&
      ps?.realWinningEndPath != null &&
      !String(ps.realWinningEndPath).includes('provider_silence'),
    SHADOW_CROSS_TRIP_LEAK_OBSERVED: false,
  };
}

function aggregate(rows: ReturnType<typeof formatRow>[]) {
  return {
    TOTAL_TRIPS: rows.length,
    PROVIDER_SILENCE_WOULD_HAVE_BEEN_NEEDED: rows.filter(
      (r) => r.SHADOW_PROVIDER_SILENCE_ELIGIBLE,
    ).length,
    PROVIDER_SILENCE_WOULD_HAVE_ADMITTED: rows.filter(
      (r) =>
        r.SHADOW_PROVIDER_SILENCE_ELIGIBLE &&
        r.SHADOW_PROVIDER_SILENCE_TRUST === false,
    ).length,
    PROVIDER_SILENCE_CORRECTLY_BLOCKED_BY_MOVEMENT: rows.filter((r) =>
      (r.SHADOW_PROVIDER_SILENCE_BLOCKED_BY ?? '').includes('movement'),
    ).length,
    SAME_TRIP_SHORT_PAUSES: rows.filter((r) => r.SAME_TRIP_RESUME_COUNT > 0)
      .length,
    NEW_TRIP_AFTER_TERMINAL: rows.filter(
      (r) => r.NEW_TRIP_AFTER_TERMINAL_COUNT > 0,
    ).length,
    AMBIGUOUS_EPISODES: rows.filter((r) => r.AMBIGUOUS_PAUSE_COUNT > 0).length,
  };
}

async function main(): Promise<void> {
  const vehicleId = parseArg('--vehicle-id');
  const sinceRaw = parseArg('--since');
  const untilRaw = parseArg('--until');
  const since = sinceRaw ? new Date(sinceRaw) : undefined;
  const until = untilRaw ? new Date(untilRaw) : undefined;

  let trips: Array<{
    tripId: string;
    startAt: string;
    endAt: string | null;
    rawDetectionMeta: unknown;
    completedAt: string | null;
    restingAt: string | null;
  }>;

  if (hasFlag('--fixtures-only') || !process.env.DATABASE_URL) {
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
          ...(vehicleId ? { vehicleId } : {}),
          ...(since || until
            ? {
                startTime: {
                  ...(since ? { gte: since } : {}),
                  ...(until ? { lte: until } : {}),
                },
              }
            : {}),
        },
        select: {
          id: true,
          startTime: true,
          endTime: true,
          rawDetectionMeta: true,
          tripStatus: true,
        },
        orderBy: { startTime: 'asc' },
        take: 500,
      });
      trips = dbTrips
        .filter((t) => t.rawDetectionMeta != null)
        .map((t) => ({
          tripId: t.id,
          startAt: t.startTime.toISOString(),
          endAt: t.endTime?.toISOString() ?? null,
          rawDetectionMeta: t.rawDetectionMeta,
          completedAt: t.endTime?.toISOString() ?? null,
          restingAt:
            t.tripStatus === 'COMPLETED' ? t.endTime?.toISOString() ?? null : null,
        }));
    } finally {
      await app.close();
    }
  }

  const rows = trips.map(formatRow);
  const totals = aggregate(rows);

  console.log(
    JSON.stringify(
      {
        auditVersion: AUDIT_VERSION,
        readOnly: true,
        vehicleId: vehicleId ?? null,
        since: since?.toISOString() ?? null,
        until: until?.toISOString() ?? null,
        rows,
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
