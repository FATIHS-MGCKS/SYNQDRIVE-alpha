import type {
  CommunicationActorType,
  CommunicationChannel,
  CommunicationConversationStatus,
  CommunicationDirection,
  CommunicationEventType,
  CommunicationProviderIdentity,
} from '@prisma/client';
import type { CanonicalCommunicationMetadata } from './communication-metadata';

/**
 * Immutable canonical event facts for one projection operation.
 * Must not contain provider-native payloads or communication content.
 */
export interface NormalizedCommunicationEvent {
  eventType: CommunicationEventType;
  occurredAt: Date;
  direction?: CommunicationDirection | null;
  providerIdentity?: CommunicationProviderIdentity | null;
  providerEventId?: string | null;
  providerMessageId?: string | null;
  /** Required for projection — use buildCanonicalIdempotencyKey. */
  idempotencyKey: string;
  actorType?: CommunicationActorType | null;
  actorId?: string | null;
  metadata?: CanonicalCommunicationMetadata;
}

/** Tenant-scoped context IDs resolved upstream (C6); validated by C1 on write. */
export interface ConversationContextPatch {
  customerId?: string | null;
  bookingId?: string | null;
  vehicleId?: string | null;
  stationId?: string | null;
  assignedUserId?: string | null;
  assignedAgentRef?: string | null;
  assignedAgentType?: string | null;
}

/**
 * Mutable conversation projection changes accompanying an event.
 * Delta fields (unreadDelta) apply only when the event row is newly created.
 */
export interface ConversationProjectionPatch {
  status?: CommunicationConversationStatus;
  lastActivityAt?: Date;
  /** Increment applied only on newly-created events. */
  unreadDelta?: number;
  /** Convergent absolute unread value — safe on replay. */
  unreadCountAbsolute?: number;
  context?: ConversationContextPatch;
  metadata?: CanonicalCommunicationMetadata;
}

/** Native conversation envelope reference — see C2 architecture for per-channel mapping. */
export interface NormalizedCommunicationEnvelope {
  organizationId: string;
  channel: CommunicationChannel;
  nativeConversationId: string;
  initialStatus?: CommunicationConversationStatus;
  initialContext?: ConversationContextPatch;
}

/**
 * Provider-neutral input for one canonical projection operation.
 * Adapters produce this; CommunicationProjectionService consumes it.
 */
export interface NormalizedCommunicationInput {
  envelope: NormalizedCommunicationEnvelope;
  event: NormalizedCommunicationEvent;
  projection?: ConversationProjectionPatch;
  /**
   * When false, only validates the normalized contract without persisting.
   * Used for Email V1 deferral tests and future non-conversation events.
   */
  persist?: boolean;
}

export interface CommunicationProjectionResult {
  conversationId: string;
  eventId: string;
  conversationCreated: boolean;
  eventCreated: boolean;
}
