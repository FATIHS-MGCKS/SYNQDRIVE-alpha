import type {
  CommunicationActorType,
  CommunicationChannel,
  CommunicationConversationStatus,
  CommunicationDirection,
  CommunicationEventType,
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

export class CommunicationEventDto {
  id!: string;
  eventType!: CommunicationEventType;
  direction?: CommunicationDirection | null;
  actorType?: CommunicationActorType | null;
  occurredAt!: string;
  providerIdentity?: CommunicationProviderIdentity | null;
  metadata?: Record<string, string | number | boolean | null>;
}

export class CommunicationConversationSummaryDto {
  totalUnread!: number;
  unassigned!: number;
  requiresAttention!: number;
  byChannel!: Partial<Record<CommunicationChannel, number>>;
}

export class CommunicationConversationListResponseDto {
  items!: CommunicationConversationListItemDto[];
  nextCursor!: string | null;
  hasMore!: boolean;
}

export class CommunicationEventListResponseDto {
  items!: CommunicationEventDto[];
  nextCursor!: string | null;
  hasMore!: boolean;
}
