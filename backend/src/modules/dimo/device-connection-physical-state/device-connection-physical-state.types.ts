import {
  DeviceConnectionPhysicalEffectiveState,
  DeviceConnectionPhysicalEvidenceSource,
  DeviceConnectionPhysicalTransitionDecision,
  DimoDeviceConnectionEventType,
  Prisma,
} from '@prisma/client';

export type PhysicalEffectiveState = DeviceConnectionPhysicalEffectiveState;
export type PhysicalEvidenceSource = DeviceConnectionPhysicalEvidenceSource;
export type PhysicalTransitionDecision = DeviceConnectionPhysicalTransitionDecision;

export const PhysicalEffectiveStateValues = DeviceConnectionPhysicalEffectiveState;
export const PhysicalEvidenceSourceValues = DeviceConnectionPhysicalEvidenceSource;
export const PhysicalTransitionDecisionValues = DeviceConnectionPhysicalTransitionDecision;

export interface PhysicalStateBindingScope {
  provider: string;
  deviceBindingId: string | null;
  providerDeviceIdHash: string;
  bindingKey: string;
}

export interface IncomingPhysicalStateEvidence {
  candidateState: PhysicalEffectiveState;
  evidenceObservedAt: Date;
  evidenceSource: PhysicalEvidenceSource;
  evidenceReferenceId: string;
}

export interface CurrentPhysicalStateProjection {
  effectiveState: PhysicalEffectiveState;
  evidenceObservedAt: Date;
  evidenceSource: PhysicalEvidenceSource;
  evidenceReferenceId: string;
  stateVersion: number;
}

export interface PhysicalStateReconcileScope {
  organizationId: string;
  vehicleId: string;
  tokenId?: number;
  binding: PhysicalStateBindingScope;
}

export interface PhysicalStateReconcileInput extends PhysicalStateReconcileScope {
  evidence: IncomingPhysicalStateEvidence;
  receivedAt?: Date;
  /** When true, APPLIED PLUG transitions do not emit lifecycle side-effect intents. */
  selfHeal?: boolean;
  /** Canonical webhook event id when evidence source is WEBHOOK (Phase 2 outbox). */
  canonicalEventId?: string | null;
}

export type PhysicalStateEpisodeAction =
  | 'none'
  | 'open_unplug'
  | 'resolve_plug'
  | 'already_open'
  | 'already_resolved';

export type PhysicalStateAlertAction = 'none' | 'emit_unplug' | 'resolve_unplug';

/**
 * Reconciliation decision audit context — distinct from projection-only fields.
 * Transition log stores all decisions (DUPLICATE/STALE/CONFLICT/APPLIED/…).
 */
export interface PhysicalStateReconcileContext {
  previousState: PhysicalEffectiveState | null;
  candidateState: PhysicalEffectiveState;
  resultingState: PhysicalEffectiveState | null;
  previousEvidenceAt: Date | null;
  candidateEvidenceAt: Date;
  incomingEvidenceSource: PhysicalEvidenceSource;
  stateVersionBefore: number | null;
  stateVersionAfter: number | null;
  selfHeal: boolean;
  evidenceReferenceId: string;
}

export interface PhysicalStateReconcileResult {
  enabled: boolean;
  decision: PhysicalTransitionDecision | 'DISABLED';
  projection: CurrentPhysicalStateProjection | null;
  transitionId: string | null;
  episodeAction: PhysicalStateEpisodeAction;
  alertAction: PhysicalStateAlertAction;
  context: PhysicalStateReconcileContext;
  reason?: string;
}

export interface PhysicalStateWebhookEventUpsertInput {
  organizationId: string;
  vehicleId: string;
  tokenId: number;
  provider: string;
  eventType: DimoDeviceConnectionEventType;
  observedAt: Date;
  receivedAt?: Date;
  rawPayloadJson: Prisma.InputJsonValue;
}

export interface PhysicalStateCoordinatorInput {
  reconcile: PhysicalStateReconcileInput;
  webhookEventUpsert?: PhysicalStateWebhookEventUpsertInput | null;
}

export interface PhysicalStateCoordinatorResult {
  reconcile: PhysicalStateReconcileResult;
  canonicalEventId: string | null;
  outboxId: string | null;
  outboxDuplicate: boolean;
}

export type PhysicalStateCoordinatorTestSeam = {
  afterReconcile?: () => Promise<void> | void;
  afterWebhookEventUpsert?: () => Promise<void> | void;
  afterOutboxEnqueue?: () => Promise<void> | void;
};

export interface PhysicalStateTransitionLogInput {
  organizationId: string;
  vehicleId: string;
  provider: string;
  bindingKey: string;
  previousState: PhysicalEffectiveState | null;
  effectiveState: PhysicalEffectiveState | null;
  evidence: IncomingPhysicalStateEvidence;
  parentStateVersion: number | null;
  appliedStateVersion: number | null;
  decision: PhysicalTransitionDecision;
  metadataJson?: Record<string, unknown>;
}
