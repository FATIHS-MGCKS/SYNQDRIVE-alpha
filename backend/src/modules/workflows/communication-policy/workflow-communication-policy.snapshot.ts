import { createHash } from 'crypto';
import type {
  WorkflowCommunicationPolicySnapshot,
  WorkflowCommunicationPolicyEvaluateInput,
} from './workflow-communication-policy.types';
import { WORKFLOW_COMMUNICATION_POLICY_VERSION } from './workflow-communication-policy.config';

export function buildCommunicationPolicySnapshot(
  input: WorkflowCommunicationPolicyEvaluateInput,
  checksApplied: readonly string[],
  capturedAt: Date = new Date(),
): WorkflowCommunicationPolicySnapshot {
  const base = {
    policyVersion: WORKFLOW_COMMUNICATION_POLICY_VERSION,
    organizationId: input.organizationId,
    channel: input.channel,
    processingPurpose: input.processingPurpose,
    recipientType: input.recipientType,
    legalBasisRef: input.legalBasisRef?.trim() || null,
    retentionClass: input.retentionClass ?? 'STANDARD',
    phase: input.phase,
    checksApplied: [...checksApplied],
    capturedAt: capturedAt.toISOString(),
  };

  const snapshotHash = createHash('sha256').update(JSON.stringify(base)).digest('hex');
  return { ...base, snapshotHash };
}

export function snapshotsCompatible(
  frozen: WorkflowCommunicationPolicySnapshot | null | undefined,
  current: WorkflowCommunicationPolicySnapshot,
): boolean {
  if (!frozen) return true;
  return (
    frozen.policyVersion === current.policyVersion
    && frozen.channel === current.channel
    && frozen.processingPurpose === current.processingPurpose
    && frozen.legalBasisRef === current.legalBasisRef
    && frozen.retentionClass === current.retentionClass
  );
}
