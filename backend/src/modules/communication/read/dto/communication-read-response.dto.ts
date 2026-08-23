import type {
  CommunicationActorType,
  CommunicationChannel,
  CommunicationConversationStatus,
  CommunicationDirection,
  CommunicationEventType,
  CommunicationMessageContentType,
  CommunicationProviderIdentity,
} from '@prisma/client';
import type {
  CommunicationAssignedAgentRefDto,
  CommunicationAssignedUserRefDto,
  CommunicationBookingRefDto,
  CommunicationCustomerRefDto,
  CommunicationStationRefDto,
  CommunicationVehicleRefDto,
} from './communication-read-shared.dto';

export class CommunicationConversationListItemDto {
  id!: string;
  channel!: CommunicationChannel;
  status!: CommunicationConversationStatus;
  unreadCount!: number;
  lastActivityAt!: string;
  displayLabel!: string;
  lastMessagePreview?: string | null;
  customer?: CommunicationCustomerRefDto | null;
  booking?: CommunicationBookingRefDto | null;
  vehicle?: CommunicationVehicleRefDto | null;
  station?: CommunicationStationRefDto | null;
  assignedUser?: CommunicationAssignedUserRefDto | null;
  assignedAgent?: CommunicationAssignedAgentRefDto | null;
}

export class CommunicationConversationDetailDto extends CommunicationConversationListItemDto {
  createdAt!: string;
  updatedAt!: string;
}

export class CommunicationAttachmentSummaryDto {
  id!: string;
  fileName!: string;
  mimeType!: string;
  sizeBytes!: number;
  mediaType!: 'IMAGE' | 'DOCUMENT';
}

export class CommunicationMessageContentDto {
  id!: string;
  contentType!: CommunicationMessageContentType;
  text?: string | null;
  truncated?: boolean;
  hasAttachments!: boolean;
  attachmentCount!: number;
  attachments?: CommunicationAttachmentSummaryDto[];
}

export class CommunicationEventDto {
  id!: string;
  eventType!: CommunicationEventType;
  direction?: CommunicationDirection | null;
  actorType?: CommunicationActorType | null;
  occurredAt!: string;
  providerIdentity?: CommunicationProviderIdentity | null;
  metadata?: Record<string, string | number | boolean | null>;
  content?: CommunicationMessageContentDto | null;
}

export class CommunicationConversationSummaryDto {
  /** Sum of per-conversation unreadCount across the filtered inbox set. */
  totalUnreadMessages!: number;
  /** Count of conversations with unreadCount > 0 in the filtered inbox set. */
  unreadConversations!: number;
  unassigned!: number;
  requiresAttention!: number;
  byChannel!: Partial<Record<CommunicationChannel, number>>;
}

export class CommunicationConversationListResponseDto {
  items!: CommunicationConversationListItemDto[];
  nextCursor!: string | null;
  hasMore!: boolean;
}

export class CommunicationAttentionPreviewResponseDto {
  items!: CommunicationConversationListItemDto[];
}

export class CommunicationEventListResponseDto {
  items!: CommunicationEventDto[];
  nextCursor!: string | null;
  hasMore!: boolean;
}
