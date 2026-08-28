/**
 * READ-ONLY Battery V2 Stage 1 evidence collector for the LV_REST_WINDOW
 * session-liveness fix (PR #1383).
 *
 * Answers one question for a finalized trip: was the LV_REST_WINDOW opened
 * from the authoritative finalized trip alone, or did it require a provider
 * observation that arrived after Trip Detection persisted RESTING?
 *
 * The script never writes. It reads canonical rows only and derives the
 * deterministic job/session identities from the same builders the runtime
 * uses, so the reported identities are the runtime identities.
 *
 * Usage (VPS, inside the deployed release):
 *   cd /opt/synqdrive/current/backend
 *   npx ts-node -r tsconfig-paths/register \
 *     scripts/ops/battery-v2-lv-rest-liveness-evidence.ts --since=2026-08-28T15:32:00Z
 *   npx ts-node -r tsconfig-paths/register \
 *     scripts/ops/battery-v2-lv-rest-liveness-evidence.ts --trip-id=<uuid>
 *
 * Options:
 *   --trip-id=<uuid>     Inspect one specific trip.
 *   --since=<iso>        Only consider trips whose endTime is at/after <iso>.
 *                        Use the deployment timestamp to restrict the report to
 *                        qualifying post-deploy trips.
 *   --limit=<n>          Number of trips to report (default 5).
 *   --deployed-sha=<sha> Recorded verbatim in the report header.
 *   --format=json        Machine-readable output instead of the console table.
 *
 * Output contains operational identifiers (org/vehicle/trip UUIDs) and must
 * never be committed to the repository.
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient, TripStatus } from '@prisma/client';
import { buildLvRestSessionOpenJobIdempotencyKey } from '../../src/modules/vehicle-intelligence/battery-health/jobs/battery-v2-job-idempotency.policy';
import { buildBatteryV2JobId } from '../../src/modules/vehicle-intelligence/battery-health/jobs/battery-v2-job-queue.util';
import { buildLvRestWindowIdempotencyKey } from '../../src/modules/vehicle-intelligence/battery-health/battery-v2-domain';
import {
  readLvRestWindowSessionMetadata,
  type LvRestTargetJobMetadata,
} from '../../src/modules/vehicle-intelligence/battery-health/lv-rest-window/lv-rest-window-target.metadata';

{
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

interface TargetEvidence {
  targetType: 'REST_60M' | 'REST_6H';
  scheduledFor: string | null;
  enqueuedAt: string | null;
  bullJobId: string | null;
  jobStatus: string | null;
  completedAt: string | null;
  measurement: {
    id: string;
    quality: string;
    numericValue: number | null;
    unit: string | null;
    observedAt: string;
    createdAt: string;
  } | null;
  dueAt: string | null;
  dueInMinutes: number | null;
}

interface TripEvidence {
  organizationId: string | null;
  vehicleId: string;
  tripId: string;
  tripStartTime: string | null;
  tripEndTime: string | null;
  tripStatus: string;
  detectionState: {
    state: string;
    activeTripId: string | null;
    lastActivityAt: string | null;
    updatedAt: string | null;
  } | null;
  sessionOpenJob: {
    idempotencyKey: string;
    bullJobId: string;
    deadLetter: {
      errorCode: string;
      errorMessage: string | null;
      attempts: number;
      failedAt: string;
    } | null;
  };
  restWindow: {
    sessionId: string;
    tripId: string | null;
    idempotencyKey: string;
    expectedIdempotencyKey: string;
    anchorAt: string | null;
    anchorMatchesTripEndTime: boolean;
    fsmState: string | null;
    status: string;
    quality: string;
    createdAt: string;
    duplicateSessionCount: number;
  } | null;
  targets: TargetEvidence[];
  providerObservation: {
    sourceTimestamp: string | null;
    providerFetchedAt: string | null;
    lastLiveVoltageObservedAt: string | null;
    lastLiveVoltageReceivedAt: string | null;
    liveVoltageAfterTripEnd: number;
  };
  livenessVerdict: string;
}

async function collectTripEvidence(
  prisma: PrismaClient,
  trip: {
    id: string;
    vehicleId: string;
    startTime: Date | null;
    endTime: Date | null;
    tripStatus: TripStatus;
    vehicle: { organizationId: string | null };
  },
): Promise<TripEvidence> {
  const organizationId = trip.vehicle.organizationId;
  const anchor = trip.endTime;

  const detectionState = await prisma.vehicleTripDetectionState.findUnique({
    where: { vehicleId: trip.vehicleId },
    select: {
      state: true,
      activeTripId: true,
      lastActivityAt: true,
      updatedAt: true,
    },
  });

  const sessionOpenKey = anchor
    ? buildLvRestSessionOpenJobIdempotencyKey({
        vehicleId: trip.vehicleId,
        anchorAt: anchor,
      })
    : null;

  const deadLetter = sessionOpenKey
    ? await prisma.batteryV2JobDeadLetter.findFirst({
        where: {
          jobType: 'BATTERY_LV_REST_SESSION_OPEN',
          idempotencyKey: sessionOpenKey,
        },
        select: {
          errorCode: true,
          errorMessage: true,
          attempts: true,
          failedAt: true,
        },
      })
    : null;

  const expectedSessionKey = anchor
    ? buildLvRestWindowIdempotencyKey(trip.vehicleId, anchor)
    : null;

  const sessions = await prisma.batteryMeasurementSession.findMany({
    where: {
      vehicleId: trip.vehicleId,
      type: 'LV_REST_WINDOW',
      ...(expectedSessionKey
        ? { OR: [{ idempotencyKey: expectedSessionKey }, { tripId: trip.id }] }
        : { tripId: trip.id }),
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      tripId: true,
      idempotencyKey: true,
      startedAt: true,
      status: true,
      quality: true,
      metadata: true,
      createdAt: true,
    },
  });

  const session = sessions[0] ?? null;
  const metadata = session ? readLvRestWindowSessionMetadata(session.metadata) : {};

  const targets: TargetEvidence[] = [];
  for (const targetType of ['REST_60M', 'REST_6H'] as const) {
    const target: LvRestTargetJobMetadata | undefined =
      metadata.scheduledTargets?.[targetType];
    const measurement = session
      ? await prisma.batteryMeasurement.findFirst({
          where: { sessionId: session.id, type: targetType },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            quality: true,
            numericValue: true,
            unit: true,
            observedAt: true,
            createdAt: true,
          },
        })
      : null;

    const dueAt =
      anchor != null
        ? new Date(
            anchor.getTime() + (targetType === 'REST_6H' ? 6 * 3600_000 : 3600_000),
          )
        : null;

    targets.push({
      targetType,
      scheduledFor: target?.scheduledFor ?? null,
      enqueuedAt: target?.enqueuedAt ?? null,
      bullJobId: target?.bullJobId ?? null,
      jobStatus: target?.status ?? null,
      completedAt: target?.completedAt ?? null,
      measurement: measurement
        ? {
            id: measurement.id,
            quality: measurement.quality,
            numericValue: measurement.numericValue,
            unit: measurement.unit,
            observedAt: measurement.observedAt.toISOString(),
            createdAt: measurement.createdAt.toISOString(),
          }
        : null,
      dueAt: iso(dueAt),
      dueInMinutes:
        dueAt != null ? Math.round((dueAt.getTime() - Date.now()) / 60_000) : null,
    });
  }

  const latestState = await prisma.vehicleLatestState.findUnique({
    where: { vehicleId: trip.vehicleId },
    select: { sourceTimestamp: true, providerFetchedAt: true },
  });

  const lastLiveVoltage = await prisma.batteryMeasurement.findFirst({
    where: { vehicleId: trip.vehicleId, type: 'LIVE_VOLTAGE' },
    orderBy: { observedAt: 'desc' },
    select: { observedAt: true, receivedAt: true },
  });

  const liveVoltageAfterTripEnd = anchor
    ? await prisma.batteryMeasurement.count({
        where: {
          vehicleId: trip.vehicleId,
          type: 'LIVE_VOLTAGE',
          observedAt: { gt: anchor },
        },
      })
    : 0;

  // The fix exists so that session creation does not depend on a provider
  // observation arriving after the trip was finalized. A session that exists
  // while `liveVoltageAfterTripEnd === 0` is direct evidence of that.
  let livenessVerdict: string;
  if (!session) {
    livenessVerdict = 'NO_SESSION';
  } else if (liveVoltageAfterTripEnd === 0) {
    livenessVerdict = 'OBSERVATION_INDEPENDENT (no post-anchor LIVE_VOLTAGE exists)';
  } else {
    livenessVerdict = `INCONCLUSIVE (${liveVoltageAfterTripEnd} post-anchor LIVE_VOLTAGE rows — a later observation was available)`;
  }

  return {
    organizationId,
    vehicleId: trip.vehicleId,
    tripId: trip.id,
    tripStartTime: iso(trip.startTime),
    tripEndTime: iso(trip.endTime),
    tripStatus: trip.tripStatus,
    detectionState: detectionState
      ? {
          state: detectionState.state,
          activeTripId: detectionState.activeTripId,
          lastActivityAt: iso(detectionState.lastActivityAt),
          updatedAt: iso(detectionState.updatedAt),
        }
      : null,
    sessionOpenJob: {
      idempotencyKey: sessionOpenKey ?? '(no trip endTime)',
      bullJobId: sessionOpenKey ? buildBatteryV2JobId(sessionOpenKey) : '(none)',
      deadLetter: deadLetter
        ? {
            errorCode: deadLetter.errorCode,
            errorMessage: deadLetter.errorMessage,
            attempts: deadLetter.attempts,
            failedAt: deadLetter.failedAt.toISOString(),
          }
        : null,
    },
    restWindow: session
      ? {
          sessionId: session.id,
          tripId: session.tripId,
          idempotencyKey: session.idempotencyKey,
          expectedIdempotencyKey: expectedSessionKey ?? '(no trip endTime)',
          anchorAt: iso(session.startedAt),
          anchorMatchesTripEndTime:
            anchor != null && session.startedAt.getTime() === anchor.getTime(),
          fsmState: metadata.lvRestWindowState ?? null,
          status: session.status,
          quality: session.quality,
          createdAt: session.createdAt.toISOString(),
          duplicateSessionCount: sessions.length - 1,
        }
      : null,
    targets,
    providerObservation: {
      sourceTimestamp: iso(latestState?.sourceTimestamp),
      providerFetchedAt: iso(latestState?.providerFetchedAt),
      lastLiveVoltageObservedAt: iso(lastLiveVoltage?.observedAt),
      lastLiveVoltageReceivedAt: iso(lastLiveVoltage?.receivedAt),
      liveVoltageAfterTripEnd,
    },
    livenessVerdict,
  };
}

function renderConsole(deployedSha: string, evidence: TripEvidence[]): void {
  console.log(`DEPLOYED_SHA: ${deployedSha}`);
  console.log(`COLLECTED_AT: ${new Date().toISOString()}`);
  console.log(`TRIPS: ${evidence.length}`);

  for (const e of evidence) {
    console.log('');
    console.log('='.repeat(78));
    console.log(`trip ${e.tripId}  vehicle ${e.vehicleId}  org ${e.organizationId}`);
    console.log('='.repeat(78));
    console.log(
      `  trip:            ${e.tripStartTime} -> ${e.tripEndTime} [${e.tripStatus}]`,
    );
    if (e.detectionState) {
      console.log(
        `  detection:       ${e.detectionState.state} activeTrip=${e.detectionState.activeTripId ?? 'null'} lastActivityAt=${e.detectionState.lastActivityAt} updatedAt=${e.detectionState.updatedAt}`,
      );
    } else {
      console.log('  detection:       (none)');
    }
    console.log(`  open job key:    ${e.sessionOpenJob.idempotencyKey}`);
    console.log(`  open job bullId: ${e.sessionOpenJob.bullJobId}`);
    if (e.sessionOpenJob.deadLetter) {
      const dl = e.sessionOpenJob.deadLetter;
      console.log(
        `  open job DLQ:    ${dl.errorCode} attempts=${dl.attempts} failedAt=${dl.failedAt} ${dl.errorMessage ?? ''}`,
      );
    }
    if (e.restWindow) {
      const w = e.restWindow;
      console.log(`  LV_REST_WINDOW:  ${w.sessionId}`);
      console.log(`    tripId:        ${w.tripId ?? 'null'}`);
      console.log(
        `    anchor:        ${w.anchorAt} (matches trip.endTime: ${w.anchorMatchesTripEndTime})`,
      );
      console.log(`    key:           ${w.idempotencyKey}`);
      console.log(`    expected key:  ${w.expectedIdempotencyKey}`);
      console.log(
        `    state:         fsm=${w.fsmState ?? 'n/a'} status=${w.status} quality=${w.quality}`,
      );
      console.log(`    createdAt:     ${w.createdAt}`);
      console.log(`    duplicates:    ${w.duplicateSessionCount}`);
    } else {
      console.log('  LV_REST_WINDOW:  MISSING');
    }
    for (const t of e.targets) {
      console.log(
        `  ${t.targetType}: due=${t.dueAt} (${t.dueInMinutes != null ? `${t.dueInMinutes}m` : 'n/a'}) status=${t.jobStatus ?? 'not_scheduled'} scheduledFor=${t.scheduledFor ?? 'n/a'} enqueuedAt=${t.enqueuedAt ?? 'n/a'} completedAt=${t.completedAt ?? 'n/a'}`,
      );
      console.log(
        `    measurement:   ${
          t.measurement
            ? `${t.measurement.quality} value=${t.measurement.numericValue ?? 'null'}${t.measurement.unit ?? ''} observedAt=${t.measurement.observedAt} createdAt=${t.measurement.createdAt}`
            : 'none'
        }`,
      );
    }
    const p = e.providerObservation;
    console.log(
      `  provider:        source_timestamp=${p.sourceTimestamp} provider_fetched_at=${p.providerFetchedAt}`,
    );
    console.log(
      `    LIVE_VOLTAGE:  lastObservedAt=${p.lastLiveVoltageObservedAt} lastReceivedAt=${p.lastLiveVoltageReceivedAt} afterTripEnd=${p.liveVoltageAfterTripEnd}`,
    );
    console.log(`  LIVENESS:        ${e.livenessVerdict}`);
  }
}

async function main() {
  const tripId = parseArg('--trip-id');
  const since = parseArg('--since');
  const limitRaw = parseArg('--limit');
  const limit = limitRaw ? Number(limitRaw) : 5;
  const deployedSha = parseArg('--deployed-sha') ?? '(not supplied)';
  const format = parseArg('--format') ?? 'console';

  if (!Number.isFinite(limit) || limit < 1) {
    throw new Error('--limit must be a positive number');
  }
  const sinceDate = since ? new Date(since) : null;
  if (sinceDate && Number.isNaN(sinceDate.getTime())) {
    throw new Error(`--since is not a valid ISO timestamp: ${since}`);
  }

  const prisma = new PrismaClient();
  try {
    const trips = await prisma.vehicleTrip.findMany({
      where: tripId
        ? { id: tripId }
        : {
            tripStatus: TripStatus.COMPLETED,
            endTime: { not: null, ...(sinceDate ? { gte: sinceDate } : {}) },
          },
      orderBy: { endTime: 'desc' },
      take: tripId ? 1 : limit,
      select: {
        id: true,
        vehicleId: true,
        startTime: true,
        endTime: true,
        tripStatus: true,
        vehicle: { select: { organizationId: true } },
      },
    });

    const evidence: TripEvidence[] = [];
    for (const trip of trips) {
      evidence.push(await collectTripEvidence(prisma, trip));
    }

    if (format === 'json') {
      console.log(
        JSON.stringify(
          { deployedSha, collectedAt: new Date().toISOString(), trips: evidence },
          null,
          2,
        ),
      );
    } else {
      renderConsole(deployedSha, evidence);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
