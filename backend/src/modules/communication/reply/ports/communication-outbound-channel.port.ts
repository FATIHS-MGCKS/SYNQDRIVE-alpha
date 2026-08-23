import type { CommunicationChannel, CommunicationReplySendState } from '@prisma/client';
import type { CommunicationConversationListRow } from '../../read/communication-read.mapper';

export interface CommunicationOutboundSendInput {
  organizationId: string;
  conversation: CommunicationConversationListRow;
  nativeConversationId: string;
  actorUserId: string;
  actorDisplayName?: string | null;
  text: string;
  contentType: import('@prisma/client').CommunicationReplyContentType;
  attachmentId?: string | null;
  templateId?: string | null;
  templateVariables?: Record<string, string>;
  clientIdempotencyKey: string;
  commandId: string;
}

export interface CommunicationOutboundSendResult {
  sendState: CommunicationReplySendState;
  nativeMessageId?: string | null;
  canonicalEventId?: string | null;
  failureCode?: string | null;
}

export interface CommunicationOutboundChannelPort {
  readonly channel: CommunicationChannel;
  sendTextReply(input: CommunicationOutboundSendInput): Promise<CommunicationOutboundSendResult>;
  sendMediaReply(input: CommunicationOutboundSendInput): Promise<CommunicationOutboundSendResult>;
  sendTemplateReply(input: CommunicationOutboundSendInput): Promise<CommunicationOutboundSendResult>;
}
