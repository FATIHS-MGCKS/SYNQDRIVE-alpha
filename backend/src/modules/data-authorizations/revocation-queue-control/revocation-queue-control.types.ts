import type { RevocationCheckpoint, RevocationCheckpointReason } from './revocation-queue-control.constants';

export interface RevocationQueueControlContext {
  workflowId: string;
  organizationId: string;
  correlationId: string;
  processingActivityId?: string | null;
  enforcementPolicyId?: string | null;
  vehicleIds?: string[];
}

export interface RevocationQueueControlResult {
  removed: number;
  suppressed: number;
  checkpointRequired: number;
  alreadyRemoved: number;
  enqueueBlocked: number;
  byQueue: Record<string, { removed: number; checkpointRequired: number }>;
}

export interface WorkerRevocationCheckpointInput {
  organizationId: string;
  vehicleId?: string | null;
  processingActivityId?: string | null;
  enforcementPolicyId?: string | null;
  consentId?: string | null;
  checkpoint: RevocationCheckpoint;
  correlationId?: string;
}

export interface WorkerRevocationCheckpointResult {
  allowed: boolean;
  reasonCode?: RevocationCheckpointReason;
  checkpoint: RevocationCheckpoint;
}

export interface WorkerRuntimeHealthSnapshot {
  policyEngineVersion: string;
  workerReportedVersion: string | null;
  workersEnabled: boolean;
  denySwitchReady: boolean;
  compliant: boolean;
  checkedAt: string;
}
