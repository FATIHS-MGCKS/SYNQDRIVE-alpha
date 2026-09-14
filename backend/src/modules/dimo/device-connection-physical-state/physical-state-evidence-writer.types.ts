import type { DeviceConnectionPhysicalTransitionDecision, DimoDeviceConnectionEventType } from '@prisma/client';
import type { EffectivePhysicalStateRuntimePolicy } from './physical-state-authority.types';
import type { PhysicalStateCoordinatorResult } from './device-connection-physical-state.types';
import type { GtR1ExpectedFixProof } from './physical-state-gt-r1-proof';
import type { LegacyShadowDecision } from './physical-state-legacy-shadow-decision';
import type { PhysicalStateShadowComparisonResult } from './physical-state-shadow-comparator.types';

export type PhysicalEvidenceWriterResult = {
  enabled: boolean;
  policy: EffectivePhysicalStateRuntimePolicy | null;
  coordinatorResult: PhysicalStateCoordinatorResult | null;
  shadowComparison: PhysicalStateShadowComparisonResult | null;
  legacyShadow: LegacyShadowDecision | null;
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
  legacyShadow: LegacyShadowDecision;
  gtR1Proof?: GtR1ExpectedFixProof | null;
};

export type SnapshotEvidenceWriterInput = {
  organizationId: string;
  vehicleId: string;
  tokenId: number;
  deviceBindingId?: string | null;
  signals: Record<string, unknown>;
  evidenceReferenceId: string;
  legacyShadow: LegacyShadowDecision;
  gtR1Proof?: GtR1ExpectedFixProof | null;
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
