export class ApdShadowDecisionEpochConflictError extends Error {
  readonly code = 'APD_SHADOW_DECISION_EPOCH_CONFLICT' as const;

  constructor(
    message: string,
    readonly details: {
      organizationId: string;
      vehicleId: string;
      opportunityId: string;
      policyVersion: string;
      existingEpochId: string | null;
      attemptedEpochId: string | null;
    },
  ) {
    super(message);
    this.name = 'ApdShadowDecisionEpochConflictError';
  }
}

export class ApdShadowDecisionProvenanceImmutableError extends Error {
  readonly code = 'APD_SHADOW_DECISION_PROVENANCE_IMMUTABLE' as const;

  constructor(message: string) {
    super(message);
    this.name = 'ApdShadowDecisionProvenanceImmutableError';
  }
}

export class ApdShadowDecisionEpochInactiveError extends Error {
  readonly code = 'APD_SHADOW_DECISION_EPOCH_INACTIVE' as const;

  constructor(message = 'activation epoch not ACTIVE at decision commit boundary') {
    super(message);
    this.name = 'ApdShadowDecisionEpochInactiveError';
  }
}
