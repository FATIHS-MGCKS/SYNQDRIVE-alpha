import type { Logger } from '@nestjs/common';
import type { PrismaService } from '@shared/database/prisma.service';
import type { RedisService } from '@shared/redis/redis.service';
import type { Dtc02ObservabilityService } from '../observability/dtc02-observability.service';
import { DTC02_TRIP_FSM_TRANSITION_MAX_AGE_MS } from './dtc-02-adaptive-planner.constants';
import {
  loadDtc02AdaptiveShadowVehicleRows,
  runDtc02AdaptiveShadowPlanForRow,
} from './dtc-02-adaptive-shadow.runtime';
import {
  isDtc02AdaptiveSchedulerShadowConfigValid,
  isDtc02AdaptiveSchedulerShadowEnabled,
  shouldRunDtc02AdaptiveSchedulerShadowForVehicle,
} from './dtc-02-adaptive-shadow.config';
import { buildDtc02TripVsiPlannerContext } from './dtc-02-adaptive-trip-vsi.resolver';
import type { Dtc02TripVsiPlannerContext } from './dtc-02-adaptive-trip-vsi.types';
import {
  buildDtc02TripFsmShadowDedupeKey,
  tryAcquireDtc02TripFsmShadowDedupe,
} from './dtc-02-adaptive-trip-fsm-shadow.dedupe';

export type Dtc02TripFsmShadowEventKind = 'trip_start_confirmed' | 'trip_end_finalized';

export type Dtc02TripFsmShadowHookResult =
  | 'skipped_disabled'
  | 'skipped_not_allowlisted'
  | 'skipped_deduped'
  | 'planned'
  | 'error';

export function applyTripFsmEventPhaseOverride(
  ctx: Dtc02TripVsiPlannerContext,
  eventKind: Dtc02TripFsmShadowEventKind,
  evaluatedAtMs: number,
): Dtc02TripVsiPlannerContext {
  if (eventKind === 'trip_start_confirmed') {
    return {
      ...ctx,
      tripPhase: 'TRIP_START',
      lastTripTransitionAtMs: ctx.lastTripTransitionAtMs ?? evaluatedAtMs,
    };
  }
  return {
    ...ctx,
    tripPhase: 'TRIP_END',
    lastTripTransitionAtMs: ctx.lastTripTransitionAtMs ?? evaluatedAtMs,
  };
}

/**
 * Event-driven adaptive DTC shadow evaluation (no DIMO poll enqueue, no episode writes).
 */
export async function runDtc02AdaptiveShadowOnTripFsmEvent(input: {
  prisma: PrismaService;
  observability?: Dtc02ObservabilityService;
  redis?: RedisService | null;
  vehicleId: string;
  tripId: string;
  eventKind: Dtc02TripFsmShadowEventKind;
  evaluatedAtMs: number;
  logger?: Pick<Logger, 'warn' | 'debug'>;
}): Promise<Dtc02TripFsmShadowHookResult> {
  try {
    if (!isDtc02AdaptiveSchedulerShadowEnabled()) {
      return 'skipped_disabled';
    }
    if (!isDtc02AdaptiveSchedulerShadowConfigValid()) {
      return 'skipped_disabled';
    }
    if (!shouldRunDtc02AdaptiveSchedulerShadowForVehicle(input.vehicleId)) {
      return 'skipped_not_allowlisted';
    }

    const dedupeKey = buildDtc02TripFsmShadowDedupeKey({
      vehicleId: input.vehicleId,
      tripId: input.tripId,
      eventKind: input.eventKind,
    });
    const acquired = await tryAcquireDtc02TripFsmShadowDedupe({
      redis: input.redis,
      dedupeKey,
    });
    if (!acquired) {
      return 'skipped_deduped';
    }

    const rows = await loadDtc02AdaptiveShadowVehicleRows(
      input.prisma,
      [input.vehicleId],
      input.evaluatedAtMs,
    );
    const row = rows[0];
    if (!row) {
      return 'error';
    }

    const lastPollOrIntentAtMs =
      row.lastPollFetchAt?.getTime() ?? row.lastDtcPollAt?.getTime() ?? null;
    const baseTripVsi = buildDtc02TripVsiPlannerContext({
      evaluatedAtMs: input.evaluatedAtMs,
      inTripInterval: row.inTripInterval,
      tripDetectionState: row.tripDetectionState as import('@prisma/client').TripDetectionState | null,
      lastActivityAtMs: row.lastActivityAt?.getTime() ?? null,
      possibleStartEnteredAtMs: row.possibleStartEnteredAt?.getTime() ?? null,
      possibleEndEnteredAtMs: row.possibleEndEnteredAt?.getTime() ?? null,
      vsiDtcLastSourceTimestamp: row.vsiDtcLastSourceTimestamp,
      tripFsmTransitionMaxAgeMs: DTC02_TRIP_FSM_TRANSITION_MAX_AGE_MS,
      lastPollOrIntentAtMs,
    });
    const tripVsiContext = applyTripFsmEventPhaseOverride(
      baseTripVsi,
      input.eventKind,
      input.evaluatedAtMs,
    );

    const plan = runDtc02AdaptiveShadowPlanForRow(
      row,
      input.evaluatedAtMs,
      tripVsiContext,
    );

    input.observability?.recordAdaptiveShadowPhase('run');
    input.observability?.recordAdaptiveShadowPlan(plan);
    input.logger?.debug?.(
      `DTC-02 adaptive shadow trip-fsm ${input.eventKind} vehicle=${input.vehicleId} reason=${plan.decisionReason}`,
    );
    return 'planned';
  } catch (err) {
    input.observability?.recordAdaptiveShadowPhase('error');
    input.logger?.warn?.(
      `DTC-02 adaptive shadow trip-fsm hook failed (non-fatal): ${(err as Error).message}`,
    );
    return 'error';
  }
}
