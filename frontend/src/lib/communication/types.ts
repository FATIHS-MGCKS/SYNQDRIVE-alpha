/** Canonical Communication read API types (C7/C7.2). */

export type CommunicationApiChannel = 'WHATSAPP' | 'VOICE' | 'SMS';

export type CommunicationApiStatus =
  | 'AI_ACTIVE'
  | 'WAITING_CUSTOMER'
  | 'HUMAN_REQUIRED'
  | 'HUMAN_ACTIVE'
  | 'RESOLVED'
  | 'FAILED';

export interface CommunicationCustomerRef {
  id: string;
  displayName: string;
}

export interface CommunicationBookingRef {
  id: string;
  reference: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

export interface CommunicationVehicleRef {
  id: string;
  displayLabel: string;
}

export interface CommunicationStationRef {
  id: string;
  name: string;
}

export interface CommunicationAssignedUserRef {
  id: string;
  displayName: string;
}

export interface CommunicationAssignedAgentRef {
  ref: string;
  type?: string | null;
}

export interface CommunicationConversationListItem {
  id: string;
  channel: CommunicationApiChannel;
  status: CommunicationApiStatus;
  unreadCount: number;
  lastActivityAt: string;
  displayLabel: string;
  lastMessagePreview?: string | null;
  customer?: CommunicationCustomerRef | null;
  booking?: CommunicationBookingRef | null;
  vehicle?: CommunicationVehicleRef | null;
  station?: CommunicationStationRef | null;
  assignedUser?: CommunicationAssignedUserRef | null;
  assignedAgent?: CommunicationAssignedAgentRef | null;
}

export interface CommunicationConversationListResponse {
  items: CommunicationConversationListItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CommunicationAttentionPreviewResponse {
  items: CommunicationConversationListItem[];
}

export interface CommunicationConversationSummary {
  totalUnreadMessages: number;
  unreadConversations: number;
  unassigned: number;
  requiresAttention: number;
  byChannel: Partial<Record<CommunicationApiChannel, number>>;
}

export interface CommunicationConversationListQuery {
  channel?: CommunicationApiChannel | CommunicationApiChannel[];
  status?: CommunicationApiStatus | CommunicationApiStatus[];
  unreadOnly?: boolean;
  unassigned?: boolean;
  search?: string;
  cursor?: string;
  limit?: number;
}

export type CommunicationApiDirection = 'INBOUND' | 'OUTBOUND' | 'INTERNAL';

export type CommunicationApiEventType =
  | 'MESSAGE_RECEIVED'
  | 'MESSAGE_SENT'
  | 'MESSAGE_DELIVERED'
  | 'MESSAGE_READ'
  | 'MESSAGE_FAILED'
  | 'CALL_STARTED'
  | 'CALL_CONNECTED'
  | 'CALL_ENDED'
  | 'CALL_FAILED'
  | 'AI_INTENT_DETECTED'
  | 'AI_ACTION_STARTED'
  | 'AI_ACTION_COMPLETED'
  | 'AI_ACTION_FAILED'
  | 'HUMAN_REQUIRED'
  | 'HUMAN_ASSIGNED'
  | 'HUMAN_TAKEOVER'
  | 'CONVERSATION_RESOLVED'
  | 'CONVERSATION_REOPENED'
  | 'PROVIDER_ERROR';

export type CommunicationApiMessageContentType =
  | 'TEXT'
  | 'IMAGE'
  | 'VIDEO'
  | 'AUDIO'
  | 'DOCUMENT'
  | 'LOCATION'
  | 'CONTACT'
  | 'MIXED'
  | 'UNSUPPORTED';

export interface CommunicationConversationDetail extends CommunicationConversationListItem {
  createdAt: string;
  updatedAt: string;
}

export interface CommunicationMutationResponse {
  conversation: CommunicationConversationDetail;
}

export interface CommunicationMessageContent {
  id: string;
  contentType: CommunicationApiMessageContentType;
  text?: string | null;
  truncated?: boolean;
  hasAttachments: boolean;
  attachmentCount: number;
}

export interface CommunicationEvent {
  id: string;
  eventType: CommunicationApiEventType;
  direction?: CommunicationApiDirection | null;
  actorType?: string | null;
  occurredAt: string;
  metadata?: Record<string, string | number | boolean | null>;
  content?: CommunicationMessageContent | null;
}

export interface CommunicationEventListResponse {
  items: CommunicationEvent[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CommunicationEventListQuery {
  cursor?: string;
  limit?: number;
}
