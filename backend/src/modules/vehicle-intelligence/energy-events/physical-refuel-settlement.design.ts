/**
 * G1.2c physical-refuel settlement / finality model — pure design only.
 *
 * SETTLEMENT CLOCK AUTHORITY = SYNQDRIVE SYSTEM OBSERVATION TIME (firstObservedAt).
 * NOT provider event time (startTime/endTime/DIMO segment timestamps).
 */
import type { RefuelRowForMatcher } from './physical-refuel-identity.matcher';
import type { IdentityAmbiguityReasonCode } from './physical-refuel-identity-component.design';

export type PhysicalRefuelFinalityState =
  | 'PROVISIONAL'
  | 'SETTLING'
  | 'FINAL_CANONICAL'
  | 'FINAL_DISTINCT'
  | 'INSUFFICIENT_EVIDENCE';

export interface PhysicalRefuelSettlementConfig {
  /**
   * Max wait after the latest firstObservedAt in a group before finalization.
   * Each newly observed sibling extends the open window.
   *
   * INFERRED default: 60 minutes — exceeds observed KS MX Sept04 provider stagger (~45m).
   * OPEN: production calibration pending G2.
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
  /** SYNQDRIVE system observation/ingress time per candidate — REQUIRED, no eventTime fallback. */
  firstObservedAtById: Record<string, number>;
  config?: PhysicalRefuelSettlementConfig;
  /**
   * When true, a late sibling conflict exists vs any prior FINAL_DISTINCT enrichment.
   * G1.2d: may apply to singleton or external late components — not only same-component rows.
   */
  priorDistinctFinalization?: boolean;
  /**
   * When true, a late sibling conflict exists vs any prior FINAL_CANONICAL enrichment.
   * G1.2d: may apply to singleton or external late components — not only same-component rows.
   */
  priorCanonicalFinalization?: boolean;
  ambiguityReasonCodes?: IdentityAmbiguityReasonCode[];
}

export interface PhysicalRefuelSettlementResult {
  finalityState: PhysicalRefuelFinalityState;
  enrichmentEligibleId: string | null;
  provisionalCanonicalId: string | null;
  reason: string;
  reasonCodes: IdentityAmbiguityReasonCode[];
  settlementWindowOpen: boolean;
}

function resolveObservationTimes(
  group: RefuelRowForMatcher[],
  firstObservedAtById: Record<string, number>,
): { latestObservedMs: number | null; missingIds: string[] } {
  const missingIds: string[] = [];
  const times: number[] = [];
  for (const row of group) {
    const t = firstObservedAtById[row.id];
    if (t == null || !Number.isFinite(t)) {
      missingIds.push(row.id);
    } else {
      times.push(t);
    }
  }
  return {
    latestObservedMs: times.length ? Math.max(...times) : null,
    missingIds,
  };
}

export function isSettlementWindowOpen(
  group: RefuelRowForMatcher[],
  asOfMs: number,
  firstObservedAtById: Record<string, number>,
  config: PhysicalRefuelSettlementConfig = DEFAULT_PHYSICAL_REFUEL_SETTLEMENT_CONFIG,
): { open: boolean; missingObservation: boolean } {
  const { latestObservedMs, missingIds } = resolveObservationTimes(group, firstObservedAtById);
  if (missingIds.length) return { open: true, missingObservation: true };
  const closesAt = latestObservedMs! + config.settlementHorizonMs;
  return { open: asOfMs < closesAt, missingObservation: false };
}

/**
 * Determines whether enrichment may proceed for a reconciled physical-refuel group.
 * WHILE_SETTLEMENT_WINDOW_OPEN → ZERO FINAL ENRICHMENT ELIGIBILITY.
 * ONE_PHYSICAL_REFUEL → AT MOST ONE enrichment-eligible canonical event.
 */
export function determinePhysicalRefuelSettlement(
  input: PhysicalRefuelSettlementInput,
): PhysicalRefuelSettlementResult {
  const config = input.config ?? DEFAULT_PHYSICAL_REFUEL_SETTLEMENT_CONFIG;
  const reasonCodes = [...(input.ambiguityReasonCodes ?? [])];

  if (input.classification === 'INSUFFICIENT_EVIDENCE') {
    return {
      finalityState: 'INSUFFICIENT_EVIDENCE',
      enrichmentEligibleId: null,
      provisionalCanonicalId: null,
      reason: 'insufficient_identity_evidence',
      reasonCodes,
      settlementWindowOpen: true,
    };
  }

  const { latestObservedMs, missingIds } = resolveObservationTimes(
    input.group,
    input.firstObservedAtById,
  );

  if (missingIds.length) {
    return {
      finalityState: 'INSUFFICIENT_EVIDENCE',
      enrichmentEligibleId: null,
      provisionalCanonicalId: input.canonicalEventId,
      reason: 'missing_system_observation_time',
      reasonCodes: [...reasonCodes, 'missing_system_observation_time'],
      settlementWindowOpen: true,
    };
  }

  if (input.priorDistinctFinalization || input.priorCanonicalFinalization) {
    return {
      finalityState: 'INSUFFICIENT_EVIDENCE',
      enrichmentEligibleId: null,
      provisionalCanonicalId: input.canonicalEventId,
      reason: 'late_sibling_after_finalization',
      reasonCodes: [...reasonCodes, 'late_sibling_after_finalization'],
      settlementWindowOpen: false,
    };
  }

  const windowClosesAt = latestObservedMs! + config.settlementHorizonMs;
  const settlementWindowOpen = input.asOfMs < windowClosesAt;

  if (input.group.length > 1) {
    if (!input.canonicalEventId) {
      return {
        finalityState: 'INSUFFICIENT_EVIDENCE',
        enrichmentEligibleId: null,
        provisionalCanonicalId: null,
        reason: 'sibling_group_missing_canonical',
        reasonCodes,
        settlementWindowOpen,
      };
    }

    if (settlementWindowOpen) {
      return {
        finalityState: 'SETTLING',
        enrichmentEligibleId: null,
        provisionalCanonicalId: input.canonicalEventId,
        reason: 'settlement_window_open',
        reasonCodes: [...reasonCodes, 'settlement_window_open'],
        settlementWindowOpen: true,
      };
    }

    return {
      finalityState: 'FINAL_CANONICAL',
      enrichmentEligibleId: input.canonicalEventId,
      provisionalCanonicalId: input.canonicalEventId,
      reason: 'sibling_group_settlement_closed',
      reasonCodes,
      settlementWindowOpen: false,
    };
  }

  const row = input.group[0];

  if (settlementWindowOpen) {
    return {
      finalityState: 'PROVISIONAL',
      enrichmentEligibleId: null,
      provisionalCanonicalId: row.id,
      reason: 'singleton_within_settlement_horizon',
      reasonCodes: [...reasonCodes, 'settlement_window_open'],
      settlementWindowOpen: true,
    };
  }

  return {
    finalityState: 'FINAL_DISTINCT',
    enrichmentEligibleId: row.id,
    provisionalCanonicalId: row.id,
    reason: 'singleton_settlement_horizon_elapsed',
    reasonCodes,
    settlementWindowOpen: false,
  };
}

/** @deprecated G1.2b — use firstObservedAtById */
export type FirstSeenAtById = Record<string, number>;
