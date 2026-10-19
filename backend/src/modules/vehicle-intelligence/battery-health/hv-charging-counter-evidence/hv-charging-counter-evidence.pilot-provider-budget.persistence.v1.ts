import { Prisma } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import {
  HV_CHARGING_COUNTER_PILOT_PROVIDER_LIFECYCLE,
  type HvChargingCounterPilotProviderLifecycleStateV1,
} from './hv-charging-counter-evidence.pilot-provider-budget.v1';

export type PilotProviderBudgetReserveOutcomeV1 =
  | { status: 'reserved'; lifecycleState: HvChargingCounterPilotProviderLifecycleStateV1 }
  | {
      status: 'exhausted';
      lifecycleState: HvChargingCounterPilotProviderLifecycleStateV1;
    };

type BudgetRow = {
  lifecycle_state: string;
};

export type PilotProviderBudgetFinalizeInputV1 = {
  organizationId: string;
  vehicleId: string;
  pilotEpoch: string;
  sourceHvChargeSessionId: string;
  lifecycleState:
    | typeof HV_CHARGING_COUNTER_PILOT_PROVIDER_LIFECYCLE.COMPLETED
    | typeof HV_CHARGING_COUNTER_PILOT_PROVIDER_LIFECYCLE.UNKNOWN_OUTCOME;
  outcomeDetail?: string | null;
  terminalAt: Date;
};

/**
 * Atomically reserves the single pilot provider attempt for (epoch, session).
 * Cross-replica safe via primary-key INSERT … ON CONFLICT DO NOTHING.
 */
export async function tryReservePilotProviderRequestBudgetV1(
  prisma: PrismaService,
  input: {
    organizationId: string;
    vehicleId: string;
    pilotEpoch: string;
    sourceHvChargeSessionId: string;
    reservedAt: Date;
  },
): Promise<PilotProviderBudgetReserveOutcomeV1> {
  return prisma.$transaction(async (tx) => {
    const inserted = await tx.$queryRaw<BudgetRow[]>(Prisma.sql`
      INSERT INTO battery_hv_charging_counter_pilot_provider_requests (
        organization_id,
        vehicle_id,
        pilot_epoch,
        source_hv_charge_session_id,
        lifecycle_state,
        reserved_at,
        request_started_at,
        updated_at
      ) VALUES (
        ${input.organizationId},
        ${input.vehicleId},
        ${input.pilotEpoch},
        ${input.sourceHvChargeSessionId},
        ${HV_CHARGING_COUNTER_PILOT_PROVIDER_LIFECYCLE.REQUEST_STARTED},
        ${input.reservedAt},
        ${input.reservedAt},
        ${input.reservedAt}
      )
      ON CONFLICT (organization_id, vehicle_id, pilot_epoch, source_hv_charge_session_id)
      DO NOTHING
      RETURNING lifecycle_state
    `);

    if (inserted.length > 0) {
      return {
        status: 'reserved',
        lifecycleState: HV_CHARGING_COUNTER_PILOT_PROVIDER_LIFECYCLE.REQUEST_STARTED,
      };
    }

    const existing = await tx.$queryRaw<BudgetRow[]>(Prisma.sql`
      SELECT lifecycle_state
      FROM battery_hv_charging_counter_pilot_provider_requests
      WHERE organization_id = ${input.organizationId}
        AND vehicle_id = ${input.vehicleId}
        AND pilot_epoch = ${input.pilotEpoch}
        AND source_hv_charge_session_id = ${input.sourceHvChargeSessionId}
      LIMIT 1
    `);

    const lifecycleState = (existing[0]?.lifecycle_state ??
      HV_CHARGING_COUNTER_PILOT_PROVIDER_LIFECYCLE.UNKNOWN_OUTCOME) as HvChargingCounterPilotProviderLifecycleStateV1;

    return { status: 'exhausted', lifecycleState };
  });
}

export async function finalizePilotProviderRequestBudgetV1(
  prisma: PrismaService,
  input: PilotProviderBudgetFinalizeInputV1,
): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE battery_hv_charging_counter_pilot_provider_requests
    SET
      lifecycle_state = ${input.lifecycleState},
      terminal_at = ${input.terminalAt},
      outcome_detail = ${input.outcomeDetail ?? null},
      updated_at = ${input.terminalAt}
    WHERE organization_id = ${input.organizationId}
      AND vehicle_id = ${input.vehicleId}
      AND pilot_epoch = ${input.pilotEpoch}
      AND source_hv_charge_session_id = ${input.sourceHvChargeSessionId}
      AND lifecycle_state = ${HV_CHARGING_COUNTER_PILOT_PROVIDER_LIFECYCLE.REQUEST_STARTED}
  `);
}
