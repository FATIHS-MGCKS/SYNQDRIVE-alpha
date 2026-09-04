/**
 * G1.2c arrival-order / concurrency / settlement design model — pure functions only.
 * Documents future G2 transaction boundary without runtime wiring.
 */
import {
  chooseCanonicalRefuel,
  classifyPhysicalRefuelSibling,
  type RefuelRowForMatcher,
} from './physical-refuel-identity.matcher';
import {
  buildPairwiseIdentityMatrix,
  pairKey,
  type IdentityAmbiguityReasonCode,
  type PhysicalRefuelIdentityComponent,
  type PhysicalRefuelIdentityMatrix,
} from './physical-refuel-identity-component.design';
import {
  determinePhysicalRefuelSettlement,
  type PhysicalRefuelFinalityState,
  type PhysicalRefuelSettlementConfig,
  DEFAULT_PHYSICAL_REFUEL_SETTLEMENT_CONFIG,
} from './physical-refuel-settlement.design';

export interface PhysicalRefuelReconciliationDecision {
  reconciliationLockKey: string;
  classification: 'SAME_PHYSICAL_REFUEL' | 'DISTINCT_PHYSICAL_REFUEL' | 'INSUFFICIENT_EVIDENCE';
  canonicalEventId: string | null;
  provisionalCanonicalId: string | null;
  siblingEventIds: string[];
  enrichmentEligibleId: string | null;
  finalityState: PhysicalRefuelFinalityState;
  reason: string;
  reasonCodes: IdentityAmbiguityReasonCode[];
  settlementWindowOpen: boolean;
}

export interface PhysicalRefuelReconciliationContext {
  /** SYNQDRIVE system observation time — REQUIRED for production-capable reconciliation. */
  firstObservedAtById?: Record<string, number>;
  /** @deprecated G1.2b alias — use firstObservedAtById */
  firstSeenAtById?: Record<string, number>;
  asOfMs?: number;
  settlementConfig?: PhysicalRefuelSettlementConfig;
  /** IDs that reached FINAL_DISTINCT enrichment before a late sibling arrived. */
  priorDistinctFinalizationIds?: Set<string>;
  /** IDs that were in a FINAL_CANONICAL group that was already enriched. */
  priorCanonicalFinalizationIds?: Set<string>;
  /**
   * Bounded prior-final rows loaded for pairwise comparison when not present in the
   * current candidate matrix (G2.1a matrix/history scope fix).
   */
  priorFinalRowsById?: Record<string, RefuelRowForMatcher>;
  /** @deprecated use priorDistinctFinalizationIds */
  priorDistinctSettlementIds?: Set<string>;
}

/**
 * Stage 1 — coarse vehicle-scoped concurrency serialization.
 * Broader than semantic matching; does NOT encode identity into the lock key.
 */
export function buildPhysicalRefuelReconciliationLockKey(vehicleId: string): string {
  return `refuel_reconciliation:${vehicleId}`;
}

/** @deprecated G1.2b — use buildPhysicalRefuelReconciliationLockKey. */
export function buildPhysicalRefuelScopeKey(row: RefuelRowForMatcher): string {
  return buildPhysicalRefuelReconciliationLockKey(row.vehicleId);
}

/** @deprecated G1.2c — use buildPairwiseIdentityMatrix / partitionIdentityComponents. */
export { partitionPhysicalRefuelGroups } from './physical-refuel-identity-component.design';

function resolveFirstObservedAtById(
  context?: PhysicalRefuelReconciliationContext,
): Record<string, number> {
  return { ...(context?.firstObservedAtById ?? context?.firstSeenAtById ?? {}) };
}

function chooseCanonicalFromGroup(group: RefuelRowForMatcher[]): RefuelRowForMatcher {
  return group.reduce((best, cur) => {
    const chosenId = chooseCanonicalRefuel(best, cur);
    return group.find((s) => s.id === chosenId) ?? best;
  });
}

function invalidBatchDecision(
  reason: string,
  reasonCodes: IdentityAmbiguityReasonCode[],
): PhysicalRefuelReconciliationDecision[] {
  return [
    {
      reconciliationLockKey: 'refuel_reconciliation:INVALID_BATCH',
      classification: 'INSUFFICIENT_EVIDENCE',
      canonicalEventId: null,
      provisionalCanonicalId: null,
      siblingEventIds: [],
      enrichmentEligibleId: null,
      finalityState: 'INSUFFICIENT_EVIDENCE',
      reason,
      reasonCodes,
      settlementWindowOpen: true,
    },
  ];
}

function getPairCell(
  matrix: PhysicalRefuelIdentityMatrix,
  idA: string,
  idB: string,
) {
  if (idA === idB) return { classification: 'SAME_PHYSICAL_REFUEL' as const, reason: 'same_row' };
  return matrix.pairs[pairKey(idA, idB)];
}

