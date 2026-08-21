import type {
  CommunicationActorType,
  CommunicationChannel,
  CommunicationConversationStatus,
  CommunicationDirection,
  CommunicationEventType,
  CommunicationProviderIdentity,
  Prisma,
} from '@prisma/client';

export type CommunicationTx = Prisma.TransactionClient;

export interface CreateCommunicationConversationInput {
  organizationId: string;
  channel: CommunicationChannel;
  nativeConversationId: string;
  status?: CommunicationConversationStatus;
  customerId?: string | null;
  bookingId?: string | null;
  vehicleId?: string | null;
  stationId?: string | null;
  assignedUserId?: string | null;
  assignedAgentRef?: string | null;
  assignedAgentType?: string | null;
  lastActivityAt?: Date;
  unreadCount?: number;
  metadata?: Prisma.InputJsonValue;
}

export interface EnsureCommunicationConversationInput
  extends CreateCommunicationConversationInput {}

export interface UpdateCommunicationConversationProjectionInput {
  status?: CommunicationConversationStatus;
  customerId?: string | null;
  bookingId?: string | null;
  vehicleId?: string | null;
  stationId?: string | null;
  assignedUserId?: string | null;
  assignedAgentRef?: string | null;
  assignedAgentType?: string | null;
  lastActivityAt?: Date;
  unreadCount?: number;
  metadata?: Prisma.InputJsonValue;
}

export interface AppendCommunicationEventInput {
  organizationId: string;
  conversationId: string;
  channel: CommunicationChannel;
  eventType: CommunicationEventType;
  occurredAt: Date;
  direction?: CommunicationDirection | null;
  providerIdentity?: CommunicationProviderIdentity | null;
  providerEventId?: string | null;
  providerMessageId?: string | null;
  idempotencyKey?: string | null;
  actorType?: CommunicationActorType | null;
  actorId?: string | null;
  customerId?: string | null;
  bookingId?: string | null;
  vehicleId?: string | null;
  metadata?: Prisma.InputJsonValue;
  redactedPayloadRef?: string | null;
}
