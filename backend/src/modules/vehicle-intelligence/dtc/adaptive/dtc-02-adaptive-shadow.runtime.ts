import type { TripDetectionState } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import type { Dtc02ObservabilityService } from '../observability/dtc02-observability.service';
import {
  deriveWebhookEvidenceQuality,
  planDtc02AdaptivePollCheck,
} from './dtc-02-adaptive-planner';
import type { Dtc02ProviderErrorState } from './dtc-02-adaptive-planner.types';
import {
  isDtc02AdaptiveSchedulerShadowConfigValid,
  shouldRunDtc02AdaptiveSchedulerShadowForVehicle,
} from './dtc-02-adaptive-shadow.config';
import { DTC02_TRIP_FSM_TRANSITION_MAX_AGE_MS } from './dtc-02-adaptive-planner.constants';
import { extractVsiDiagnosticTroubleCodeLastSourceTimestamp } from './dtc-02-adaptive-vsi-snapshot.util';
import { buildDtc02TripVsiPlannerContext } from './dtc-02-adaptive-trip-vsi.resolver';

function mapProviderErrorState(
  pollStatus: string | null | undefined,
  pollError: string | null | undefined,
): Dtc02ProviderErrorState {
  const status = (pollStatus ?? '').toLowerCase();
  const err = (pollError ?? '').toLowerCase();
  if (!status && !err) return 'none';
  if (err.includes('403') || err.includes('auth')) return 'auth_denied';
  if (status.includes('timeout') || err.includes('timeout') || err.includes('etimedout')) {
    return 'transient';
  }
  if (status.includes('rejected') || status.includes('failure') || status.includes('error')) {
    return 'transient';
  }
  if (status === 'success') return 'none';
  return 'unknown';
}

export type Dtc02AdaptiveShadowVehicleRow = {
  vehicleId: string;
  registryLifecycle: string | null;
  dimoTokenId: number | null;
  lastSuccessfulDtcCheckAt: Date | null;
  lastDtcPollAt: Date | null;
  dtcPollStatus: string | null;
  dtcPollError: string | null;
  lastConfirmedCompleteSourceAt: Date | null;
  lastPartialWebhookSourceAt: Date | null;
  lastPollFetchAt: Date | null;
  activeDtcCount: number;
  tripDetectionState: string | null;
  possibleStartEnteredAt: Date | null;
  possibleEndEnteredAt: Date | null;
  lastActivityAt: Date | null;
  inTripInterval: boolean;
  vsiDtcLastSourceTimestamp: string | null;
};

/**
 * Read-only batch load for shadow allowlisted vehicles on an existing fan-out tick.
 */
async function loadInTripVehicleIdSet(
  prisma: PrismaService,
  vehicleIds: string[],
  atMs: number,
): Promise<Set<string>> {
  if (vehicleIds.length === 0) return new Set();
  const at = new Date(atMs);
  const trips = await prisma.vehicleTrip.findMany({
    where: {
      vehicleId: { in: vehicleIds },
      startTime: { lte: at },
      OR: [{ endTime: null }, { endTime: { gte: at } }],
    },
    select: { vehicleId: true },
  });
  return new Set(trips.map((t) => t.vehicleId));
}

function pickLatestVsiDtcTimestampByVehicle(
  profiles: Array<{ vehicleId: string; signalsSnapshot: unknown }>,
): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const row of profiles) {
    if (map.has(row.vehicleId)) continue;
    map.set(
      row.vehicleId,
      extractVsiDiagnosticTroubleCodeLastSourceTimestamp(row.signalsSnapshot),
    );
  }
  return map;
}

export async function loadDtc02AdaptiveShadowVehicleRows(
  prisma: PrismaService,
  vehicleIds: string[],
  evaluatedAtMs: number,
): Promise<Dtc02AdaptiveShadowVehicleRow[]> {
  if (vehicleIds.length === 0) return [];

  const [vehicles, activeCounts, heads, tripStates, inTripSet, vsiProfiles] = await Promise.all([
    prisma.vehicle.findMany({
      where: { id: { in: vehicleIds } },
      select: {
        id: true,
        registryLifecycle: true,
        dimoVehicle: { select: { tokenId: true } },
        latestState: {
          select: {
            lastDtcSuccessfulCheckAt: true,
            lastDtcPollAt: true,
            dtcPollStatus: true,
            dtcPollError: true,
          },
        },
      },
    }),
    prisma.vehicleDtcEvent.groupBy({
      by: ['vehicleId'],
      where: { vehicleId: { in: vehicleIds }, isActive: true },
      _count: { _all: true },
    }),
    prisma.vehicleDtcSourceHead.findMany({
      where: { vehicleId: { in: vehicleIds } },
      select: {
        vehicleId: true,
        lastConfirmedCompleteSourceAt: true,
        lastPartialWebhookSourceAt: true,
        lastPollFetchAt: true,
      },
    }),
    prisma.vehicleTripDetectionState.findMany({
      where: { vehicleId: { in: vehicleIds } },
      select: {
        vehicleId: true,
        state: true,
        possibleStartEnteredAt: true,
        possibleEndEnteredAt: true,
        lastActivityAt: true,
      },
    }),
    loadInTripVehicleIdSet(prisma, vehicleIds, evaluatedAtMs),
    prisma.vehicleSignalCapabilityProfile.findMany({
      where: { vehicleId: { in: vehicleIds } },
      orderBy: { evaluatedAt: 'desc' },
      select: { vehicleId: true, signalsSnapshot: true },
    }),
  ]);

  const activeMap = new Map(activeCounts.map((r) => [r.vehicleId, r._count._all]));
  const headMap = new Map(heads.map((h) => [h.vehicleId, h]));
  const tripMap = new Map(tripStates.map((t) => [t.vehicleId, t]));
  const vsiMap = pickLatestVsiDtcTimestampByVehicle(vsiProfiles);

  return vehicles.map((v) => {
    const head = headMap.get(v.id);
    const trip = tripMap.get(v.id);
    const vls = v.latestState;
    return {
      vehicleId: v.id,
      registryLifecycle: v.registryLifecycle,
      dimoTokenId: v.dimoVehicle?.tokenId ?? null,
      lastSuccessfulDtcCheckAt: vls?.lastDtcSuccessfulCheckAt ?? null,
      lastDtcPollAt: vls?.lastDtcPollAt ?? null,
      dtcPollStatus: vls?.dtcPollStatus ?? null,
      dtcPollError: vls?.dtcPollError ?? null,
      lastConfirmedCompleteSourceAt: head?.lastConfirmedCompleteSourceAt ?? null,
      lastPartialWebhookSourceAt: head?.lastPartialWebhookSourceAt ?? null,
      lastPollFetchAt: head?.lastPollFetchAt ?? null,
      activeDtcCount: activeMap.get(v.id) ?? 0,
      tripDetectionState: trip?.state ?? null,
      possibleStartEnteredAt: trip?.possibleStartEnteredAt ?? null,
      possibleEndEnteredAt: trip?.possibleEndEnteredAt ?? null,
      lastActivityAt: trip?.lastActivityAt ?? null,
      inTripInterval: inTripSet.has(v.id),
      vsiDtcLastSourceTimestamp: vsiMap.get(v.id) ?? null,
    };
  });
}

