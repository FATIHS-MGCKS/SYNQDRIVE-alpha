import type { ErdRechargeShadowObservationDraft } from './erd-recharge-shadow-parity.types';
import {
  ERD_RECHARGE_SHADOW_FINALITY,
  ERD_RECHARGE_SHADOW_PARITY_CLASS,
} from './erd-recharge-shadow-parity.types';

export interface ErdRechargeShadowParityReport {
  canonicalEpisodeCount: number;
  legacyEpisodeCount: number;
  pairedExactCount: number;
  pairedSemanticCount: number;
  ambiguousCount: number;
  canonicalOnlyObservedCount: number;
  legacyOnlyObservedCount: number;
  canonicalOnlySettledCount: number;
  legacyOnlySettledCount: number;
  legacyCoalescedMultipleCanonicalCount: number;
  multipleLegacyOneCanonicalCount: number;
  fieldMismatchCount: number;
  pendingSettlementCount: number;
  settledParityDenominator: number;
  settledParityNumerator: number;
  settledParityRate: number | null;
}

export function aggregateRechargeShadowParityReport(input: {
  observations: ErdRechargeShadowObservationDraft[];
  canonicalEpisodeCount: number;
  legacyEpisodeCount: number;
}): ErdRechargeShadowParityReport {
  const obs = input.observations;
  const pairedExactCount = obs.filter(
    (o) => o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.EXACT_MATCH,
  ).length;
  const pairedSemanticCount = obs.filter(
    (o) => o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.SEMANTIC_MATCH,
  ).length;
  const ambiguousCount = obs.filter(
    (o) => o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.AMBIGUOUS_MATCH,
  ).length;
  const canonicalOnlyObservedCount = obs.filter(
    (o) =>
      o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.CANONICAL_ONLY &&
      o.finality === ERD_RECHARGE_SHADOW_FINALITY.OBSERVED,
  ).length;
  const canonicalOnlySettledCount = obs.filter(
    (o) =>
      o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.CANONICAL_ONLY &&
      o.finality === ERD_RECHARGE_SHADOW_FINALITY.SETTLED,
  ).length;
  const legacyOnlyObservedCount = obs.filter(
    (o) =>
      o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.LEGACY_ONLY &&
      o.finality === ERD_RECHARGE_SHADOW_FINALITY.OBSERVED,
  ).length;
  const legacyOnlySettledCount = obs.filter(
    (o) =>
      o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.LEGACY_ONLY &&
      o.finality === ERD_RECHARGE_SHADOW_FINALITY.SETTLED,
  ).length;
  const legacyCoalescedMultipleCanonicalCount = obs.filter(
    (o) =>
      o.parityClass ===
      ERD_RECHARGE_SHADOW_PARITY_CLASS.LEGACY_COALESCED_MULTIPLE_CANONICAL,
  ).length;
  const multipleLegacyOneCanonicalCount = obs.filter(
    (o) =>
      o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.MULTIPLE_LEGACY_ONE_CANONICAL,
  ).length;
  const fieldMismatchCount = obs.filter(
    (o) => o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.FIELD_MISMATCH,
  ).length;
  const pendingSettlementCount = obs.filter(
    (o) => o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.PENDING_SETTLEMENT,
  ).length;

  const settledEligible = obs.filter(
    (o) => o.finality === ERD_RECHARGE_SHADOW_FINALITY.SETTLED,
  );
  const settledParityDenominator = settledEligible.filter(
    (o) => o.parityClass !== ERD_RECHARGE_SHADOW_PARITY_CLASS.AMBIGUOUS_MATCH,
  ).length;
  const settledParityNumerator = settledEligible.filter((o) =>
    (
      [
        ERD_RECHARGE_SHADOW_PARITY_CLASS.EXACT_MATCH,
        ERD_RECHARGE_SHADOW_PARITY_CLASS.SEMANTIC_MATCH,
      ] as string[]
    ).includes(o.parityClass),
  ).length;
  const settledParityRate =
    settledParityDenominator > 0
      ? settledParityNumerator / settledParityDenominator
      : null;

  return {
    canonicalEpisodeCount: input.canonicalEpisodeCount,
    legacyEpisodeCount: input.legacyEpisodeCount,
    pairedExactCount,
    pairedSemanticCount,
    ambiguousCount,
    canonicalOnlyObservedCount,
    legacyOnlyObservedCount,
    canonicalOnlySettledCount,
    legacyOnlySettledCount,
    legacyCoalescedMultipleCanonicalCount,
    multipleLegacyOneCanonicalCount,
    fieldMismatchCount,
    pendingSettlementCount,
    settledParityDenominator,
    settledParityNumerator,
    settledParityRate,
  };
}
