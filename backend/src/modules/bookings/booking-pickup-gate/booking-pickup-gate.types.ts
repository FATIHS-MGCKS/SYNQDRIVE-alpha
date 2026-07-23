import type { PickupGateCode } from './booking-pickup-gate.constants';

export interface HandoverActorContext {
  userId: string;
  displayName: string | null;
  platformRole?: string | null;
  membershipRole?: string | null;
}

export interface PickupGateHandoverPayloadSlice {
  documentsAcknowledged?: boolean;
  customerSignatureName?: string | null;
  customerSignatureDataUrl?: string | null;
  performedByUserId?: string | null;
  performedByName?: string | null;
}

export interface PickupGateRequirement {
  code: PickupGateCode;
  message: string;
  overridable: boolean;
  documentType?: string;
}

export interface PickupGateEvaluation {
  allowed: boolean;
  overrideUsed: boolean;
  requirements: PickupGateRequirement[];
  hardBlocks: PickupGateRequirement[];
  softBlocks: PickupGateRequirement[];
}

export interface AssertPickupGateInput {
  organizationId: string;
  bookingId: string;
  actor: HandoverActorContext;
  payload: PickupGateHandoverPayloadSlice;
  overrideReason?: string | null;
  correlationId?: string | null;
  /** Pre-evaluated `booking.override` permission from controller. */
  hasOverridePermission?: boolean;
}

export interface AppendPickupGateAuditInput {
  organizationId: string;
  bookingId: string;
  eventType: string;
  outcome: string;
  actor: HandoverActorContext;
  overrideReason?: string | null;
  gateCode?: string | null;
  missingRequirements?: PickupGateRequirement[];
  correlationId?: string | null;
}
