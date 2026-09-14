import type { DeviceConnectionPhysicalEvidenceSource } from '@prisma/client';
import type {
  CurrentPhysicalStateProjection,
  PhysicalStateBindingScope,
} from './device-connection-physical-state.types';

export type PhysicalStatePreseedCandidateProvenance =
  | 'dimo_webhook_event'
  | 'vehicle_latest_state_obd';

export interface PhysicalStatePreseedScope {
  organizationId: string;
  vehicleId: string;
  provider: string;
  tokenId: number;
  deviceBindingId?: string | null;
}

export interface PhysicalStatePreseedCandidate {
  candidateState: 'PLUGGED' | 'UNPLUGGED';
  evidenceObservedAt: Date;
  evidenceSource: DeviceConnectionPhysicalEvidenceSource;
  evidenceReferenceId: string;
  bindingKey: string;
  provenance: PhysicalStatePreseedCandidateProvenance;
  sourceRecordId: string;
}

export type PhysicalStatePreseedDecision =
  | 'SKIP_EXISTING_PROJECTION'
  | 'INSUFFICIENT_EVIDENCE'
  | 'AMBIGUOUS_EQUAL_TIME_CONFLICT'
  | 'WOULD_ESTABLISH'
  | 'ESTABLISHED'
  | 'SKIPPED_ALREADY_ESTABLISHED'
  | 'UNEXPECTED_RECONCILE_DECISION';

export interface PhysicalStatePreseedWriteIntent {
  projection: boolean;
  transition: boolean;
  outbox: boolean;
  episode: boolean;
  alert: boolean;
  authorityMode: boolean;
  eventHistory: boolean;
}

export interface PhysicalStatePreseedPlan {
  scope: PhysicalStatePreseedScope;
  binding: PhysicalStateBindingScope;
  existingProjection: CurrentPhysicalStateProjection | null;
  candidates: PhysicalStatePreseedCandidate[];
  selectedCandidate: PhysicalStatePreseedCandidate | null;
  decision: PhysicalStatePreseedDecision;
  reason: string;
  wouldWrite: PhysicalStatePreseedWriteIntent;
  expectedReconcileDecision: 'ESTABLISHED' | null;
  evidenceObservedAt: string | null;
  bindingKey: string;
  evidenceReferenceId: string | null;
}

export interface PhysicalStatePreseedExecutionResult extends PhysicalStatePreseedPlan {
  dryRun: boolean;
  reconcileDecision: string | null;
  episodeAction: string | null;
  alertAction: string | null;
  projectionStateVersion: number | null;
}
