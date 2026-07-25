import type { WorkflowActionRiskClass } from './workflow-execution-snapshot.constants';

export interface WorkflowTemplateRef {
  templateId: string;
  templateVersion: string;
  purpose: string;
}

export interface WorkflowExecutionSnapshotAction {
  actionKey: string;
  actionIndex: number;
  actionType: string;
  requiresApproval: boolean;
  capabilityStatusAtPublish: string | null;
  riskClass: WorkflowActionRiskClass;
  requiredPermissions: string[];
  config: Record<string, unknown>;
  templateRefs: WorkflowTemplateRef[];
}

export interface WorkflowExecutionSnapshotConditionLeaf {
  fieldPath: string;
  operator: string;
  value: unknown;
  sortOrder: number;
}

export interface WorkflowExecutionSnapshotConditionGroup {
  groupId: string;
  logicOperator: string;
  sortOrder: number;
  conditions: WorkflowExecutionSnapshotConditionLeaf[];
  childGroups: WorkflowExecutionSnapshotConditionGroup[];
}

export interface WorkflowExecutionSnapshotEventEnvelope {
  eventType: string;
  entityType?: string | null;
  entityId?: string | null;
  correlationId?: string | null;
  causationId?: string | null;
  occurredAt: string;
  idempotencyKey: string;
}

export interface WorkflowExecutionSnapshotEventPayload {
  payloadRef: {
    kind: 'inline' | 'entity';
    entityType?: string | null;
    entityId?: string | null;
  };
  minimizedPayload: Record<string, unknown>;
}

export interface WorkflowExecutionSnapshotPolicyBlock {
  policySnapshotId: string;
  capabilityRevision: string;
  contentHash: string;
  approvalResumeSupported: boolean;
  approvalTtlHours: number;
  approvalRequiredActionTypes: string[];
  featureFlags: Array<{
    flagKey: string;
    enabled: boolean;
    scope: string;
    rolloutPercentage: number | null;
  }>;
}

export interface WorkflowExecutionSnapshotDefinitionBlock {
  definitionId: string;
  definitionName: string;
  category: string;
  versionId: string;
  versionNumber: number;
  publishedAt: string | null;
  versionContentHash: string;
}

export interface WorkflowExecutionSnapshotGraphBlock {
  trigger: { type: string; config: Record<string, unknown> };
  scope: {
    type: string;
    stationIds: string[];
    vehicleIds: string[];
  };
  conditionTree: WorkflowExecutionSnapshotConditionGroup[];
  actions: WorkflowExecutionSnapshotAction[];
}

export interface WorkflowExecutionSnapshotConditionEvaluation {
  passed: boolean;
  evaluatedAt: string;
  results: unknown;
}

export interface WorkflowExecutionSnapshotPayload {
  snapshotVersion: number;
  capturedAt: string;
  definition: WorkflowExecutionSnapshotDefinitionBlock;
  graph: WorkflowExecutionSnapshotGraphBlock;
  policies: WorkflowExecutionSnapshotPolicyBlock;
  templates: WorkflowTemplateRef[];
  event: {
    envelope: WorkflowExecutionSnapshotEventEnvelope;
    payload: WorkflowExecutionSnapshotEventPayload;
  };
  conditionEvaluation?: WorkflowExecutionSnapshotConditionEvaluation;
}

export interface WorkflowExecutionSnapshotCaptureInput {
  organizationId: string;
  workflowRunId: string;
  workflowDefinitionId: string;
  workflowVersionId: string;
  policySnapshotId: string;
  event: WorkflowExecutionSnapshotEventEnvelope;
  rawEventPayload: Record<string, unknown>;
  conditionEvaluation?: WorkflowExecutionSnapshotConditionEvaluation;
  capturedAt?: Date;
}
