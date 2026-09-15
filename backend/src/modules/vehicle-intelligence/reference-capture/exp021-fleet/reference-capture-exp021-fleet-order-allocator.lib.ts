import {
  cadenceSequenceFromPlan,
  EXP021_CANDIDATE_SHORT_AB_60_90,
  EXP021_CANDIDATE_SHORT_AB_90_60,
  type Exp021CalibrationPlan,
} from '../reference-capture-exp021-calibration-plan.lib';
import type { Exp021FleetOrderBalanceSnapshot, Exp021FleetProposedOrder } from './reference-capture-exp021-fleet.types';

export const EXP021_SHORT_AB_PLAN_REGISTRY_KEYS = {
  ORDER_90_60: 'CANDIDATE_SHORT_AB_90_60',
  ORDER_60_90: 'CANDIDATE_SHORT_AB_60_90',
} as const;

const PLAN_BY_REGISTRY_KEY: Record<string, Exp021CalibrationPlan> = {
  [EXP021_SHORT_AB_PLAN_REGISTRY_KEYS.ORDER_90_60]: EXP021_CANDIDATE_SHORT_AB_90_60,
  [EXP021_SHORT_AB_PLAN_REGISTRY_KEYS.ORDER_60_90]: EXP021_CANDIDATE_SHORT_AB_60_90,
};

export function phaseOrderKey(phaseOrderMs: readonly number[]): string {
  return phaseOrderMs.join('_');
}

export function resolveShortAbPlanByRegistryKey(registryKey: string): Exp021CalibrationPlan | null {
  return PLAN_BY_REGISTRY_KEY[registryKey] ?? null;
}

export function buildProposedOrderFromPlan(
  registryKey: string,
  plan: Exp021CalibrationPlan,
  allocatorReason: string,
): Exp021FleetProposedOrder {
  const phaseOrderMs = cadenceSequenceFromPlan(plan);
  return {
    planRegistryKey: registryKey,
    planId: plan.planId,
    planVersion: plan.planVersion,
    phaseOrderMs,
    phaseOrderKey: phaseOrderKey(phaseOrderMs),
    allocatorReason,
  };
}

export function proposeBalancedPhaseOrder(args: {
  allowedPlans: readonly string[];
  vehicleId: string;
  balance: Exp021FleetOrderBalanceSnapshot;
}): Exp021FleetProposedOrder | null {
  const candidates = args.allowedPlans
    .map((key) => {
      const plan = resolveShortAbPlanByRegistryKey(key);
      if (!plan) return null;
      const phaseOrderMs = cadenceSequenceFromPlan(plan);
      const keyLabel = phaseOrderKey(phaseOrderMs);
      return {
        registryKey: key,
        plan,
        phaseOrderMs,
        phaseOrderKey: keyLabel,
        globalCount: args.balance.globalCounts[keyLabel] ?? 0,
        vehicleCount: args.balance.vehicleCounts[keyLabel] ?? 0,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null);

  if (candidates.length === 0) return null;

  const minGlobal = Math.min(...candidates.map((c) => c.globalCount));
  const globalBalanced = candidates.filter((c) => c.globalCount === minGlobal);
  const minVehicle = Math.min(...globalBalanced.map((c) => c.vehicleCount));
  const vehicleBalanced = globalBalanced.filter((c) => c.vehicleCount === minVehicle);

  const sorted = [...vehicleBalanced].sort((a, b) => {
    if (a.globalCount !== b.globalCount) return a.globalCount - b.globalCount;
    if (a.vehicleCount !== b.vehicleCount) return a.vehicleCount - b.vehicleCount;
    return a.phaseOrderKey.localeCompare(b.phaseOrderKey);
  });

  const chosen = sorted[0];
  return buildProposedOrderFromPlan(
    chosen.registryKey,
    chosen.plan,
    `global=${chosen.globalCount};vehicle=${chosen.vehicleCount};tie=${chosen.phaseOrderKey}`,
  );
}

export const EXP021_COMMITTED_RUN_STATES = [
  'PLANNED',
  'ARMING',
  'WAIT_TELEMETRY',
  'WAIT_MOVEMENT',
  'RUNNING',
  'FINALIZING',
  'COMPLETED',
  'PARTIAL',
] as const;
