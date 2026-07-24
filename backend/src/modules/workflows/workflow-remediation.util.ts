import type { WorkflowActionDef } from './workflow-definition.validator';
import {
  collectWorkflowActionCapabilityIssues,
  resolveWorkflowActionType,
} from './workflow-action-capabilities';

export interface WorkflowRemediationResult {
  workflowId: string;
  remediationRequired: boolean;
  remediationReason: string | null;
  issues: ReturnType<typeof collectWorkflowActionCapabilityIssues>;
}

export function assessWorkflowActionRemediation(input: {
  id: string;
  actions: unknown;
}): WorkflowRemediationResult {
  const actions = (Array.isArray(input.actions) ? input.actions : []) as WorkflowActionDef[];
  const issues = collectWorkflowActionCapabilityIssues(actions, 'activate');
  if (issues.length === 0) {
    return {
      workflowId: input.id,
      remediationRequired: false,
      remediationReason: null,
      issues,
    };
  }
  const summary = issues
    .map((issue) => `${issue.rawType} (${issue.code})`)
    .join(', ');
  return {
    workflowId: input.id,
    remediationRequired: true,
    remediationReason: `Workflow actions require remediation: ${summary}`,
    issues,
  };
}

export function normalizeStoredWorkflowActions(actions: unknown): WorkflowActionDef[] {
  if (!Array.isArray(actions)) return [];
  return actions.map((action) => {
    const raw = action as WorkflowActionDef;
    const resolved = resolveWorkflowActionType(raw.type);
    return {
      ...raw,
      type: resolved.canonicalType ?? raw.type,
    };
  });
}
