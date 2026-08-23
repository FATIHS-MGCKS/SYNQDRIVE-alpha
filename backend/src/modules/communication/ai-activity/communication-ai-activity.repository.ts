import { Injectable } from '@nestjs/common';
import {
  CommunicationChannel,
  CommunicationEventType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  HANDOFF_RESOLUTION_EVENT_TYPES,
  buildHandoffResolutionMap,
} from './communication-ai-activity-handoff-resolution.util';
import {
  resolveCommunicationListLimit,
  type CommunicationCursorPageResult,
} from '../read/communication-read.cursor.util';
import { CONVERSATION_LIST_SELECT } from '../read/communication-read.mapper';
import {
  COMMUNICATION_AI_ACTIVITY_DEFAULT_LIMIT,
  COMMUNICATION_AI_ACTIVITY_EVENT_TYPES,
  COMMUNICATION_AI_ACTIVITY_MAX_LIMIT,
  type CommunicationAiActivityFilterCategory,
} from './communication-ai-activity.constants';
import type { CommunicationAiActivityEventRow } from './communication-ai-activity.mapper';
import {
  buildCommunicationAiActivityCursorWhere,
  decodeCommunicationAiActivityCursor,
  encodeCommunicationAiActivityCursorFromRow,
} from './communication-ai-activity.cursor.util';
import type { CommunicationAiActivityListQueryDto } from './dto/communication-ai-activity-query.dto';

const HANDOFF_EVENT_TYPES: CommunicationEventType[] = [
  CommunicationEventType.HUMAN_REQUIRED,
  CommunicationEventType.HUMAN_ASSIGNED,
  CommunicationEventType.HUMAN_TAKEOVER,
];

const TOOL_EVENT_TYPES: CommunicationEventType[] = [
  CommunicationEventType.AI_ACTION_STARTED,
  CommunicationEventType.AI_ACTION_COMPLETED,
];

const ERROR_EVENT_TYPES: CommunicationEventType[] = [
  CommunicationEventType.AI_ACTION_FAILED,
];

@Injectable()
export class CommunicationAiActivityRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listAiActivity(
    organizationId: string,
    query: CommunicationAiActivityListQueryDto,
    stationScope?: Prisma.CommunicationConversationWhereInput,
  ): Promise<CommunicationCursorPageResult<CommunicationAiActivityEventRow>> {
    const limit = resolveCommunicationListLimit(query.limit, {
      defaultLimit: COMMUNICATION_AI_ACTIVITY_DEFAULT_LIMIT,
      maxLimit: COMMUNICATION_AI_ACTIVITY_MAX_LIMIT,
    });

    const cursorWhere = query.cursor
      ? buildCommunicationAiActivityCursorWhere(decodeCommunicationAiActivityCursor(query.cursor))
      : undefined;

    const eventTypes = this.resolveEventTypes(query.category);
    const where: Prisma.CommunicationEventWhereInput = {
      organizationId,
      eventType: { in: eventTypes },
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.conversationId ? { conversationId: query.conversationId } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            occurredAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
      ...(cursorWhere ?? {}),
      conversation: {
        organizationId,
        ...(query.stationId ? { stationId: query.stationId } : {}),
        ...(stationScope ?? {}),
      },
    };

    const rows = await this.prisma.communicationEvent.findMany({
      where,
      select: {
        id: true,
        eventType: true,
        occurredAt: true,
        providerIdentity: true,
        metadata: true,
        conversation: {
          select: CONVERSATION_LIST_SELECT,
        },
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore
      ? encodeCommunicationAiActivityCursorFromRow(page[page.length - 1]!)
      : null;

    return {
      items: page as CommunicationAiActivityEventRow[],
      meta: { limit, nextCursor, hasMore },
    };
  }

  async loadHandoffResolutionMap(
    organizationId: string,
    handoffRequests: Array<{ id: string; conversationId: string; occurredAt: Date }>,
  ): Promise<Map<string, boolean>> {
    if (handoffRequests.length === 0) {
      return new Map();
    }

    const conversationIds = [...new Set(handoffRequests.map((row) => row.conversationId))];
    const minOccurredAt = handoffRequests.reduce(
      (min, row) => (row.occurredAt < min ? row.occurredAt : min),
      handoffRequests[0]!.occurredAt,
    );

    const resolutionEvents = await this.prisma.communicationEvent.findMany({
      where: {
        organizationId,
        conversationId: { in: conversationIds },
        eventType: { in: HANDOFF_RESOLUTION_EVENT_TYPES },
        occurredAt: { gte: minOccurredAt },
      },
      select: {
        id: true,
        conversationId: true,
        occurredAt: true,
      },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });

    return buildHandoffResolutionMap(handoffRequests, resolutionEvents);
  }

  private resolveEventTypes(
    category?: CommunicationAiActivityFilterCategory,
  ): CommunicationEventType[] {
    switch (category) {
      case 'handoffs':
        return HANDOFF_EVENT_TYPES;
      case 'tools':
        return TOOL_EVENT_TYPES;
      case 'errors':
        return ERROR_EVENT_TYPES;
      default:
        return COMMUNICATION_AI_ACTIVITY_EVENT_TYPES;
    }
  }
}
