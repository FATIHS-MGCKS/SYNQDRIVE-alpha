export const WORKFLOW_APPROVAL_ERROR_CODES = {
  NOT_FOUND: 'WORKFLOW_APPROVAL_NOT_FOUND',
  NOT_PENDING: 'WORKFLOW_APPROVAL_NOT_PENDING',
  ALREADY_DECIDED: 'WORKFLOW_APPROVAL_ALREADY_DECIDED',
  EXPIRED: 'WORKFLOW_APPROVAL_EXPIRED',
  TENANT_VIOLATION: 'WORKFLOW_APPROVAL_TENANT_VIOLATION',
  MAKER_CHECKER_VIOLATION: 'WORKFLOW_APPROVAL_MAKER_CHECKER_VIOLATION',
  PRE_EXECUTION_FAILED: 'WORKFLOW_APPROVAL_PRE_EXECUTION_FAILED',
  POLICY_NOT_FULFILLED: 'WORKFLOW_APPROVAL_POLICY_NOT_FULFILLED',
  ACTION_NOT_WAITING: 'WORKFLOW_APPROVAL_ACTION_NOT_WAITING',
  LEGACY_ONLY: 'WORKFLOW_APPROVAL_LEGACY_ONLY',
} as const;

export type WorkflowApprovalErrorCode =
  (typeof WORKFLOW_APPROVAL_ERROR_CODES)[keyof typeof WORKFLOW_APPROVAL_ERROR_CODES];

export interface WorkflowApprovalDecisionInput {
  organizationId: string;
  approvalId: string;
  userId: string;
  userName?: string;
  comment?: string;
  reason?: string;
}

export interface WorkflowApprovalSafeListItem {
  id: string;
  organizationId: string;
  workflowRunId: string;
  workflowVersionId: string;
  actionRunId: string;
  status: string;
  actionType: string;
  actionIndex: number;
  eventType: string;
  entityType: string | null;
  entityId: string | null;
  requestedBySystem: boolean;
  requestedByUserId: string | null;
  expiresAt: string | null;
  createdAt: string;
  decidedAt: string | null;
  rejectionStrategy: string;
}

export interface WorkflowApprovalPreExecutionCheck {
  code: string;
  passed: boolean;
  message: string;
}

export interface WorkflowApprovalPreExecutionResult {
  passed: boolean;
  checks: WorkflowApprovalPreExecutionCheck[];
}
