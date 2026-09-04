/**
 * G1.2b physical-refuel settlement / finality model — pure design only.
 * Distinguishes semantic reconciliation from safe enrichment eligibility.
 */
import type { RefuelRowForMatcher } from './physical-refuel-identity.matcher';

export type PhysicalRefuelFinalityState =
  | 'PROVISIONAL'
  | 'SETTLING'
  | 'FINAL_CANONICAL'
  | 'FINAL_DISTINCT'
  | 'INSUFFICIENT_EVIDENCE';

export interface PhysicalRefuelSettlementConfig {
  /**
   * Max wait after the earliest first-seen row in a singleton group before treating
   * it as a confirmed distinct physical refuel safe to enrich.
   *
   * INFERRED default: 60 minutes — exceeds observed KS MX Sept04 provider stagger (~45m)
   * between sibling persistence timestamps. OPEN: production calibration pending G2.
   */
  settlementHorizonMs: number;
}

export const DEFAULT_PHYSICAL_REFUEL_SETTLEMENT_CONFIG: PhysicalRefuelSettlementConfig = {
  settlementHorizonMs: 60 * 60 * 1000,
};

export interface PhysicalRefuelSettlementInput {
  group: RefuelRowForMatcher[];
  canonicalEventId: string | null;
  classification: 'SAME_PHYSICAL_REFUEL' | 'DISTINCT_PHYSICAL_REFUEL' | 'INSUFFICIENT_EVIDENCE';
  asOfMs: number;
  firstSeenAtById: Record<string, number>;
  config?: PhysicalRefuelSettlementConfig;
  /** When true, a prior singleton already reached FINAL_DISTINCT before a late sibling arrived. */
  priorDistinctSettlement?: boolean;
}

export interface PhysicalRefuelSettlementResult {
  finalityState: PhysicalRefuelFinalityState;
  enrichmentEligibleId: string | null;
  reason: string;
}

function earliestFirstSeenMs(
  group: RefuelRowForMatcher[],
  firstSeenAtById: Record<string, number>,
): number {
  return Math.min(...group.map((r) => firstSeenAtById[r.id] ?? 0));
}

/**
 * Determines whether enrichment may proceed for a reconciled physical-refuel group.
 * ONE_PHYSICAL_REFUEL → AT MOST ONE enrichment-eligible canonical event.
 */
export function determinePhysicalRefuelSettlement(
  input: PhysicalRefuelSettlementInput,
): PhysicalRefuelSettlementResult {
  const config = input.config ?? DEFAULT_PHYSICAL_REFUEL_SETTLEMENT_CONFIG;

  if (input.classification === 'INSUFFICIENT_EVIDENCE') {
    return {
      finalityState: 'INSUFFICIENT_EVIDENCE',
      enrichmentEligibleId: null,
      reason: 'insufficient_identity_evidence',
    };
  }

  if (input.priorDistinctSettlement && input.group.length > 1) {
    return {
      finalityState: 'INSUFFICIENT_EVIDENCE',
      enrichmentEligibleId: null,
      reason: 'late_sibling_after_distinct_settlement_horizon',
    };
  }

  if (input.group.length > 1) {
    if (!input.canonicalEventId) {
      return {
        finalityState: 'INSUFFICIENT_EVIDENCE',
        enrichmentEligibleId: null,
        reason: 'sibling_group_missing_canonical',
      };
    }
    return {
      finalityState: 'FINAL_CANONICAL',
      enrichmentEligibleId: input.canonicalEventId,
      reason: 'sibling_group_resolved',
    };
  }

  const row = input.group[0];
  const firstSeen = earliestFirstSeenMs(input.group, input.firstSeenAtById);
  const ageMs = input.asOfMs - firstSeen;

  if (ageMs < config.settlementHorizonMs) {
    return {
      finalityState: 'PROVISIONAL',
      enrichmentEligibleId: null,
      reason: 'singleton_within_settlement_horizon',
    };
  }

  return {
    finalityState: 'FINAL_DISTINCT',
    enrichmentEligibleId: row.id,
    reason: 'singleton_settlement_horizon_elapsed',
  };
}

/**
 * Simulates incremental settlement as rows arrive in order.
 * Tracks when singletons cross the settlement horizon and late-sibling conflicts.
 */
export function simulateIncrementalSettlement(
  arrivalOrder: RefuelRowForMatcher[],
  config: PhysicalRefuelSettlementConfig = DEFAULT_PHYSICAL_REFUEL_SETTLEMENT_CONFIG,
): PhysicalRefuelSettlementResult[] {
  const firstSeenAtById: Record<string, number> = {};
  const settledDistinctIds = new Set<string>();
  const snapshots: PhysicalRefuelSettlementResult[] = [];

  for (let i = 0; i < arrivalOrder.length; i++) {
    const row = arrivalOrder[i];
    const asOfMs = row.endTime
      ? new Date(row.endTime).getTime() + (i + 1) * 1000
      : Date.now();
    firstSeenAtById[row.id] = firstSeenAtById[row.id] ?? asOfMs;

    const visible = arrivalOrder.slice(0, i + 1);
    const priorDistinct = visible.some(
      (r) => r.id !== row.id && settledDistinctIds.has(r.id),
    );

    // Import reconcile inline avoided — caller supplies group semantics in tests.
    snapshots.push(
      determinePhysicalRefuelSettlement({
        group: visible.length === 1 ? [row] : visible,
        canonicalEventId: visible.length === 1 ? row.id : null,
        classification:
          visible.length === 1 ? 'DISTINCT_PHYSICAL_REFUEL' : 'SAME_PHYSICAL_REFUEL',
        asOfMs,
        firstSeenAtById,
        config,
        priorDistinctSettlement: priorDistinct,
      }),
    );

    const last = snapshots[snapshots.length - 1];
    if (last.finalityState === 'FINAL_DISTINCT' && last.enrichmentEligibleId) {
      settledDistinctIds.add(last.enrichmentEligibleId);
    }
  }

  return snapshots;
}
