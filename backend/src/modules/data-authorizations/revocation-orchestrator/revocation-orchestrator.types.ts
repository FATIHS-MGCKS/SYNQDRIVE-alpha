import type {
  DataAuthorizationRevocationTriggerType,
  DataAuthorizationRevocationWorkflowStatus,
} from '@prisma/client';
import type { RevocationRetentionDecision } from './revocation-orchestrator.constants';

export interface RevocationWorkflowRequest {
  organizationId: string;
  triggerType: DataAuthorizationRevocationTriggerType;
  correlationId: string;
  actorUserId?: string | null;
  reason?: string | null;
  processingActivityId?: string | null;
  enforcementPolicyId?: string | null;
  consentId?: string | null;
  providerGrantId?: string | null;
  dataSharingAuthId?: string | null;
  legacyOrgAuthId?: string | null;
  dataCategories: string[];
  purposes: string[];
  vehicleIds?: string[] | null;
  idempotencyKey?: string;
  entityId: string;
  mutationVersion?: number | string;
}

export interface RevocationWorkflowRecord {
  id: string;
  organizationId: string;
  idempotencyKey: string;
  triggerType: DataAuthorizationRevocationTriggerType;
  status: DataAuthorizationRevocationWorkflowStatus;
  correlationId: string;
  completedSteps: string[];
  retentionDecision: string | null;
  attempts: number;
  maxAttempts: number;
  failureReason: string | null;
  denySwitchActivatedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  deadLetteredAt: Date | null;
}

export interface RevocationRequestResult {
  workflowId: string;
  status: DataAuthorizationRevocationWorkflowStatus;
  idempotentReplay: boolean;
  denySwitchActivated: boolean;
}

export interface RevocationProcessResult {
  workflowId: string;
  outcome: 'advanced' | 'completed' | 'retry' | 'failed' | 'paused' | 'skipped';
  status: DataAuthorizationRevocationWorkflowStatus;
  stepKey?: string;
  errorMessage?: string;
}

export interface RevocationResumeInput {
  organizationId: string;
  workflowId: string;
  actorUserId: string;
  retentionDecision?: RevocationRetentionDecision;
  resetAttempts?: boolean;
}

export interface RevocationStepContext {
  workflowId: string;
  organizationId: string;
  correlationId: string;
  triggerType: DataAuthorizationRevocationTriggerType;
  processingActivityId: string | null;
  enforcementPolicyId: string | null;
  consentId: string | null;
  providerGrantId: string | null;
  dataSharingAuthId: string | null;
  legacyOrgAuthId: string | null;
  dataCategories: string[];
  purposes: string[];
  vehicleIds: string[];
  retentionDecision: string | null;
  reason: string | null;
}

export interface RevocationStepOutcome {
  stepKey: string;
  outcome: 'success' | 'skipped';
  detail?: Record<string, unknown>;
}
