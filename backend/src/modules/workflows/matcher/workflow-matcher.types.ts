import type { WorkflowDomainEventEnvelope } from '../envelope';
import type { WorkflowMatcherSkipReason } from './workflow-matcher-skip-reasons';

export interface WorkflowMatcherMatchedWorkflow {
  workflowDefinitionId: string;
  workflowVersionId: string;
  definitionName: string;
  definitionSlug: string | null;
  versionNumber: number;
  triggerType: string;
  scopeType: string;
  matchRank: number;
}

export interface WorkflowMatcherSkippedWorkflow {
  workflowDefinitionId: string;
  workflowVersionId: string;
  definitionName: string;
  versionNumber: number;
  skipReason: WorkflowMatcherSkipReason;
  skipDetail?: string;
}

export interface WorkflowMatcherResult {
  organizationId: string;
  eventId: string;
  eventType: string;
  eventVersion: string;
  evaluatedAt: string;
  dryRun: boolean;
  matches: WorkflowMatcherMatchedWorkflow[];
  skipped: WorkflowMatcherSkippedWorkflow[];
  candidatesEvaluated: number;
}

export interface WorkflowMatcherInput {
  envelope: WorkflowDomainEventEnvelope;
  /** When true, returns explainable skip reasons without side effects (default true). */
  dryRun?: boolean;
  asOf?: Date;
}

export interface WorkflowMatcherCandidateRow {
  triggerId: string;
  triggerType: string;
  triggerConfig: unknown;
  versionId: string;
  versionNumber: number;
  versionStatus: string;
  publishedAt: Date | null;
  definitionId: string;
  definitionName: string;
  definitionSlug: string | null;
  definitionCreatedAt: Date;
  definitionLifecycleStatus: string;
  remediationRequired: boolean;
  activeVersionId: string | null;
  scopeType: string | null;
  bindings: Array<{ bindingType: string; bindingId: string }>;
  actions: Array<{
    actionType: string;
    actionIndex: number;
    capabilityStatusAtPublish: string | null;
  }>;
}

export interface WorkflowMatcherFeatureFlagRow {
  id: string;
  scope: string;
  organizationId: string | null;
  workflowDefinitionId: string | null;
  flagKey: string;
  enabled: boolean;
  rolloutPercentage: number | null;
  rolloutScopes: Array<{ scopeType: string; scopeId: string }>;
}

export interface WorkflowMatcherPolicyContext {
  workflowAutomationEnabled: boolean;
}
