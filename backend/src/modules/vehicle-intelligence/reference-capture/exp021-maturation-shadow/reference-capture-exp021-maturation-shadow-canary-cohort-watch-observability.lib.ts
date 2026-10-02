export type Exp021CohortMemberPdiWatchState = {
  lastPhysicalEndMs: number | null;
  lastRejectionReason: string | null;
  lastFreshnessDecision: string | null;
};

export type Exp021CohortPdiDiscoveryDiagnostic = {
  vehicleId: string;
  tokenId: number;
  PDI_DISCOVERED: 'YES';
  PDI_PHYSICAL_END_AT: string;
  PDI_DISCOVERED_AT: string;
  PDI_AGE_MS: number;
  FRESHNESS_DECISION: string;
  REJECTION_REASON: string | null;
  BASELINE_AFTER_PHYSICAL_END_MS: number;
  ENROLLMENT_ATTEMPTED: 'YES' | 'NO';
  FAMILY_ID?: string;
};

export function shouldEmitPdiDiscoveryDiagnostic(
  state: Exp021CohortMemberPdiWatchState,
  physicalEndMs: number,
  rejectionReason: string | null,
  freshnessDecision: string,
): boolean {
  if (state.lastPhysicalEndMs !== physicalEndMs) {
    return true;
  }
  if (state.lastRejectionReason !== rejectionReason) {
    return true;
  }
  if (state.lastFreshnessDecision !== freshnessDecision) {
    return true;
  }
  return false;
}

export function updatePdiWatchState(
  state: Exp021CohortMemberPdiWatchState,
  physicalEndMs: number,
  rejectionReason: string | null,
  freshnessDecision: string,
): void {
  state.lastPhysicalEndMs = physicalEndMs;
  state.lastRejectionReason = rejectionReason;
  state.lastFreshnessDecision = freshnessDecision;
}
