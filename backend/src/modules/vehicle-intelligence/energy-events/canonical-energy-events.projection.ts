import {
  EnergyEventKind,
  type VehicleEnergyEvent,
  type VehicleEnergyEventRefuelReconciliation,
} from '@prisma/client';
import {
  classifyPhysicalRefuelSibling,
} from './physical-refuel-identity.matcher';
import {
  isEnrichmentEligibleFinality,
  isV2OwnedRefuelEvent,
} from './physical-refuel-reconciliation.repository';
import { vehicleEnergyEventToRefuelRow } from './physical-refuel-row.mapper';
import { applyRechargeProductReadDedupe } from './erd-recharge-product-read-dedupe/erd-recharge-product-read-dedupe';
import type { RechargeProductReadDedupeMetricResult } from './erd-recharge-product-read-dedupe/erd-recharge-product-read-dedupe';

export type EnergyEventWithReconciliation = VehicleEnergyEvent & {
  refuelReconciliation?: VehicleEnergyEventRefuelReconciliation | null;
};

function sortCanonicalProductRows<T extends EnergyEventWithReconciliation>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    const startDiff = a.startTime.getTime() - b.startTime.getTime();
    if (startDiff !== 0) return startDiff;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Product-canonical energy events — one visible REFUEL per physical episode.
 * Raw DIMO revisions remain in DB; unreconciled V2-owned natives are hidden until final.
 */
export function projectCanonicalProductEnergyEvents<T extends EnergyEventWithReconciliation>(
  rows: T[],
  v2OwnershipCutoverAt: Date | null,
  rechargeReadDedupeEnabled = false,
  onRechargeDedupeMetrics?: (results: RechargeProductReadDedupeMetricResult[]) => void,
): T[] {
  const nonRefuelNonRecharge = rows.filter(
    (row) => row.kind !== EnergyEventKind.REFUEL && row.kind !== EnergyEventKind.RECHARGE,
  );
  const recharges = rows.filter((row) => row.kind === EnergyEventKind.RECHARGE);
  const refuels = rows.filter((row) => row.kind === EnergyEventKind.REFUEL);

  const visibleRefuels: T[] = [];
  const v2ByGroup = new Map<string, T[]>();
  const legacyRefuels: T[] = [];

  for (const event of refuels) {
    const recon = event.refuelReconciliation;
    if (recon) {
      const group = v2ByGroup.get(recon.reconciliationGroupId) ?? [];
      group.push(event);
      v2ByGroup.set(recon.reconciliationGroupId, group);
      continue;
    }
    if (isV2OwnedRefuelEvent(event, v2OwnershipCutoverAt)) {
      continue;
    }
    legacyRefuels.push(event);
  }

  for (const members of v2ByGroup.values()) {
    const enrichmentFinalMembers = members.filter(
      (member) =>
        member.refuelReconciliation != null &&
        member.refuelReconciliation.enrichmentEligible &&
        isEnrichmentEligibleFinality(member.refuelReconciliation.finalityState),
    );

    if (enrichmentFinalMembers.length > 1) {
      continue;
    }

    if (enrichmentFinalMembers.length === 1) {
      const recon = enrichmentFinalMembers[0].refuelReconciliation!;
      if (
        recon.canonicalEventId != null &&
        recon.canonicalEventId !== enrichmentFinalMembers[0].id
      ) {
        continue;
      }
      visibleRefuels.push(enrichmentFinalMembers[0]);
    }
  }

  for (const legacy of legacyRefuels) {
    const legacyRow = vehicleEnergyEventToRefuelRow(legacy);
    const shadowedByV2 = visibleRefuels.some((v2Event) => {
      const v2Row = vehicleEnergyEventToRefuelRow(v2Event);
      return (
        classifyPhysicalRefuelSibling(legacyRow, v2Row).classification ===
        'SAME_PHYSICAL_REFUEL'
      );
    });
    if (!shadowedByV2) {
      visibleRefuels.push(legacy);
    }
  }

  const { visible: visibleRecharges, metricResults } = applyRechargeProductReadDedupe(
    recharges,
    rechargeReadDedupeEnabled,
  );
  onRechargeDedupeMetrics?.(metricResults);

  return sortCanonicalProductRows([
    ...nonRefuelNonRecharge,
    ...visibleRecharges,
    ...visibleRefuels,
  ]);
}
