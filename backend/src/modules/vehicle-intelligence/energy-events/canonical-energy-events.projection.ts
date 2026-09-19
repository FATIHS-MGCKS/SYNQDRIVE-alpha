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

export type EnergyEventWithReconciliation = VehicleEnergyEvent & {
  refuelReconciliation?: VehicleEnergyEventRefuelReconciliation | null;
};

/**
 * Product-canonical energy events — one visible REFUEL per physical episode.
 * Raw DIMO revisions remain in DB; unreconciled V2-owned natives are hidden until final.
 */
export function projectCanonicalProductEnergyEvents<T extends EnergyEventWithReconciliation>(
  rows: T[],
  v2OwnershipCutoverAt: Date | null,
): T[] {
  const nonRefuel = rows.filter((row) => row.kind !== EnergyEventKind.REFUEL);
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
    if (enrichmentFinalMembers.length === 1) {
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

  return [...nonRefuel, ...visibleRefuels].sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime(),
  );
}
