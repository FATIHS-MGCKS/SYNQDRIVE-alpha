import {
  FuelStationEnrichmentProcessingStatus,
  type FuelStationEnrichmentResolutionStatus,
  PhysicalRefuelFinalityState,
  type VehicleEnergyEventRefuelReconciliation,
} from '@prisma/client';
import type {
  PhysicalRefuelIdentityComponent,
} from './physical-refuel-identity-component.design';
import {
  DEFAULT_PHYSICAL_REFUEL_SETTLEMENT_CONFIG,
  isSettlementWindowOpen,
} from './physical-refuel-settlement.design';

/** Durable signals that enrichment pipeline materially consumed the final owner. */
export function isIrreversibleEnrichmentConsumption(input: {
  enrichmentEnqueuedAt: Date | null;
  fuelStationEnrichment?: {
    processingStatus: FuelStationEnrichmentProcessingStatus;
    resolutionStatus: FuelStationEnrichmentResolutionStatus | null;
  } | null;
}): boolean {
  if (input.enrichmentEnqueuedAt != null) {
    return true;
  }
  const enrichment = input.fuelStationEnrichment;
  if (!enrichment) {
    return false;
  }
  if (enrichment.processingStatus === FuelStationEnrichmentProcessingStatus.COMPLETED) {
    return true;
  }
  if (enrichment.processingStatus === FuelStationEnrichmentProcessingStatus.PROCESSING) {
    return true;
  }
  return false;
}

export function reconciliationImpliesLateSiblingAfterFinalization(
  row: Pick<
    VehicleEnergyEventRefuelReconciliation,
    'lateSiblingConflict' | 'reason' | 'reasonCodes'
  >,
): boolean {
  if (row.lateSiblingConflict) return true;
  if (row.reason === 'late_sibling_after_finalization') return true;
  const codes = row.reasonCodes;
  if (Array.isArray(codes) && codes.includes('late_sibling_after_finalization')) {
    return true;
  }
  return false;
}

const PERMANENT_AMBIGUITY_REASONS = new Set([
  'non_transitive_identity_component',
  'pairwise_identity_insufficient',
  'missing_system_observation_time',
]);

export function isPermanentIdentityAmbiguityReason(
  reason: string,
  reasonCodes: unknown,
): boolean {
  if (PERMANENT_AMBIGUITY_REASONS.has(reason)) return true;
  if (!Array.isArray(reasonCodes)) return false;
  return reasonCodes.some(
    (code) => typeof code === 'string' && PERMANENT_AMBIGUITY_REASONS.has(code),
  );
}

/**
 * Safe late-sibling reopen (Case B): stuck INSUFFICIENT late-sibling group may be
 * re-evaluated when canonical owner was not irreversibly consumed.
 */
export function isSafeLateSiblingAuthorityRecheckRow(
  row: Pick<
    VehicleEnergyEventRefuelReconciliation,
    | 'finalityState'
    | 'lateSiblingConflict'
    | 'reason'
    | 'reasonCodes'
    | 'canonicalEventId'
    | 'enrichmentEnqueuedAt'
  > & {
    fuelStationEnrichment?: {
      processingStatus: FuelStationEnrichmentProcessingStatus;
      resolutionStatus: FuelStationEnrichmentResolutionStatus | null;
    } | null;
  },
  canonicalOwnerRow?: Pick<
    VehicleEnergyEventRefuelReconciliation,
    'enrichmentEnqueuedAt'
  > & {
    fuelStationEnrichment?: {
      processingStatus: FuelStationEnrichmentProcessingStatus;
      resolutionStatus: FuelStationEnrichmentResolutionStatus | null;
    } | null;
  } | null,
): boolean {
  if (row.finalityState !== PhysicalRefuelFinalityState.INSUFFICIENT_EVIDENCE) {
    return false;
  }
  if (row.reason === 'authority_recheck_hold') {
    return false;
  }
  if (!reconciliationImpliesLateSiblingAfterFinalization(row)) {
    return false;
  }
  if (isPermanentIdentityAmbiguityReason(row.reason, row.reasonCodes)) {
    return false;
  }
  const owner = canonicalOwnerRow ?? row;
  if (isIrreversibleEnrichmentConsumption(owner)) {
    return false;
  }
  return true;
}

/**
 * F10.6.8-A.1 — authority_recheck may evaluate irreversible late-sibling rows once;
 * runtime decides pin vs hold vs settlement retry.
 */