export function runDtc02AdaptiveShadowPlanForRow(
  row: Dtc02AdaptiveShadowVehicleRow,
  evaluatedAtMs: number,
): ReturnType<typeof planDtc02AdaptivePollCheck> {
  const webhookEvidenceQuality = deriveWebhookEvidenceQuality({
    lastConfirmedCompleteSourceAtMs: row.lastConfirmedCompleteSourceAt?.getTime() ?? null,
    lastPartialWebhookSourceAtMs: row.lastPartialWebhookSourceAt?.getTime() ?? null,
    evaluatedAtMs,
  });

  const lastPollOrIntentAtMs =
    row.lastPollFetchAt?.getTime() ?? row.lastDtcPollAt?.getTime() ?? null;

  const tripVsiContext = buildDtc02TripVsiPlannerContext({
    evaluatedAtMs,
    inTripInterval: row.inTripInterval,
    tripDetectionState: row.tripDetectionState as TripDetectionState | null,
    lastActivityAtMs: row.lastActivityAt?.getTime() ?? null,
    possibleStartEnteredAtMs: row.possibleStartEnteredAt?.getTime() ?? null,
    possibleEndEnteredAtMs: row.possibleEndEnteredAt?.getTime() ?? null,
    vsiDtcLastSourceTimestamp: row.vsiDtcLastSourceTimestamp,
    tripFsmTransitionMaxAgeMs: DTC02_TRIP_FSM_TRANSITION_MAX_AGE_MS,
    lastPollOrIntentAtMs,
  });

  return planDtc02AdaptivePollCheck({
    registryLifecycle: row.registryLifecycle ?? 'ACTIVE',
    providerCapability: row.dimoTokenId != null ? 'dimo_linked' : 'unknown',
    lastSuccessfulDtcCheckAtMs: row.lastSuccessfulDtcCheckAt?.getTime() ?? null,
    lastPollFetchAtMs: lastPollOrIntentAtMs,
    lastConfirmedCompleteSourceAtMs: row.lastConfirmedCompleteSourceAt?.getTime() ?? null,
    lastPartialWebhookSourceAtMs: row.lastPartialWebhookSourceAt?.getTime() ?? null,
    webhookEvidenceQuality,
    hasActiveDtc: row.activeDtcCount > 0,
    providerErrorState: mapProviderErrorState(row.dtcPollStatus, row.dtcPollError),
    evaluatedAtMs,
    tripVsiContext,
  });
}

/**
 * Shadow hook for natural DTC fan-out — must never throw to caller.
 */
export async function runDtc02AdaptiveSchedulerShadowBatch(input: {
  prisma: PrismaService;
  observability?: Dtc02ObservabilityService;
  candidateVehicleIds: string[];
  evaluatedAtMs: number;
  logger?: { warn: (msg: string) => void };
}): Promise<void> {
  try {
    if (!isDtc02AdaptiveSchedulerShadowConfigValid()) {
      input.observability?.recordAdaptiveShadowPhase('skipped_invalid_config');
      return;
    }

    const allowlisted = input.candidateVehicleIds.filter((id) =>
      shouldRunDtc02AdaptiveSchedulerShadowForVehicle(id),
    );
    if (allowlisted.length === 0) {
      return;
    }

    input.observability?.recordAdaptiveShadowPhase('run');
    const rows = await loadDtc02AdaptiveShadowVehicleRows(
      input.prisma,
      allowlisted,
      input.evaluatedAtMs,
    );
    for (const row of rows) {
      const plan = runDtc02AdaptiveShadowPlanForRow(row, input.evaluatedAtMs);
      input.observability?.recordAdaptiveShadowPlan(plan);
    }
  } catch (err) {
    input.observability?.recordAdaptiveShadowPhase('error');
    input.logger?.warn(
      `DTC-02 adaptive scheduler shadow failed (non-fatal): ${(err as Error).message}`,
    );
  }
}
