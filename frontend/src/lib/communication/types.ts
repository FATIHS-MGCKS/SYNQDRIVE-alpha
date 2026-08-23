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
  intent?: string;
  callDirection?: 'INBOUND' | 'OUTBOUND';
  callOutcome?: 'PENDING' | 'RESOLVED' | 'ESCALATED' | 'FAILED' | 'ABANDONED';
  callHasTranscript?: boolean;
  callEscalatedOnly?: boolean;
  dateFrom?: string;
  dateTo?: string;
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

export type CommunicationReplySendState = 'ACCEPTED' | 'PENDING' | 'FAILED' | 'UNKNOWN';

export interface CommunicationReplyResponse {
  conversation: CommunicationConversationDetail;
  sendState: CommunicationReplySendState;
  event?: CommunicationEvent | null;
  commandId: string;
}

export type CommunicationReplyContentType = 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'TEMPLATE';

export interface CommunicationAttachmentDto {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  mediaType: 'IMAGE' | 'DOCUMENT';
  state: 'UPLOADING' | 'READY' | 'FAILED';
}

export interface CommunicationAttachmentSummary {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  mediaType: 'IMAGE' | 'DOCUMENT';
}

export interface CommunicationMessageContent {
  id: string;
  contentType: CommunicationApiMessageContentType;
  text?: string | null;
  truncated?: boolean;
  hasAttachments: boolean;
  attachmentCount: number;
  attachments?: CommunicationAttachmentSummary[];
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

export type CommunicationAiActivityType =
  | 'AI_INTENT'
  | 'AI_TOOL'
  | 'AI_FAILURE'
  | 'HANDOFF_REQUESTED'
  | 'HANDOFF_ACCEPTED'
  | 'AI_COMPLETED';

export interface CommunicationAiActivityHandoff {
  requested: boolean;
  reason?: string | null;
  resolved: boolean;
  acceptedBy?: string | null;
}

export interface CommunicationAiActivityTool {
  name: string;
  outcome: 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'UNKNOWN';
}

export interface CommunicationAiActivityItem {
  id: string;
  conversationId: string;
  channel: CommunicationApiChannel;
  activityType: CommunicationAiActivityType;
  eventType: string;
  occurredAt: string;
  summary: string;
  outcome?: string | null;
  contactDisplay: string;
  stationId?: string | null;
  conversationStatus: string;
  agent: {
    id?: string | null;
    displayName?: string | null;
    kind: 'AI' | 'HUMAN' | 'SYSTEM';
  };
  tool?: CommunicationAiActivityTool;
  handoff?: CommunicationAiActivityHandoff;
}

export interface CommunicationAiActivityListResponse {
  items: CommunicationAiActivityItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export type CommunicationQuickActionResultType =
  | 'COMPOSER_PREFILL'
  | 'TEMPLATE_PREFILL'
  | 'BUSINESS_MUTATION'
  | 'CONVERSATION_MUTATION'
  | 'HANDOFF';

export interface CommunicationQuickActionAvailability {
  id: import('../api').WhatsAppQuickActionId;
  labelKey: string;
  confirmKey?: string;
  enabled: boolean;
  disabledReasonKey?: string;
  requiresConfirmation?: boolean;
  resultMode: CommunicationQuickActionResultType;
}

export interface CommunicationQuickActionListResponse {
  actions: CommunicationQuickActionAvailability[];
}

export interface CommunicationQuickActionResult {
  actionType: CommunicationQuickActionResultType;
  actionId: import('../api').WhatsAppQuickActionId;
  text?: string;
  template?: {
    templateId: string;
    language: string;
    templateVariables: Record<string, string>;
    previewText?: string;
  };
  conversation?: CommunicationConversationDetail;
  taskId?: string;
  vehicleId?: string;
  changed?: boolean;
}

export interface CommunicationAiActivityListQuery {
  channel?: CommunicationApiChannel;
  category?: 'all' | 'handoffs' | 'tools' | 'errors';
  conversationId?: string;
  stationId?: string;
  dateFrom?: string;
  dateTo?: string;
  cursor?: string;
  limit?: number;
}

export type CommunicationVoiceTranscriptSpeaker =
  | 'CUSTOMER'
  | 'AI_AGENT'
  | 'HUMAN_OPERATOR'
  | 'UNKNOWN';

export interface CommunicationVoiceTranscriptSegment {
  id: string;
  speaker: CommunicationVoiceTranscriptSpeaker;
  text: string;
  occurredAt?: string;
}

export interface CommunicationVoiceCallDetail {
  callId: string;
  conversationId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  status: 'ACTIVE' | 'COMPLETED' | 'FAILED';
  outcome: 'PENDING' | 'RESOLVED' | 'ESCALATED' | 'FAILED' | 'ABANDONED';
  startedAt: string;
  endedAt?: string | null;
  durationSeconds?: number | null;
  summary?: string | null;
  summaryAvailable: boolean;
  escalationReason?: string | null;
  escalated: boolean;
  hasTranscript: boolean;
  transcriptAvailability: 'AVAILABLE' | 'TRANSCRIPT_UNAVAILABLE';
  errorMessage?: string | null;
  maskedCallerNumber?: string | null;
  linkedTaskId?: string | null;
}

export interface CommunicationVoiceCallTranscript {
  callId: string;
  availability: 'AVAILABLE' | 'TRANSCRIPT_UNAVAILABLE';
  segments: CommunicationVoiceTranscriptSegment[];
}

export interface CommunicationVoiceCreateTaskResult {
  taskId: string;
  deduped: boolean;
}