export function isAuthorityRecheckEligibleRow(
  row: Parameters<typeof isSafeLateSiblingAuthorityRecheckRow>[0],
  canonicalOwnerRow?: Parameters<typeof isSafeLateSiblingAuthorityRecheckRow>[1],
): boolean {
  if (row.finalityState !== PhysicalRefuelFinalityState.INSUFFICIENT_EVIDENCE) {
    return false;
  }
  if (row.reason === AUTHORITY_RECHECK_HOLD_REASON) {
    return false;
  }
  if (!reconciliationImpliesLateSiblingAfterFinalization(row)) {
    return false;
  }
  if (isPermanentIdentityAmbiguityReason(row.reason, row.reasonCodes)) {
    return false;
  }
  void canonicalOwnerRow;
  return true;
}

export function resolvePersistedLateSiblingCanonicalEventId(
  rows: Array<
    Pick<
      VehicleEnergyEventRefuelReconciliation,
      'canonicalEventId' | 'lateSiblingConflict' | 'reason' | 'reasonCodes'
    >
  >,
): string | null {
  const ids = new Set<string>();
  for (const row of rows) {
    if (!reconciliationImpliesLateSiblingAfterFinalization(row)) continue;
    if (row.canonicalEventId) ids.add(row.canonicalEventId);
  }
  if (ids.size === 1) {
    return [...ids][0]!;
  }
  return null;
}

export function evaluateIrreversibleCanonicalPinning(input: {
  component: PhysicalRefuelIdentityComponent;
  chosenCanonicalId: string;
  asOfMs: number;
  firstObservedAtById: Record<string, number>;
  settlementHorizonMs?: number;
  irreversiblePriorFinalOwnerIds: Set<string>;
  priorCanonicalFinalizationIds: Set<string>;
  persistedCanonicalEventId?: string | null;
}): { pin: true; ownerId: string } | { pin: false } {
  if (input.component.status !== 'VALID_COMPLETE_CLIQUE') {
    return { pin: false };
  }
  if (!input.component.isCompleteSameClique || input.component.members.length < 2) {
    return { pin: false };
  }

  const irreversibleOwnersInComponent = input.component.memberIds.filter(
    (id) =>
      input.irreversiblePriorFinalOwnerIds.has(id) &&
      input.priorCanonicalFinalizationIds.has(id),
  );
  if (irreversibleOwnersInComponent.length !== 1) {
    return { pin: false };
  }
  const ownerId = irreversibleOwnersInComponent[0]!;
  if (input.chosenCanonicalId !== ownerId) {
    return { pin: false };
  }

  const horizon =
    input.settlementHorizonMs ??
    DEFAULT_PHYSICAL_REFUEL_SETTLEMENT_CONFIG.settlementHorizonMs;

  const ownerFirstObservedMs = input.firstObservedAtById[ownerId];
  if (ownerFirstObservedMs != null) {
    const ownerSettlementCloseMs = ownerFirstObservedMs + horizon;
    let lateArrivalsAfterOwnerSettlement = 0;
    for (const memberId of input.component.memberIds) {
      if (memberId === ownerId) continue;
      const memberObservedMs = input.firstObservedAtById[memberId];
      if (memberObservedMs != null && memberObservedMs > ownerSettlementCloseMs) {
        lateArrivalsAfterOwnerSettlement += 1;
      }
    }
    if (lateArrivalsAfterOwnerSettlement > 1) {
      return { pin: false };
    }
  }

  if (
    input.persistedCanonicalEventId != null &&
    input.persistedCanonicalEventId !== ownerId
  ) {
    return { pin: false };
  }

  const settlement = isSettlementWindowOpen(
    input.component.members,
    input.asOfMs,
    input.firstObservedAtById,
    { settlementHorizonMs: horizon },
  );
  if (settlement.missingObservation || settlement.open) {
    return { pin: false };
  }

  return { pin: true, ownerId };
}

export function shouldPersistAuthorityRecheckHold(decision: {
  finalityState: string;
  reasonCodes: unknown;
  settlementWindowOpen: boolean;
}): boolean {
  if (decision.finalityState !== 'INSUFFICIENT_EVIDENCE') {
    return false;
  }
  if (decision.settlementWindowOpen) {
    return false;
  }
  if (!Array.isArray(decision.reasonCodes)) {
    return false;
  }
  return decision.reasonCodes.includes('late_sibling_after_finalization');
}

export const AUTHORITY_RECHECK_HOLD_REASON = 'authority_recheck_hold';

export const IRREVERSIBLE_CANONICAL_PINNED_REASON =
  'irreversible_canonical_pinned_after_late_sibling';
