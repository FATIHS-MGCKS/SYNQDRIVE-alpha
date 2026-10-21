import { Prisma } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import {
  START_PROXY_PILOT_PROVIDER_LIFECYCLE,
  type StartProxyPilotProviderLifecycleStateV1,
} from './start-proxy-pilot-provider-budget.v1';

export type StartProxyPilotBudgetReserveOutcomeV1 =
  | { status: 'reserved'; lifecycleState: StartProxyPilotProviderLifecycleStateV1 }
  | {
      status: 'exhausted';
      reason:
        | 'kill_switch'
        | 'global_budget'
        | 'per_trip_duplicate'
        | 'misconfigured';
      lifecycleState?: StartProxyPilotProviderLifecycleStateV1;
    };

type BudgetRow = { lifecycle_state: string };

/** Thrown inside reserve transaction to roll back trip insert when global cap race is lost. */
export class StartProxyPilotProviderBudgetReservationFailedV1 extends Error {
  readonly reason: 'global_budget' | 'kill_switch';

  constructor(reason: 'global_budget' | 'kill_switch') {
    super(`start_proxy_pilot_budget_reservation_failed:${reason}`);
    this.name = 'StartProxyPilotProviderBudgetReservationFailedV1';
    this.reason = reason;
  }
}

export async function tryReserveStartProxyPilotProviderBudgetV1(
  prisma: PrismaService,
  input: {
    organizationId: string;
    vehicleId: string;
    pilotEpoch: string;
    tripId: string;
    queryFingerprint: string;
    maxTotalAttempts: number;
    maxRequestsPerTrip: number;
    killSwitchActive: boolean;
    reservedAt: Date;
  },
): Promise<StartProxyPilotBudgetReserveOutcomeV1> {
  if (input.killSwitchActive) {
    return { status: 'exhausted', reason: 'kill_switch' };
  }
  if (input.maxTotalAttempts < 1 || input.maxRequestsPerTrip < 1) {
    return { status: 'exhausted', reason: 'misconfigured' };
  }

  try {
    return await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO battery_start_proxy_pilot_global_budget (
        pilot_epoch, total_attempts, max_total_attempts, kill_switch_active, created_at, updated_at
      ) VALUES (
        ${input.pilotEpoch},
        0,
        ${input.maxTotalAttempts},
        ${input.killSwitchActive},
        ${input.reservedAt},
        ${input.reservedAt}
      )
      ON CONFLICT (pilot_epoch) DO NOTHING
    `);

    const globalRows = await tx.$queryRaw<
      Array<{ total_attempts: number; max_total_attempts: number; kill_switch_active: boolean }>
    >(Prisma.sql`
      SELECT total_attempts, max_total_attempts, kill_switch_active
      FROM battery_start_proxy_pilot_global_budget
      WHERE pilot_epoch = ${input.pilotEpoch}
      FOR UPDATE
    `);

    const global = globalRows[0];
    if (!global || global.kill_switch_active) {
      return { status: 'exhausted', reason: 'kill_switch' };
    }

    const existingTrip = await tx.$queryRaw<BudgetRow[]>(Prisma.sql`
      SELECT lifecycle_state
      FROM battery_start_proxy_pilot_provider_requests
      WHERE organization_id = ${input.organizationId}
        AND vehicle_id = ${input.vehicleId}
        AND pilot_epoch = ${input.pilotEpoch}
        AND trip_id = ${input.tripId}
      LIMIT 1
    `);
    if (existingTrip.length > 0) {
      return {
        status: 'exhausted',
        reason: 'per_trip_duplicate',
        lifecycleState: existingTrip[0]?.lifecycle_state as StartProxyPilotProviderLifecycleStateV1,
      };
    }

    if (global.total_attempts >= global.max_total_attempts) {
      return { status: 'exhausted', reason: 'global_budget' };
    }

    const inserted = await tx.$queryRaw<BudgetRow[]>(Prisma.sql`
      INSERT INTO battery_start_proxy_pilot_provider_requests (
        organization_id,
        vehicle_id,
        pilot_epoch,
        trip_id,
        lifecycle_state,
        query_fingerprint,
        reserved_at,
        request_started_at,
        updated_at
      ) VALUES (
        ${input.organizationId},
        ${input.vehicleId},
        ${input.pilotEpoch},
        ${input.tripId},
        ${START_PROXY_PILOT_PROVIDER_LIFECYCLE.REQUEST_STARTED},
        ${input.queryFingerprint},
        ${input.reservedAt},
        ${input.reservedAt},
        ${input.reservedAt}
      )
      ON CONFLICT (organization_id, vehicle_id, pilot_epoch, trip_id)
      DO NOTHING
      RETURNING lifecycle_state
    `);

    if (inserted.length === 0) {
      return { status: 'exhausted', reason: 'per_trip_duplicate' };
    }

    const incremented = await tx.$executeRaw(Prisma.sql`
      UPDATE battery_start_proxy_pilot_global_budget
      SET
        total_attempts = total_attempts + 1,
        updated_at = ${input.reservedAt}
      WHERE pilot_epoch = ${input.pilotEpoch}
        AND total_attempts < max_total_attempts
        AND kill_switch_active = FALSE
    `);

    if (incremented !== 1) {
      throw new StartProxyPilotProviderBudgetReservationFailedV1('global_budget');
    }

    return {
      status: 'reserved',
      lifecycleState: START_PROXY_PILOT_PROVIDER_LIFECYCLE.REQUEST_STARTED,
    };
    });
  } catch (err: unknown) {
    if (err instanceof StartProxyPilotProviderBudgetReservationFailedV1) {
      return { status: 'exhausted', reason: err.reason };
    }
    throw err;
  }
}

export async function finalizeStartProxyPilotProviderBudgetV1(
  prisma: PrismaService,
  input: {
    organizationId: string;
    vehicleId: string;
    pilotEpoch: string;
    tripId: string;
    lifecycleState:
      | typeof START_PROXY_PILOT_PROVIDER_LIFECYCLE.COMPLETED
      | typeof START_PROXY_PILOT_PROVIDER_LIFECYCLE.UNKNOWN_OUTCOME;
    outcomeDetail?: string | null;
    terminalAt: Date;
  },
): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE battery_start_proxy_pilot_provider_requests
    SET
      lifecycle_state = ${input.lifecycleState},
      terminal_at = ${input.terminalAt},
      outcome_detail = ${input.outcomeDetail ?? null},
      updated_at = ${input.terminalAt}
    WHERE organization_id = ${input.organizationId}
      AND vehicle_id = ${input.vehicleId}
      AND pilot_epoch = ${input.pilotEpoch}
      AND trip_id = ${input.tripId}
      AND lifecycle_state = ${START_PROXY_PILOT_PROVIDER_LIFECYCLE.REQUEST_STARTED}
  `);
}
