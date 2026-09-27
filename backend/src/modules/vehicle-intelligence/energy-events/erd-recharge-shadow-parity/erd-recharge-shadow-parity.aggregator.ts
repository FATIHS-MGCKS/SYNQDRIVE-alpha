import type { ErdRechargeShadowObservationDraft } from './erd-recharge-shadow-parity.types';
import {
  ERD_RECHARGE_SHADOW_FINALITY,
  ERD_RECHARGE_SHADOW_PARITY_CLASS,
} from './erd-recharge-shadow-parity.types';

export interface ErdRechargeShadowParityReport {
  /** Compatibility alias — canonical physical episode count in scope. */
  canonicalEpisodeCount: number;
  /** Compatibility field — raw legacy cohort row count (not physical cluster count). */
  legacyEpisodeCount: number;
  legacyRowCount: number;
  /** Exact legacy physical cluster count when bounds collapse; null when ambiguous. */
  legacyPhysicalClusterCount: number | null;
  resolvedLegacyPhysicalClusterCount: number;
  ambiguousPhysicalClusterGroupCount: number;
  ambiguousLegacyRowCount: number;
  legacyPhysicalClusterLowerBound: number;
  legacyPhysicalClusterUpperBound: number;
  canonicalPhysicalEpisodeCount: number;
  pairedPhysicalEpisodeCount: number;
  legacyFragmentRowCount: number;
  trueLegacyOnlyPhysicalClusterCount: number;
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

function isPrimaryPairObservation(o: ErdRechargeShadowObservationDraft): boolean {
  if (o.canonicalChargeSessionId == null || o.legacyVehicleEnergyEventId == null) {
    return false;
  }
  return (
    o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.EXACT_MATCH ||
    o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.SEMANTIC_MATCH ||
    o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.FIELD_MISMATCH
  );
}

function isFragmentTopologyDiagnostic(
  o: ErdRechargeShadowObservationDraft,
  primaryPairedCanonicalIds: Set<string>,
): boolean {
  return (
    o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.MULTIPLE_LEGACY_ONE_CANONICAL &&
    o.canonicalChargeSessionId != null &&
    primaryPairedCanonicalIds.has(o.canonicalChargeSessionId)
  );
}

function deriveAmbiguityComponentStats(obs: ErdRechargeShadowObservationDraft[]): {
  ambiguousPhysicalClusterGroupCount: number;
  ambiguousLegacyRowCount: number;
} {
  const componentKeys = new Set<string>();
  const ambiguousLegacyIds = new Set<string>();
  for (const observation of obs) {
    if (observation.parityClass !== ERD_RECHARGE_SHADOW_PARITY_CLASS.AMBIGUOUS_MATCH) {
      continue;
    }
    const canonicalIds = observation.fieldDiff?.relatedCanonicalSessionIds ?? [];
    const legacyIds = observation.fieldDiff?.relatedLegacyVehicleEnergyEventIds ?? [];
    if (canonicalIds.length === 0 && legacyIds.length === 0) {
      continue;
    }
    const key = `${[...canonicalIds].sort().join(',')}|${[...legacyIds].sort().join(',')}`;
    componentKeys.add(key);
    for (const legacyId of legacyIds) {
      ambiguousLegacyIds.add(legacyId);
    }
  }
  return {
    ambiguousPhysicalClusterGroupCount: componentKeys.size,
    ambiguousLegacyRowCount: ambiguousLegacyIds.size,
  };
}

export function aggregateRechargeShadowParityReport(input: {
  observations: ErdRechargeShadowObservationDraft[];
  canonicalEpisodeCount: number;
  legacyEpisodeCount: number;
}): ErdRechargeShadowParityReport {
  const obs = input.observations;
  const primaryPairedCanonicalIds = new Set(
    obs.filter(isPrimaryPairObservation).map((o) => o.canonicalChargeSessionId!),
  );
  const pairedPhysicalEpisodeCount = primaryPairedCanonicalIds.size;

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

  const fragmentLegacyIds = new Set<string>();
  for (const o of obs) {
    if (!isFragmentTopologyDiagnostic(o, primaryPairedCanonicalIds)) continue;
    for (const id of o.fieldDiff?.relatedLegacyVehicleEnergyEventIds ?? []) {
      fragmentLegacyIds.add(id);
    }
  }

  const unresolvedMultipleLegacyOneCanonicalCount = obs.filter(
    (o) =>
      o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.MULTIPLE_LEGACY_ONE_CANONICAL &&
      o.canonicalChargeSessionId != null &&
      !primaryPairedCanonicalIds.has(o.canonicalChargeSessionId),
  ).length;

  const legacyRowCount = input.legacyEpisodeCount;
  const canonicalPhysicalEpisodeCount = input.canonicalEpisodeCount;
  const legacyFragmentRowCount = fragmentLegacyIds.size;
  const trueLegacyOnlyPhysicalClusterCount = legacyOnlySettledCount + legacyOnlyObservedCount;
  const resolvedLegacyPhysicalClusterCount =
    pairedPhysicalEpisodeCount +
    trueLegacyOnlyPhysicalClusterCount +
    legacyCoalescedMultipleCanonicalCount +
    unresolvedMultipleLegacyOneCanonicalCount;

  const { ambiguousPhysicalClusterGroupCount, ambiguousLegacyRowCount } =
    deriveAmbiguityComponentStats(obs);

  const legacyPhysicalClusterLowerBound =
    resolvedLegacyPhysicalClusterCount + ambiguousPhysicalClusterGroupCount;
  const legacyPhysicalClusterUpperBound =
    resolvedLegacyPhysicalClusterCount + ambiguousLegacyRowCount;
  const legacyPhysicalClusterCount =
    legacyPhysicalClusterLowerBound === legacyPhysicalClusterUpperBound
      ? legacyPhysicalClusterLowerBound
      : null;

  const settledEligible = obs.filter(
    (o) => o.finality === ERD_RECHARGE_SHADOW_FINALITY.SETTLED,
  );
  const settledParityDenominator = settledEligible.filter((o) => {
    if (o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.AMBIGUOUS_MATCH) {
      return false;
    }
    if (isFragmentTopologyDiagnostic(o, primaryPairedCanonicalIds)) {
      return false;
    }
    return true;
  }).length;
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
    legacyRowCount,
    legacyPhysicalClusterCount,
    resolvedLegacyPhysicalClusterCount,
    ambiguousPhysicalClusterGroupCount,
    ambiguousLegacyRowCount,
    legacyPhysicalClusterLowerBound,
    legacyPhysicalClusterUpperBound,
    canonicalPhysicalEpisodeCount,
    pairedPhysicalEpisodeCount,
    legacyFragmentRowCount,
    trueLegacyOnlyPhysicalClusterCount,
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
