/**
 * G1.2b arrival-order / concurrency / settlement design model — pure functions only.
 * Documents future G2 transaction boundary without runtime wiring.
 */
import {
  classifyPhysicalRefuelSibling,
  chooseCanonicalRefuel,
  type RefuelRowForMatcher,
} from './physical-refuel-identity.matcher';
import {
  determinePhysicalRefuelSettlement,
  type PhysicalRefuelFinalityState,
  type PhysicalRefuelSettlementConfig,
  DEFAULT_PHYSICAL_REFUEL_SETTLEMENT_CONFIG,
} from './physical-refuel-settlement.design';

export interface PhysicalRefuelReconciliationDecision {
  reconciliationLockKey: string;
  classification: ReturnType<typeof classifyPhysicalRefuelSibling>['classification'];
  canonicalEventId: string | null;
  siblingEventIds: string[];
  enrichmentEligibleId: string | null;
  finalityState: PhysicalRefuelFinalityState;
  reason: string;
}

export interface PhysicalRefuelReconciliationContext {
  asOfMs?: number;
  firstSeenAtById?: Record<string, number>;
  settlementConfig?: PhysicalRefuelSettlementConfig;
  /** IDs that already reached FINAL_DISTINCT enrichment before a late sibling arrived. */
  priorDistinctSettlementIds?: Set<string>;
}

/**
 * Stage 1 — coarse vehicle-scoped concurrency serialization.
 * Broader than semantic matching; does NOT encode identity into the lock key.
 */
export function buildPhysicalRefuelReconciliationLockKey(vehicleId: string): string {
  return `refuel_reconciliation:${vehicleId}`;
}

/** @deprecated G1.2b — bucketed scope keys risk boundary races; use buildPhysicalRefuelReconciliationLockKey. */
export function buildPhysicalRefuelScopeKey(row: RefuelRowForMatcher): string {
  return buildPhysicalRefuelReconciliationLockKey(row.vehicleId);
}

/**
 * Fail-closed clique-consistent grouping: a row joins a group only when it matches
 * SAME_PHYSICAL_REFUEL with every existing member (no transitive false merge).
 */
export function partitionPhysicalRefuelGroups(
  candidates: RefuelRowForMatcher[],
): RefuelRowForMatcher[][] {
  const sorted = [...candidates].sort((a, b) => a.id.localeCompare(b.id));
  const groups: RefuelRowForMatcher[][] = [];

  for (const row of sorted) {
    let placed = false;
    for (const group of groups) {
      const compatibleWithAll = group.every((member) => {
        const result = classifyPhysicalRefuelSibling(row, member);
        return result.classification === 'SAME_PHYSICAL_REFUEL';
      });
      if (compatibleWithAll) {
        group.push(row);
        placed = true;
        break;
      }
    }
    if (!placed) groups.push([row]);
  }

  return groups;
}

function chooseCanonicalFromGroup(group: RefuelRowForMatcher[]): RefuelRowForMatcher {
  return group.reduce((best, cur) => {
    const chosenId = chooseCanonicalRefuel(best, cur);
    return group.find((s) => s.id === chosenId) ?? best;
  });
}

function defaultFirstSeenMap(
  candidates: RefuelRowForMatcher[],
  context?: PhysicalRefuelReconciliationContext,
): Record<string, number> {
  const map = { ...(context?.firstSeenAtById ?? {}) };
  for (const row of candidates) {
    if (map[row.id] == null) {
      map[row.id] = new Date(row.endTime).getTime();
    }
  }
  return map;
}

/**
 * Pure reconciliation decision for a batch of candidate rows (G2 design).
 * Arrival-order and input-order independent via clique-consistent grouping.
 */
