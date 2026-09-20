import {
  FuelStationEnrichmentProcessingStatus,
  type FuelStationEnrichmentResolutionStatus,
  PhysicalRefuelFinalityState,
  type VehicleEnergyEventRefuelReconciliation,
} from '@prisma/client';

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

export const AUTHORITY_RECHECK_HOLD_REASON = 'authority_recheck_hold';
