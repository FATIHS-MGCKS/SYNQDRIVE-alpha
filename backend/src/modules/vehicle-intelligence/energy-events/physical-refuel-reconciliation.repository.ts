import {
  EnergyEventKind,
  PhysicalRefuelFinalityState,
  type Prisma,
  type VehicleEnergyEvent,
  type VehicleEnergyEventRefuelReconciliation,
} from '@prisma/client';
import type { PhysicalRefuelReconciliationDecision } from './physical-refuel-reconciliation.design';
import { buildReconciliationGroupId } from './physical-refuel-row.mapper';
import { computeNextReconciliationAt } from './physical-refuel-settlement-due.design';

export interface PersistRefuelReconciliationInput {
  vehicleId: string;
  event: VehicleEnergyEvent;
  decision: PhysicalRefuelReconciliationDecision;
  memberIds: string[];
  firstObservedAtById: Record<string, number>;
  settlementHorizonMs: number;
  asOfMs?: number;
  coordinateSelectionStatus?: string | null;
}

export function mapDecisionToPersistPayload(
  input: PersistRefuelReconciliationInput,
): Prisma.VehicleEnergyEventRefuelReconciliationUncheckedCreateInput {
  const { event, decision, memberIds, vehicleId, firstObservedAtById, settlementHorizonMs } =
    input;
  const enrichmentEligible =
    decision.enrichmentEligibleId != null && decision.enrichmentEligibleId === event.id;

  const nextReconciliationAt = computeNextReconciliationAt({
    finalityState: decision.finalityState,
    siblingEventIds: decision.siblingEventIds.length > 0 ? decision.siblingEventIds : [event.id],
    firstObservedAtById,
    settlementHorizonMs,
    asOfMs: input.asOfMs,
  });

  return {
    energyEventId: event.id,
    vehicleId,
    reconciliationGroupId: buildReconciliationGroupId(vehicleId, memberIds),
    classification: decision.classification,
    finalityState: decision.finalityState as PhysicalRefuelFinalityState,
    canonicalEventId: decision.canonicalEventId,
    enrichmentEligible,
    settlementWindowOpen: decision.settlementWindowOpen,
    lateSiblingConflict: decision.reasonCodes.includes('late_sibling_after_finalization'),
    reason: decision.reason,
    reasonCodes: decision.reasonCodes,
    nextReconciliationAt,
    coordinateSelectionStatus: input.coordinateSelectionStatus ?? undefined,
  };
}

export function extractPriorFinalizationIds(
  rows: VehicleEnergyEventRefuelReconciliation[],
): { priorDistinctFinalizationIds: Set<string>; priorCanonicalFinalizationIds: Set<string> } {
  const priorDistinctFinalizationIds = new Set<string>();
  const priorCanonicalFinalizationIds = new Set<string>();

  for (const row of rows) {
    if (!row.enrichmentEligible) continue;
    if (row.finalityState === PhysicalRefuelFinalityState.FINAL_DISTINCT) {
      priorDistinctFinalizationIds.add(row.energyEventId);
    }
    if (row.finalityState === PhysicalRefuelFinalityState.FINAL_CANONICAL) {
      priorCanonicalFinalizationIds.add(row.energyEventId);
    }
  }

  return { priorDistinctFinalizationIds, priorCanonicalFinalizationIds };
}

export const ENRICHMENT_ELIGIBLE_FINALITY: ReadonlySet<PhysicalRefuelFinalityState> = new Set([
  PhysicalRefuelFinalityState.FINAL_CANONICAL,
  PhysicalRefuelFinalityState.FINAL_DISTINCT,
]);

export function isEnrichmentEligibleFinality(state: PhysicalRefuelFinalityState): boolean {
  return ENRICHMENT_ELIGIBLE_FINALITY.has(state);
}

export const NON_FINAL_ENRICHMENT_FORBIDDEN: ReadonlySet<PhysicalRefuelFinalityState> = new Set([
  PhysicalRefuelFinalityState.PROVISIONAL,
  PhysicalRefuelFinalityState.SETTLING,
  PhysicalRefuelFinalityState.INSUFFICIENT_EVIDENCE,
]);

export function isV2OwnedRefuelEvent(
  event: Pick<VehicleEnergyEvent, 'createdAt' | 'kind'>,
  v2OwnershipCutoverAt: Date | null,
): boolean {
  if (event.kind !== EnergyEventKind.REFUEL) return false;
  if (!v2OwnershipCutoverAt) return false;
  return event.createdAt.getTime() >= v2OwnershipCutoverAt.getTime();
}
