import { createHash } from 'crypto';
import type {
  WorkflowActionPolicySnapshot,
  WorkflowActionTechnicalPolicy,
} from './workflow-action-policy.types';

export function buildPolicySnapshot(
  policy: WorkflowActionTechnicalPolicy,
  capturedAt: Date = new Date(),
): WorkflowActionPolicySnapshot {
  const base = {
    policyVersion: policy.policyVersion,
    actionType: policy.actionType,
    riskClass: policy.riskClass,
    requiredPermission: policy.requiredPermission,
    approvalRule: policy.approvalRule,
    allowedTriggers: policy.allowedTriggers,
    allowedEntityTypes: policy.allowedEntityTypes,
    allowedScopes: [...policy.allowedScopes],
    timeout: { ...policy.timeout },
    retry: { ...policy.retry },
    maxAttempts: policy.maxAttempts,
    fallbackCapable: policy.fallbackCapable,
    dataCategories: [...policy.dataCategories],
    auditLevel: policy.auditLevel,
    retentionClass: policy.retentionClass,
    dryRunAvailable: policy.dryRunAvailable,
    compensationPossible: policy.compensationPossible,
    capturedAt: capturedAt.toISOString(),
  };

  const snapshotHash = createHash('sha256')
    .update(JSON.stringify(base))
    .digest('hex');

  return { ...base, snapshotHash };
}

export function parsePolicySnapshot(raw: unknown): WorkflowActionPolicySnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.snapshotHash !== 'string' || typeof record.actionType !== 'string') {
    return null;
  }
  return raw as WorkflowActionPolicySnapshot;
}
