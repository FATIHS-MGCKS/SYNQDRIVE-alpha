import { parseSignalTimestampMs } from './vsi-capability-resolver.freshness';

export const VsiApdsShadowBindingStatus = {
  MATCHED: 'MATCHED',
  UNKNOWN: 'UNKNOWN',
  REJECTED: 'REJECTED',
  MISSING_PERSISTED_DECISION: 'MISSING_PERSISTED_DECISION',
  UNVERIFIED_ANALYSIS: 'UNVERIFIED_ANALYSIS',
} as const;

export type VsiApdsShadowBindingStatus =
  (typeof VsiApdsShadowBindingStatus)[keyof typeof VsiApdsShadowBindingStatus];

export const VsiApdsCorrelationAnalysisMode = {
  VERIFIED_SHADOW_CORRELATION: 'VERIFIED_SHADOW_CORRELATION',
  UNVERIFIED_ANALYSIS: 'UNVERIFIED_ANALYSIS',
} as const;

export type VsiApdsCorrelationAnalysisMode =
  (typeof VsiApdsCorrelationAnalysisMode)[keyof typeof VsiApdsCorrelationAnalysisMode];

/** Fields persisted on `ApdShadowReconciliationDecision` (vehicle-scoped; no provider link). */
export type VsiApdsPersistedShadowDecisionV1 = {
  organizationId: string;
  vehicleId: string;
  opportunityId: string;
  decisionAt: Date;
  policyVersion: string;
  activationEpochId: string | null;
  decision: string;
};

export type VsiApdsShadowCorrelationRequestV1 = {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  opportunityId: string;
  decisionAt: Date;
  policyVersion: string;
  activationEpochId?: string | null;
  baselineDecision?: string | null;
};

export function parseApdsShadowDecisionAtMs(decisionAt: Date | string): number | null {
  const ms =
    decisionAt instanceof Date ? decisionAt.getTime() : parseSignalTimestampMs(decisionAt);
  if (ms == null || !Number.isFinite(ms)) {
    return null;
  }
  return ms;
}

export function isProviderSourceLinkActiveAtDecision(input: {
  activatedAt: Date;
  deactivatedAt: Date | null;
  supersededAt: Date | null;
  decisionAtMs: number;
}): boolean {
  const activatedMs = input.activatedAt.getTime();
  if (!Number.isFinite(activatedMs) || activatedMs > input.decisionAtMs) {
    return false;
  }
  if (input.deactivatedAt != null) {
    const deactivatedMs = input.deactivatedAt.getTime();
    if (Number.isFinite(deactivatedMs) && deactivatedMs <= input.decisionAtMs) {
      return false;
    }
  }
  if (input.supersededAt != null) {
    const supersededMs = input.supersededAt.getTime();
    if (Number.isFinite(supersededMs) && supersededMs <= input.decisionAtMs) {
      return false;
    }
  }
  return true;
}

function validateEpochIdentity(
  requestEpoch: string | null,
  rowEpoch: string | null,
  reasons: string[],
): void {
  if (rowEpoch != null) {
    if (requestEpoch == null) {
      reasons.push('ACTIVATION_EPOCH_ID_REQUIRED_FOR_EPOCH_BOUND_DECISION');
      return;
    }
    if (requestEpoch !== rowEpoch) {
      reasons.push('ACTIVATION_EPOCH_ID_MISMATCH');
    }
    return;
  }
  if (requestEpoch != null) {
    reasons.push('LEGACY_NULL_EPOCH_ROW_CANNOT_SATISFY_EPOCH_BOUND_REQUEST');
  }
}

/**
 * Validates correlation inputs against durable APDS shadow identity.
 * Verified correlation requires a persisted decision row — never MATCHED without it.
 */
export function validateVsiApdsShadowOpportunityBinding(input: {
  persistedDecision: VsiApdsPersistedShadowDecisionV1 | null;
  request: VsiApdsShadowCorrelationRequestV1;
  activeSourceLinkCount: number;
  correlationMode: VsiApdsCorrelationAnalysisMode;
  historicalLinkActiveAtDecision: boolean;
}): { bindingStatus: VsiApdsShadowBindingStatus; reasons: string[] } {
  const reasons: string[] = [];
  const requestMs = parseApdsShadowDecisionAtMs(input.request.decisionAt);
  if (requestMs == null) {
    return {
      bindingStatus: VsiApdsShadowBindingStatus.REJECTED,
      reasons: ['INVALID_CORRELATION_DECISION_TIMESTAMP'],
    };
  }
  if (requestMs > Date.now() + 60_000) {
    return {
      bindingStatus: VsiApdsShadowBindingStatus.REJECTED,
      reasons: ['CORRELATION_DECISION_TIMESTAMP_IN_FUTURE'],
    };
  }

  if (input.correlationMode === VsiApdsCorrelationAnalysisMode.UNVERIFIED_ANALYSIS) {
    return {
      bindingStatus: VsiApdsShadowBindingStatus.UNVERIFIED_ANALYSIS,
      reasons: ['UNVERIFIED_ANALYSIS_NOT_VERIFIED_SHADOW_CORRELATION'],
    };
  }

  if (!input.persistedDecision) {
    return {
      bindingStatus: VsiApdsShadowBindingStatus.MISSING_PERSISTED_DECISION,
      reasons: ['APDS_SHADOW_DECISION_ROW_NOT_FOUND'],
    };
  }

  const row = input.persistedDecision;
  if (row.organizationId !== input.request.organizationId) {
    reasons.push('ORGANIZATION_ID_MISMATCH');
  }
  if (row.vehicleId !== input.request.vehicleId) {
    reasons.push('VEHICLE_ID_MISMATCH');
  }
  if (row.opportunityId !== input.request.opportunityId) {
    reasons.push('OPPORTUNITY_ID_MISMATCH');
  }
  if (row.policyVersion !== input.request.policyVersion) {
    reasons.push('POLICY_VERSION_MISMATCH');
  }
  const rowMs = row.decisionAt.getTime();
  if (!Number.isFinite(rowMs) || rowMs !== requestMs) {
    reasons.push('DECISION_AT_MISMATCH');
  }
  validateEpochIdentity(input.request.activationEpochId ?? null, row.activationEpochId, reasons);

  if (input.request.baselineDecision != null && input.request.baselineDecision !== row.decision) {
    reasons.push('BASELINE_DECISION_MISMATCH');
  }

  if (reasons.length > 0) {
    return { bindingStatus: VsiApdsShadowBindingStatus.REJECTED, reasons };
  }

  if (!input.historicalLinkActiveAtDecision) {
    reasons.push('HISTORICAL_SOURCE_LINK_ATTRIBUTION_UNPROVEN');
    return { bindingStatus: VsiApdsShadowBindingStatus.UNKNOWN, reasons };
  }

  if (input.activeSourceLinkCount > 1) {
    reasons.push('APDS_VEHICLE_LEVEL_DECISION_MULTI_ACTIVE_SOURCE_LINKS');
    return { bindingStatus: VsiApdsShadowBindingStatus.UNKNOWN, reasons };
  }

  if (input.activeSourceLinkCount === 0) {
    reasons.push('NO_ACTIVE_SOURCE_LINK_FOR_ATTRIBUTION');
    return { bindingStatus: VsiApdsShadowBindingStatus.UNKNOWN, reasons };
  }

  return { bindingStatus: VsiApdsShadowBindingStatus.MATCHED, reasons };
}
