import type { DeviceConnectionPhysicalTransitionDecision, DimoDeviceConnectionEventType } from '@prisma/client';
import type { EffectivePhysicalStateRuntimePolicy } from './physical-state-authority.types';
import type { PhysicalStateCoordinatorResult } from './device-connection-physical-state.types';
import type { PhysicalStateShadowComparisonResult } from './physical-state-shadow-comparator.types';

export type LegacyWebhookGateResult = {
  accepted: boolean;
  reason?: string | null;
};

export type LegacySnapshotGateResult = {
  accepted: boolean;
  reason?: string | null;
};

export type PhysicalEvidenceWriterResult = {
  enabled: boolean;
  policy: EffectivePhysicalStateRuntimePolicy | null;
  coordinatorResult: PhysicalStateCoordinatorResult | null;
  shadowComparison: PhysicalStateShadowComparisonResult | null;
  legacyGate: LegacyWebhookGateResult | LegacySnapshotGateResult | null;
  physicalAccepted: boolean;
  physicalDecision: DeviceConnectionPhysicalTransitionDecision | 'DISABLED' | null;
  skippedReason?: string;
};

export type WebhookEvidenceWriterInput = {
  organizationId: string;
  vehicleId: string;
  provider: string;
  tokenId: number;
  deviceBindingId?: string | null;
  pluggedIn: boolean;
  observedAt: Date;
  receivedAt?: Date;
  rawPayload: unknown;
  evidenceReferenceId: string;
  inboxId?: string;
  legacyGate: LegacyWebhookGateResult;
  provenExpectedFix?: boolean;
};

export type SnapshotEvidenceWriterInput = {
  organizationId: string;
  vehicleId: string;
  tokenId: number;
  deviceBindingId?: string | null;
  signals: Record<string, unknown>;
  evidenceReferenceId: string;
  legacyGate: LegacySnapshotGateResult;
  provenExpectedFix?: boolean;
  projectionSelfHeal?: boolean;
};

export type WebhookEventUpsertPayload = {
  organizationId: string;
  vehicleId: string;
  tokenId: number;
  provider: string;
  eventType: DimoDeviceConnectionEventType;
  observedAt: Date;
  receivedAt?: Date;
  rawPayloadJson: unknown;
};
