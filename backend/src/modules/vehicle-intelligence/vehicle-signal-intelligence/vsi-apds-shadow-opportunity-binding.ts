import { parseSignalTimestampMs } from './vsi-capability-resolver.freshness';

export const VsiApdsShadowBindingStatus = {
  MATCHED: 'MATCHED',
  UNKNOWN: 'UNKNOWN',
  REJECTED: 'REJECTED',
} as const;

export type VsiApdsShadowBindingStatus =
  (typeof VsiApdsShadowBindingStatus)[keyof typeof VsiApdsShadowBindingStatus];

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
};

export function parseApdsShadowDecisionAtMs(decisionAt: Date | string): number | null {
  const ms =
    decisionAt instanceof Date ? decisionAt.getTime() : parseSignalTimestampMs(decisionAt);
  if (ms == null || !Number.isFinite(ms)) {
    return null;
  }
  return ms;
}

/**
 * Validates caller correlation inputs against durable APDS shadow identity when provided.
 * APDS decisions are vehicle-scoped; per-link attribution requires separate VSI evidence.
 */
export function validateVsiApdsShadowOpportunityBinding(input: {
  persistedDecision: VsiApdsPersistedShadowDecisionV1 | null;
  request: VsiApdsShadowCorrelationRequestV1;
  activeSourceLinkCount: number;
  requirePersistedDecision?: boolean;
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

  if (input.requirePersistedDecision && !input.persistedDecision) {
    return {
      bindingStatus: VsiApdsShadowBindingStatus.REJECTED,
      reasons: ['APDS_SHADOW_DECISION_ROW_NOT_FOUND'],
    };
  }

  if (input.persistedDecision) {
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
    const reqEpoch = input.request.activationEpochId ?? null;
    const rowEpoch = row.activationEpochId ?? null;
    if (reqEpoch != null && rowEpoch != null && reqEpoch !== rowEpoch) {
      reasons.push('ACTIVATION_EPOCH_ID_MISMATCH');
    }
    if (reasons.length > 0) {
      return { bindingStatus: VsiApdsShadowBindingStatus.REJECTED, reasons };
    }
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
