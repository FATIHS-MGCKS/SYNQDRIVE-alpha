import {
  VSI_APDS_P5B1_DEFAULT_BATCH_LIMIT,
  VSI_APDS_P5B1_MAX_BATCH_LIMIT,
  VSI_APDS_P5B1_MAX_TOTAL_DECISIONS,
  VSI_APDS_P5B1_MAX_WINDOW_MS,
} from './vsi-apds-p5b1.contract';
import type {
  VsiApdsP5b1OfflineReplayFilterV1,
  VsiApdsP5b1OfflineReplayPaginationV1,
} from './vsi-apds-p5b1.types';

export type VsiApdsP5b1OperatorScopeV1 = {
  organizationId: string;
  decisionAtFrom: Date;
  decisionAtTo: Date;
  batchLimit: number;
  maxTotalDecisions: number;
  vehicleId?: string;
  activationEpochId?: string | null;
  policyVersions?: readonly string[];
  opportunityId?: string;
};

export class VsiApdsP5b1OperatorScopeError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'VsiApdsP5b1OperatorScopeError';
  }
}

export function parseP5b1OperatorScope(input: {
  filter: VsiApdsP5b1OfflineReplayFilterV1;
  pagination?: VsiApdsP5b1OfflineReplayPaginationV1;
  maxTotalDecisions?: number;
}): VsiApdsP5b1OperatorScopeV1 {
  const organizationId = input.filter.organizationId?.trim();
  if (!organizationId) {
    throw new VsiApdsP5b1OperatorScopeError(
      'ORGANIZATION_ID_REQUIRED',
      'organizationId is required; all-tenant replay is forbidden',
    );
  }

  const decisionAtFrom = input.filter.decisionAtFrom;
  const decisionAtTo = input.filter.decisionAtTo;
  if (!decisionAtFrom || !decisionAtTo) {
    throw new VsiApdsP5b1OperatorScopeError(
      'DECISION_TIME_WINDOW_REQUIRED',
      'decisionAtFrom and decisionAtTo are required',
    );
  }
  if (
    !Number.isFinite(decisionAtFrom.getTime()) ||
    !Number.isFinite(decisionAtTo.getTime())
  ) {
    throw new VsiApdsP5b1OperatorScopeError(
      'DECISION_TIME_WINDOW_INVALID',
      'decisionAtFrom/decisionAtTo must be valid dates',
    );
  }
  if (decisionAtFrom.getTime() >= decisionAtTo.getTime()) {
    throw new VsiApdsP5b1OperatorScopeError(
      'DECISION_TIME_WINDOW_INVALID',
      'decisionAtFrom must be before decisionAtTo',
    );
  }
  if (decisionAtTo.getTime() - decisionAtFrom.getTime() > VSI_APDS_P5B1_MAX_WINDOW_MS) {
    throw new VsiApdsP5b1OperatorScopeError(
      'DECISION_TIME_WINDOW_TOO_WIDE',
      'decision time window exceeds maximum allowed span',
    );
  }

  const batchLimit = input.pagination?.limit ?? VSI_APDS_P5B1_DEFAULT_BATCH_LIMIT;
  if (!Number.isFinite(batchLimit) || batchLimit < 1 || batchLimit > VSI_APDS_P5B1_MAX_BATCH_LIMIT) {
    throw new VsiApdsP5b1OperatorScopeError(
      'BATCH_LIMIT_OUT_OF_RANGE',
      `batch limit must be 1..${VSI_APDS_P5B1_MAX_BATCH_LIMIT}`,
    );
  }

  const maxTotalDecisions = input.maxTotalDecisions ?? VSI_APDS_P5B1_MAX_TOTAL_DECISIONS;
  if (
    !Number.isFinite(maxTotalDecisions) ||
    maxTotalDecisions < 1 ||
    maxTotalDecisions > VSI_APDS_P5B1_MAX_TOTAL_DECISIONS
  ) {
    throw new VsiApdsP5b1OperatorScopeError(
      'MAX_TOTAL_DECISIONS_OUT_OF_RANGE',
      `maxTotalDecisions must be 1..${VSI_APDS_P5B1_MAX_TOTAL_DECISIONS}`,
    );
  }

  validateP5b1ContinuationCursor(input.pagination);

  return {
    organizationId,
    decisionAtFrom,
    decisionAtTo,
    batchLimit,
    maxTotalDecisions,
    vehicleId: input.filter.vehicleId,
    activationEpochId: input.filter.activationEpochId,
    policyVersions: input.filter.policyVersions,
    opportunityId: input.filter.opportunityId,
  };
}

export function validateP5b1ContinuationCursor(
  pagination?: VsiApdsP5b1OfflineReplayPaginationV1,
): void {
  const hasAt = pagination?.cursorDecisionAt != null;
  const hasId = pagination?.cursorId != null;
  if (hasAt !== hasId) {
    throw new VsiApdsP5b1OperatorScopeError(
      'CURSOR_INCOMPLETE',
      'cursorDecisionAt and cursorId must be provided together',
    );
  }
  if (hasAt && pagination?.cursorDecisionAt) {
    if (!Number.isFinite(pagination.cursorDecisionAt.getTime())) {
      throw new VsiApdsP5b1OperatorScopeError('CURSOR_INVALID', 'cursorDecisionAt is invalid');
    }
    if (!pagination.cursorId?.trim()) {
      throw new VsiApdsP5b1OperatorScopeError('CURSOR_INVALID', 'cursorId is empty');
    }
  }
}

export function resolveBoundedBatchLimit(input: {
  scope: VsiApdsP5b1OperatorScopeV1;
  decisionsProcessedSoFar: number;
}): number {
  const remaining = input.scope.maxTotalDecisions - input.decisionsProcessedSoFar;
  if (remaining <= 0) {
    return 0;
  }
  return Math.min(input.scope.batchLimit, remaining);
}
