import type { WorkflowActionRiskClass } from '../actions/workflow-action-registry.types';

/** Server-side approval requirement — independent from workflow definition flags. */
export type WorkflowApprovalRule =
  | 'NONE'
  | 'OPTIONAL'
  | 'REQUIRED'
  | 'GATE_ONLY';

export type WorkflowAuditLevel = 'MINIMAL' | 'STANDARD' | 'DETAILED' | 'FORENSIC';

export type WorkflowRetentionClass = 'SHORT' | 'STANDARD' | 'LONG' | 'COMPLIANCE';

export type WorkflowDataCategory =
  | 'OPERATIONAL'
  | 'PII'
  | 'FINANCIAL'
  | 'HEALTH'
  | 'COMMUNICATION'
  | 'VEHICLE_TELEMETRY';

export type WorkflowActionCapabilityGate = 'ENABLED' | 'DISABLED' | 'DEPRECATED';

export interface WorkflowActionTimeoutPolicy {
  defaultMs: number;
  maxMs: number;
}

export interface WorkflowActionRetryPolicy {
  maxAttempts: number;
  initialBackoffMs: number;
  maxBackoffMs: number;
}

export interface WorkflowActionHighRiskSafeguard {
  code: string;
  description: string;
}

/** Immutable technical policy contract for a workflow action type. */
export interface WorkflowActionTechnicalPolicy {
  actionType: string;
  policyVersion: string;
  capabilityGate: WorkflowActionCapabilityGate;
  riskClass: WorkflowActionRiskClass;
  requiredPermission: string;
  approvalRule: WorkflowApprovalRule;
  /** `*` = all canonical workflow event types. */
  allowedTriggers: readonly string[] | '*';
  /** `*` = any entity type (including none). */
  allowedEntityTypes: readonly string[] | '*';
  allowedScopes: readonly ('organization' | 'vehicle' | 'station')[];
  timeout: WorkflowActionTimeoutPolicy;
  retry: WorkflowActionRetryPolicy;
  /** Hard cap on execution attempts per action run (including retries). */
  maxAttempts: number;
  fallbackCapable: boolean;
  dataCategories: readonly WorkflowDataCategory[];
  auditLevel: WorkflowAuditLevel;
  retentionClass: WorkflowRetentionClass;
  dryRunAvailable: boolean;
  compensationPossible: boolean;
  highRiskSafeguards?: readonly WorkflowActionHighRiskSafeguard[];
  /** Explicit trigger/action combinations that are forbidden. */
  forbiddenTriggerCombinations?: readonly { trigger: string; reason: string }[];
  /** Block outbound diagnostic messaging on critical vehicle health triggers. */
  prohibitUnverifiedDiagnosisOnTriggers?: readonly string[];
}

/** Frozen policy captured at preview/plan time — authoritative for approved runs. */
export interface WorkflowActionPolicySnapshot {
  policyVersion: string;
  actionType: string;
  riskClass: WorkflowActionRiskClass;
  requiredPermission: string;
  approvalRule: WorkflowApprovalRule;
  allowedTriggers: readonly string[] | '*';
  allowedEntityTypes: readonly string[] | '*';
  allowedScopes: readonly string[];
  timeout: WorkflowActionTimeoutPolicy;
  retry: WorkflowActionRetryPolicy;
  maxAttempts: number;
  fallbackCapable: boolean;
  dataCategories: readonly WorkflowDataCategory[];
  auditLevel: WorkflowAuditLevel;
  retentionClass: WorkflowRetentionClass;
  dryRunAvailable: boolean;
  compensationPossible: boolean;
  capturedAt: string;
  snapshotHash: string;
}

export type WorkflowActionPolicyViolationCode =
  | 'UNKNOWN_ACTION'
  | 'CAPABILITY_DISABLED'
  | 'RISK_DOWNGRADE'
  | 'PERMISSION_DENIED'
  | 'TRIGGER_NOT_ALLOWED'
  | 'ENTITY_TYPE_NOT_ALLOWED'
  | 'SCOPE_NOT_ALLOWED'
  | 'APPROVAL_REQUIRED'
  | 'SAFETY_BLOCK'
  | 'UNVERIFIED_DIAGNOSIS'
  | 'TENANT_VIOLATION'
  | 'DRY_RUN_UNAVAILABLE'
  | 'POLICY_CHANGED_POST_APPROVAL';

export interface WorkflowActionPolicyViolation {
  code: WorkflowActionPolicyViolationCode;
  message: string;
}

export interface WorkflowActionPolicyEvaluation {
  allowed: boolean;
  violations: WorkflowActionPolicyViolation[];
  policy: WorkflowActionTechnicalPolicy;
  snapshot: WorkflowActionPolicySnapshot;
  requiresApproval: boolean;
  safetyBlocked: boolean;
  useFrozenSnapshot: boolean;
}

export interface WorkflowActionPolicyEvaluateInput {
  organizationId: string;
  actionType: string;
  eventType: string;
  entityType?: string | null;
  scopeType: string;
  actorPermissions?: string[];
  clientRiskClass?: string;
  mode: 'preview' | 'execute';
  /** Stored snapshot from action run — honored when run was already approved. */
  frozenSnapshot?: WorkflowActionPolicySnapshot | null;
  runApproved?: boolean;
  actionConfig?: Record<string, unknown>;
  payload?: Record<string, unknown>;
}