function hasLateSiblingFinalizationConflict(
  component: PhysicalRefuelIdentityComponent,
  matrix: PhysicalRefuelIdentityMatrix,
  priorDistinct: Set<string>,
  priorCanonical: Set<string>,
  priorFinalRowsById?: Record<string, RefuelRowForMatcher>,
): boolean {
  const finalizedIds = new Set([...priorDistinct, ...priorCanonical]);
  if (!finalizedIds.size) return false;

  for (const member of component.members) {
    for (const finalizedId of finalizedIds) {
      if (member.id === finalizedId) continue;
      const cell = getPairCell(matrix, member.id, finalizedId);
      if (cell) {
        if (
          cell.classification === 'SAME_PHYSICAL_REFUEL' ||
          cell.classification === 'INSUFFICIENT_EVIDENCE'
        ) {
          return true;
        }
        continue;
      }

      const priorRow = priorFinalRowsById?.[finalizedId];
      if (!priorRow) {
        // Historical final outside bounded comparison bridge — unrelated, not a late sibling.
        continue;
      }

      const pairResult = classifyPhysicalRefuelSibling(member, priorRow);
      if (
        pairResult.classification === 'SAME_PHYSICAL_REFUEL' ||
        pairResult.classification === 'INSUFFICIENT_EVIDENCE'
      ) {
        return true;
      }
    }
  }
  return false;
}

function decisionFromComponent(
  component: PhysicalRefuelIdentityComponent,
  matrix: PhysicalRefuelIdentityMatrix,
  lockKey: string,
  asOfMs: number,
  firstObservedAtById: Record<string, number>,
  context?: PhysicalRefuelReconciliationContext,
): PhysicalRefuelReconciliationDecision {
  const priorDistinct = context?.priorDistinctFinalizationIds ??
    context?.priorDistinctSettlementIds ??
    new Set<string>();
  const priorCanonical = context?.priorCanonicalFinalizationIds ?? new Set<string>();

  if (component.status === 'AMBIGUOUS_NON_TRANSITIVE') {
    return {
      reconciliationLockKey: lockKey,
      classification: 'INSUFFICIENT_EVIDENCE',
      canonicalEventId: null,
      provisionalCanonicalId: null,
      siblingEventIds: component.memberIds,
      enrichmentEligibleId: null,
      finalityState: 'INSUFFICIENT_EVIDENCE',
      reason: 'non_transitive_identity_component',
      reasonCodes: component.reasonCodes,
      settlementWindowOpen: true,
    };
  }

  if (component.status === 'PAIRWISE_INSUFFICIENT') {
    return {
      reconciliationLockKey: lockKey,
      classification: 'INSUFFICIENT_EVIDENCE',
      canonicalEventId: null,
      provisionalCanonicalId: null,
      siblingEventIds: component.memberIds,
      enrichmentEligibleId: null,
      finalityState: 'INSUFFICIENT_EVIDENCE',
      reason: 'pairwise_identity_insufficient',
      reasonCodes: component.reasonCodes,
      settlementWindowOpen: true,
    };
  }

  const isSiblingGroup = component.members.length > 1;
  const canonical = isSiblingGroup ? chooseCanonicalFromGroup(component.members) : component.members[0];
  const lateSiblingConflict = hasLateSiblingFinalizationConflict(
    component,
    matrix,
    priorDistinct,
    priorCanonical,
    context?.priorFinalRowsById,
  );

  const settlement = determinePhysicalRefuelSettlement({
    group: component.members,
    canonicalEventId: canonical.id,
    classification: isSiblingGroup ? 'SAME_PHYSICAL_REFUEL' : 'DISTINCT_PHYSICAL_REFUEL',
    asOfMs,
    firstObservedAtById,
    config: context?.settlementConfig,
    // G1.2d: conflict is pairwise vs any prior-finalized id — not gated on same component membership.
    priorDistinctFinalization: lateSiblingConflict,
    priorCanonicalFinalization: lateSiblingConflict,
    ambiguityReasonCodes: lateSiblingConflict
      ? [...component.reasonCodes, 'late_sibling_after_finalization']
      : component.reasonCodes,
  });

  return {
    reconciliationLockKey: lockKey,
    classification: isSiblingGroup ? 'SAME_PHYSICAL_REFUEL' : 'DISTINCT_PHYSICAL_REFUEL',
    canonicalEventId:
      settlement.finalityState === 'FINAL_CANONICAL' ? canonical.id : settlement.provisionalCanonicalId,
    provisionalCanonicalId: settlement.provisionalCanonicalId,
    siblingEventIds: component.memberIds,
    enrichmentEligibleId: settlement.enrichmentEligibleId,
    finalityState: settlement.finalityState,
    reason: settlement.reason,
    reasonCodes: settlement.reasonCodes,
    settlementWindowOpen: settlement.settlementWindowOpen,
  };
}

/**
 * Pure reconciliation for a bounded same-vehicle candidate set (G2 design).
 * Evidence-safe component analysis; observation-time settlement authority.
 */
