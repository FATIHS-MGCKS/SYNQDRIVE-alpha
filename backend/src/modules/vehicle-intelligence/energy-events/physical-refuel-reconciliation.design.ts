/**
 * G1.2 arrival-order / concurrency design model — pure functions only.
 * Documents future G2 transaction boundary without runtime wiring.
 */
import {
  classifyPhysicalRefuelSibling,
  chooseCanonicalRefuel,
  type RefuelRowForMatcher,
} from './physical-refuel-identity.matcher';

export interface PhysicalRefuelReconciliationDecision {
  physicalRefuelScopeKey: string;
  classification: ReturnType<typeof classifyPhysicalRefuelSibling>['classification'];
  canonicalEventId: string | null;
  siblingEventIds: string[];
  enrichmentEligibleId: string | null;
  reason: string;
}

/** Coarse deterministic scope for advisory xact lock (Stage 1). */
export function buildPhysicalRefuelScopeKey(row: RefuelRowForMatcher): string {
  const endBucket = new Date(row.endTime).toISOString().slice(0, 16);
  const terminalFuel =
    row.fuelEndLiters != null ? Math.round(row.fuelEndLiters * 2) / 2 : 'unknown';
  const odo = row.odometerEndKm != null ? Math.round(row.odometerEndKm) : 'unknown';
  return `refuel:${row.vehicleId}:${endBucket}:${terminalFuel}:${odo}`;
}

/**
 * Pure reconciliation decision for a batch of candidate rows (G2 design).
 * Arrival-order independent: result depends only on the full candidate set.
 */
export function reconcilePhysicalRefuelBatch(
  candidates: RefuelRowForMatcher[],
): PhysicalRefuelReconciliationDecision[] {
  const decisions: PhysicalRefuelReconciliationDecision[] = [];
  const processed = new Set<string>();

  for (let i = 0; i < candidates.length; i++) {
    const row = candidates[i];
    if (processed.has(row.id)) continue;

    const siblings = [row];
    for (let j = i + 1; j < candidates.length; j++) {
      const other = candidates[j];
      if (processed.has(other.id)) continue;
      const result = classifyPhysicalRefuelSibling(row, other);
      if (result.classification === 'SAME_PHYSICAL_REFUEL') {
        siblings.push(other);
      }
    }

    if (siblings.length === 1) {
      decisions.push({
        physicalRefuelScopeKey: buildPhysicalRefuelScopeKey(row),
        classification: 'DISTINCT_PHYSICAL_REFUEL',
        canonicalEventId: row.id,
        siblingEventIds: [row.id],
        enrichmentEligibleId: row.id,
        reason: 'singleton',
      });
      processed.add(row.id);
      continue;
    }

    const canonical =
      siblings.length === 2
        ? siblings.find((s) => s.id === chooseCanonicalRefuel(siblings[0], siblings[1]))!
        : siblings.reduce((best, cur) => {
            const chosenId = chooseCanonicalRefuel(best, cur);
            return siblings.find((s) => s.id === chosenId) ?? best;
          });

    for (const s of siblings) processed.add(s.id);

    decisions.push({
      physicalRefuelScopeKey: buildPhysicalRefuelScopeKey(canonical),
      classification: 'SAME_PHYSICAL_REFUEL',
      canonicalEventId: canonical.id,
      siblingEventIds: siblings.map((s) => s.id).sort(),
      enrichmentEligibleId: canonical.id,
      reason: 'semantic_sibling_group',
    });
  }

  return decisions;
}

/**
 * Simulates incremental arrival without changing final semantic grouping.
 * Returns the reconciliation decision that would apply once all rows are visible.
 */
export function simulateArrivalOrder(
  allRows: RefuelRowForMatcher[],
  arrivalOrder: RefuelRowForMatcher[],
): PhysicalRefuelReconciliationDecision[] {
  const visible: RefuelRowForMatcher[] = [];
  const snapshots: PhysicalRefuelReconciliationDecision[][] = [];

  for (const row of arrivalOrder) {
    visible.push(row);
    const subset = allRows.filter((r) => visible.some((v) => v.id === r.id));
    snapshots.push(reconcilePhysicalRefuelBatch(subset));
  }

  return snapshots[snapshots.length - 1] ?? [];
}

/**
 * G2 transaction boundary (design only):
 * BEGIN → advisory lock(scopeKey) → load siblings → classify → choose canonical → persist
 * COMMIT → enqueue enrichment(canonical only)
 */
export const G2_PHYSICAL_REFUEL_TRANSACTION_BOUNDARY = {
  phases: [
    'BEGIN',
    'advisory_xact_lock(scopeKey)',
    'load_candidate_physical_siblings',
    'classify_physical_identity',
    'choose_canonical_refuel',
    'persist_or_attach_evidence',
    'COMMIT',
    'enqueue_station_enrichment(canonical_only)',
  ],
} as const;
