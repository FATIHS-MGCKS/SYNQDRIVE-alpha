import type {
  CommunicationChannel,
  CommunicationDirection,
  CommunicationEventType,
  CommunicationMessageContentType,
  CommunicationProviderIdentity,
} from '@prisma/client';

export interface ProjectMessageContentInput {
  organizationId: string;
  conversationId: string;
  communicationEventId: string;
  channel: CommunicationChannel;
  direction: CommunicationDirection;
  eventType: CommunicationEventType;
  contentType: CommunicationMessageContentType;
  text?: string | null;
  nativeMessageId: string;
  providerMessageId?: string | null;
  providerIdentity?: CommunicationProviderIdentity | null;
  occurredAt: Date;
  hasAttachments?: boolean;
  attachmentCount?: number;
}

export interface ContentProjectionResult {
  contentId: string;
  created: boolean;
  skipped: boolean;
}

export interface CommunicationContentBackfillResult {
  scanned: number;
  eligible: number;
  wouldCreate: number;
  alreadyProjected: number;
  unresolved: number;
  ambiguous: number;
  missingCanonicalConversation: number;
  missingCanonicalEvent: number;
  failed: number;
  applied: number;
}