export function reconcilePhysicalRefuelBatch(
  candidates: RefuelRowForMatcher[],
  context?: PhysicalRefuelReconciliationContext,
): PhysicalRefuelReconciliationDecision[] {
  if (!candidates.length) return [];

  const analysis = buildPairwiseIdentityMatrix(candidates);

  if (analysis.batchStatus === 'MIXED_VEHICLE_BATCH') {
    return invalidBatchDecision('mixed_vehicle_batch', ['mixed_vehicle_batch']);
  }

  const firstObservedAtById = resolveFirstObservedAtById(context);
  const missingObservation = candidates.some((c) => firstObservedAtById[c.id] == null);
  if (missingObservation) {
    return invalidBatchDecision('missing_system_observation_time', [
      'missing_system_observation_time',
    ]);
  }

  const asOfMs = context?.asOfMs ?? Date.now();
  const lockKey = buildPhysicalRefuelReconciliationLockKey(analysis.vehicleId!);

  return analysis.components.map((component) =>
    decisionFromComponent(
      component,
      analysis.matrix!,
      lockKey,
      asOfMs,
      firstObservedAtById,
      context,
    ),
  );
}

/**
 * Simulates incremental arrival; returns final reconciliation once all rows are visible.
 * Uses explicit observation timestamps — never provider event endTime.
 */
export function simulateArrivalOrder(
  allRows: RefuelRowForMatcher[],
  arrivalOrder: RefuelRowForMatcher[],
  context?: PhysicalRefuelReconciliationContext,
): PhysicalRefuelReconciliationDecision[] {
  const firstObservedAtById = resolveFirstObservedAtById(context);
  const priorDistinctFinalizationIds = new Set(
    context?.priorDistinctFinalizationIds ?? context?.priorDistinctSettlementIds ?? [],
  );
  const priorCanonicalFinalizationIds = new Set(context?.priorCanonicalFinalizationIds ?? []);
  const baseAsOfMs = context?.asOfMs ?? Date.now();
  let lastDecision: PhysicalRefuelReconciliationDecision[] = [];

  for (let i = 0; i < arrivalOrder.length; i++) {
    const row = arrivalOrder[i];
    const observedAt = firstObservedAtById[row.id] ?? baseAsOfMs + i * 1000;
    firstObservedAtById[row.id] = observedAt;
    const asOfMs = context?.asOfMs ?? observedAt;

    const subset = allRows.filter((r) =>
      arrivalOrder.slice(0, i + 1).some((v) => v.id === r.id),
    );

    lastDecision = reconcilePhysicalRefuelBatch(subset, {
      ...context,
      asOfMs,
      firstObservedAtById,
      priorDistinctFinalizationIds,
      priorCanonicalFinalizationIds,
    });

    for (const d of lastDecision) {
      if (d.finalityState === 'FINAL_DISTINCT' && d.enrichmentEligibleId) {
        priorDistinctFinalizationIds.add(d.enrichmentEligibleId);
      }
      if (d.finalityState === 'FINAL_CANONICAL' && d.enrichmentEligibleId) {
        priorCanonicalFinalizationIds.add(d.enrichmentEligibleId);
      }
    }
  }

  return lastDecision;
}

/**
 * Test helper — synthesize explicit SYNQDRIVE observation times (fixture provenance only).
 */
export function buildTestObservationContext(
  rows: RefuelRowForMatcher[],
  options: {
    asOfMs: number;
    observedAtById?: Record<string, number>;
    baseOffsetMs?: number;
  },
): PhysicalRefuelReconciliationContext {
  const firstObservedAtById: Record<string, number> = { ...(options.observedAtById ?? {}) };
  const base = options.baseOffsetMs ?? 0;
  for (let i = 0; i < rows.length; i++) {
    if (firstObservedAtById[rows[i].id] == null) {
      firstObservedAtById[rows[i].id] = options.asOfMs - base - (rows.length - i) * 1000;
    }
  }
  return { asOfMs: options.asOfMs, firstObservedAtById };
}

export const G2_PHYSICAL_REFUEL_TRANSACTION_BOUNDARY = {
  stages: {
    stage1: 'coarse_vehicle_refuel_reconciliation_lock',
    stage2: 'semantic_physical_event_identity_matrix_and_components',
    stage3: 'settlement_finality_on_system_observation_time',
  },
  phases: [
    'BEGIN',
    'advisory_xact_lock(vehicle_refuel_reconciliation)',
    'load_bounded_physical_refuel_candidates_same_vehicle',
    'build_pairwise_identity_matrix',
    'analyze_evidence_safe_identity_components',
    'choose_canonical_refuel_per_valid_clique',
    'determine_settlement_finality_state',
    'persist_semantic_state_and_evidence',
    'COMMIT',
    'IF_FINAL_CANONICAL_OR_FINAL_DISTINCT: enqueue_station_enrichment(canonical_or_distinct_only)',
  ],
} as const;

export { DEFAULT_PHYSICAL_REFUEL_SETTLEMENT_CONFIG };