export function reconcilePhysicalRefuelBatch(
  candidates: RefuelRowForMatcher[],
  context?: PhysicalRefuelReconciliationContext,
): PhysicalRefuelReconciliationDecision[] {
  if (!candidates.length) return [];

  const vehicleId = candidates[0].vehicleId;
  const lockKey = buildPhysicalRefuelReconciliationLockKey(vehicleId);
  const asOfMs = context?.asOfMs ?? Math.max(...candidates.map((r) => new Date(r.endTime).getTime()));
  const firstSeenAtById = defaultFirstSeenMap(candidates, context);
  const priorDistinct = context?.priorDistinctSettlementIds ?? new Set<string>();

  const groups = partitionPhysicalRefuelGroups(candidates);
  const decisions: PhysicalRefuelReconciliationDecision[] = [];

  for (const group of groups) {
    const sortedIds = group.map((g) => g.id).sort();

    if (group.length === 1) {
      const row = group[0];
      const settlement = determinePhysicalRefuelSettlement({
        group,
        canonicalEventId: row.id,
        classification: 'DISTINCT_PHYSICAL_REFUEL',
        asOfMs,
        firstSeenAtById,
        config: context?.settlementConfig,
        priorDistinctSettlement: false,
      });
      decisions.push({
        reconciliationLockKey: lockKey,
        classification: 'DISTINCT_PHYSICAL_REFUEL',
        canonicalEventId: row.id,
        siblingEventIds: sortedIds,
        enrichmentEligibleId: settlement.enrichmentEligibleId,
        finalityState: settlement.finalityState,
        reason: settlement.reason,
      });
      continue;
    }

    const canonical = chooseCanonicalFromGroup(group);
    const priorDistinctSettlement = sortedIds.some((id) => priorDistinct.has(id));

    const pairwiseInsufficient = group.some((a) =>
      group.some((b) => {
        if (a.id === b.id) return false;
        const result = classifyPhysicalRefuelSibling(a, b);
        return result.classification === 'INSUFFICIENT_EVIDENCE';
      }),
    );

    if (pairwiseInsufficient) {
      for (const row of group) {
        decisions.push({
          reconciliationLockKey: lockKey,
          classification: 'INSUFFICIENT_EVIDENCE',
          canonicalEventId: null,
          siblingEventIds: [row.id],
          enrichmentEligibleId: null,
          finalityState: 'INSUFFICIENT_EVIDENCE',
          reason: 'non_transitive_group_insufficient_evidence',
        });
      }
      continue;
    }

    const settlement = determinePhysicalRefuelSettlement({
      group,
      canonicalEventId: canonical.id,
      classification: 'SAME_PHYSICAL_REFUEL',
      asOfMs,
      firstSeenAtById,
      config: context?.settlementConfig,
      priorDistinctSettlement,
    });

    decisions.push({
      reconciliationLockKey: lockKey,
      classification: 'SAME_PHYSICAL_REFUEL',
      canonicalEventId: canonical.id,
      siblingEventIds: sortedIds,
      enrichmentEligibleId: settlement.enrichmentEligibleId,
      finalityState: settlement.finalityState,
      reason: priorDistinctSettlement
        ? settlement.reason
        : 'semantic_sibling_clique_group',
    });
  }

  return decisions;
}

/**
 * Simulates incremental arrival; returns final reconciliation once all rows are visible.
 */
export function simulateArrivalOrder(
  allRows: RefuelRowForMatcher[],
  arrivalOrder: RefuelRowForMatcher[],
  context?: PhysicalRefuelReconciliationContext,
): PhysicalRefuelReconciliationDecision[] {
  const visible: RefuelRowForMatcher[] = [];
  const firstSeenAtById: Record<string, number> = { ...(context?.firstSeenAtById ?? {}) };
  const priorDistinctSettlementIds = new Set(context?.priorDistinctSettlementIds ?? []);
  let lastDecision: PhysicalRefuelReconciliationDecision[] = [];

  for (let i = 0; i < arrivalOrder.length; i++) {
    const row = arrivalOrder[i];
    visible.push(row);
    const asOfMs =
      context?.asOfMs ??
      new Date(row.endTime).getTime() + (i + 1) * 1000;
    firstSeenAtById[row.id] = firstSeenAtById[row.id] ?? asOfMs;

    const subset = allRows.filter((r) => visible.some((v) => v.id === r.id));
    lastDecision = reconcilePhysicalRefuelBatch(subset, {
      ...context,
      asOfMs,
      firstSeenAtById,
      priorDistinctSettlementIds,
    });

    for (const d of lastDecision) {
      if (d.finalityState === 'FINAL_DISTINCT' && d.enrichmentEligibleId) {
        priorDistinctSettlementIds.add(d.enrichmentEligibleId);
      }
    }
  }

  return lastDecision;
}

/**
 * G2 transaction boundary (design only) — G1.2b adds explicit finality gate.
 *
 * Stage 1: coarse vehicle/refuel reconciliation lock (serialization)
 * Stage 2: semantic physical-event identity + fail-closed clique grouping
 */
export const G2_PHYSICAL_REFUEL_TRANSACTION_BOUNDARY = {
  stages: {
    stage1: 'coarse_vehicle_refuel_reconciliation_lock',
    stage2: 'semantic_physical_event_identity',
  },
  phases: [
    'BEGIN',
    'advisory_xact_lock(vehicle_refuel_reconciliation)',
    'load_bounded_physical_refuel_candidates',
    'classify_physical_identity',
    'partition_fail_closed_clique_groups',
    'choose_canonical_refuel',
    'determine_settlement_finality_state',
    'persist_semantic_state_and_evidence',
    'COMMIT',
    'IF_FINAL_CANONICAL_OR_FINAL_DISTINCT: enqueue_station_enrichment(canonical_or_distinct_only)',
  ],
} as const;

export { DEFAULT_PHYSICAL_REFUEL_SETTLEMENT_CONFIG };
