import type { CommunicationChannel, CommunicationEventType, CommunicationProviderIdentity } from '@prisma/client';

export type CommunicationAiActivityType =
  | 'AI_INTENT'
  | 'AI_TOOL'
  | 'AI_FAILURE'
  | 'HANDOFF_REQUESTED'
  | 'HANDOFF_ACCEPTED'
  | 'AI_COMPLETED';

export type CommunicationAiToolOutcome = 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'UNKNOWN';

export interface CommunicationAiActivityAgentDto {
  id?: string | null;
  displayName?: string | null;
  kind: 'AI' | 'HUMAN' | 'SYSTEM';
}

export interface CommunicationAiActivityProviderDto {
  identity: CommunicationProviderIdentity;
  role?: string | null;
}

export interface CommunicationAiActivityToolDto {
  name: string;
  outcome: CommunicationAiToolOutcome;
}

export interface CommunicationAiActivityHandoffDto {
  requested: boolean;
  reason?: string | null;
  resolved: boolean;
  acceptedBy?: string | null;
}

export interface CommunicationAiActivityItemDto {
  id: string;
  conversationId: string;
  channel: CommunicationChannel;
  activityType: CommunicationAiActivityType;
  eventType: CommunicationEventType;
  occurredAt: string;
  summary: string;
  outcome?: string | null;
  contactDisplay: string;
  stationId?: string | null;
  conversationStatus: string;
  agent: CommunicationAiActivityAgentDto;
  provider?: CommunicationAiActivityProviderDto;
  tool?: CommunicationAiActivityToolDto;
  handoff?: CommunicationAiActivityHandoffDto;
}

export interface CommunicationAiActivityListResponseDto {
  items: CommunicationAiActivityItemDto[];
  nextCursor: string | null;
  hasMore: boolean;
}
