import { BadRequestException } from '@nestjs/common';
import type { WorkflowActionDef } from './workflow-definition.validator';
import { resolveWorkflowActionType } from './workflow-action-capabilities';

/** Phase 5 will flip this when pause-and-resume is production-ready. */
export const WORKFLOW_APPROVAL_RESUME_SUPPORTED = false;

export const WORKFLOW_APPROVAL_DEFAULT_TTL_HOURS = 72;

export const WORKFLOW_APPROVAL_ERROR_CODES = {
  NOT_FOUND: 'WORKFLOW_APPROVAL_NOT_FOUND',
  NOT_PENDING: 'WORKFLOW_APPROVAL_NOT_PENDING',
  ALREADY_DECIDED: 'WORKFLOW_APPROVAL_ALREADY_DECIDED',
  EXPIRED: 'WORKFLOW_APPROVAL_EXPIRED',
  FOREIGN_TENANT: 'WORKFLOW_APPROVAL_FOREIGN_TENANT',
  SELF_APPROVAL_FORBIDDEN: 'WORKFLOW_APPROVAL_SELF_APPROVAL_FORBIDDEN',
  RESUME_NOT_SUPPORTED: 'WORKFLOW_APPROVAL_RESUME_NOT_SUPPORTED',
  INSUFFICIENT_PERMISSION: 'WORKFLOW_APPROVAL_INSUFFICIENT_PERMISSION',
} as const;

export type WorkflowApprovalErrorCode =
  (typeof WORKFLOW_APPROVAL_ERROR_CODES)[keyof typeof WORKFLOW_APPROVAL_ERROR_CODES];

const INHERENTLY_APPROVAL_GATED = new Set([
  'workflow.approval.request',
  'ai.suggest_action',
]);

export function isApprovalGatedAction(action: WorkflowActionDef): boolean {
  const canonical =
    resolveWorkflowActionType(action.type).canonicalType ?? action.type;
  return action.requiresApproval === true || INHERENTLY_APPROVAL_GATED.has(canonical);
}

export function workflowContainsApprovalGatedActions(
  actions: WorkflowActionDef[],
): boolean {
  return actions.some((action) => isApprovalGatedAction(action));
}

export function assertWorkflowActivatableWithApprovalPolicy(
  actions: WorkflowActionDef[],
  targetStatus?: string,
): void {
  if (targetStatus !== 'ACTIVE') return;
  if (!WORKFLOW_APPROVAL_RESUME_SUPPORTED && workflowContainsApprovalGatedActions(actions)) {
    throw new BadRequestException({
      message:
        'Workflows with approval-gated actions cannot be activated until pause-and-resume is available (Phase 5). Save as draft or remove approval-gated actions.',
      code: WORKFLOW_APPROVAL_ERROR_CODES.RESUME_NOT_SUPPORTED,
      interimPhase: true,
    });
  }
}

export function approvalExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + WORKFLOW_APPROVAL_DEFAULT_TTL_HOURS * 60 * 60 * 1000);
}

export function isApprovalExpired(expiresAt?: Date | null, now = new Date()): boolean {
  return !!expiresAt && expiresAt.getTime() <= now.getTime();
}

export function assertApproverNotSelf(input: {
  approverUserId?: string;
  workflowCreatedById?: string | null;
  runPayload?: Record<string, unknown> | null;
}): void {
  if (!input.approverUserId) return;
  if (
    input.workflowCreatedById &&
    input.approverUserId === input.workflowCreatedById
  ) {
    throw new BadRequestException({
      message: 'Approvers cannot approve their own workflow actions',
      code: WORKFLOW_APPROVAL_ERROR_CODES.SELF_APPROVAL_FORBIDDEN,
    });
  }
  const triggeredByUserId = input.runPayload?.triggeredByUserId;
  if (
    typeof triggeredByUserId === 'string' &&
    triggeredByUserId &&
    triggeredByUserId === input.approverUserId
  ) {
    throw new BadRequestException({
      message: 'Approvers cannot approve actions they triggered',
      code: WORKFLOW_APPROVAL_ERROR_CODES.SELF_APPROVAL_FORBIDDEN,
    });
  }
}

export function interimApprovalOutput(comment?: string) {
  return {
    approved: true,
    executedAfterApproval: false,
    resumeSupported: WORKFLOW_APPROVAL_RESUME_SUPPORTED,
    interimPhase: true,
    message:
      'Approval recorded. Automatic action resume is not available yet — manual follow-up required.',
    comment: comment?.trim() || null,
  };
}
