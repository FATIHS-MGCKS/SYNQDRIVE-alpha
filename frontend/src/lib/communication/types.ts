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
