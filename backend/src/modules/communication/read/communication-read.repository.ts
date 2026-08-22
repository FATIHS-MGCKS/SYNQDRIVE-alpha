import { Injectable } from '@nestjs/common';
import {
  CommunicationChannel,
  CommunicationConversationStatus,
  CommunicationProviderIdentity,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildCommunicationInboxCursorWhere,
  buildCommunicationTimelineCursorWhere,
  COMMUNICATION_INBOX_DEFAULT_LIMIT,
  COMMUNICATION_INBOX_MAX_LIMIT,
  COMMUNICATION_TIMELINE_DEFAULT_LIMIT,
  COMMUNICATION_TIMELINE_MAX_LIMIT,
  decodeCommunicationInboxCursor,
  decodeCommunicationTimelineCursor,
  encodeCommunicationInboxCursorFromRow,
  encodeCommunicationTimelineCursorFromRow,
  resolveCommunicationListLimit,
  type CommunicationCursorPageResult,
} from './communication-read.cursor.util';
import {
  COMMUNICATION_EVENT_SELECT,
  CONVERSATION_LIST_SELECT,
  type CommunicationConversationListRow,
  type CommunicationEventRow,
} from './communication-read.mapper';
import type { CommunicationConversationListQueryDto } from './dto/communication-read-shared.dto';

export interface CommunicationConversationSummaryCounts {
  totalUnread: number;
  unassigned: number;
  requiresAttention: number;
  byChannel: Partial<Record<CommunicationChannel, number>>;
}

@Injectable()
export class CommunicationReadRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listConversations(
    organizationId: string,
    query: CommunicationConversationListQueryDto,
  ): Promise<CommunicationCursorPageResult<CommunicationConversationListRow>> {
    const limit = resolveCommunicationListLimit(query.limit, {
      defaultLimit: COMMUNICATION_INBOX_DEFAULT_LIMIT,
      maxLimit: COMMUNICATION_INBOX_MAX_LIMIT,
    });
    const cursorWhere = query.cursor
      ? buildCommunicationInboxCursorWhere(decodeCommunicationInboxCursor(query.cursor))
      : undefined;

    const where = this.buildConversationListWhere(organizationId, query, cursorWhere);

    const rows = await this.prisma.communicationConversation.findMany({
      where,
      select: CONVERSATION_LIST_SELECT,
      orderBy: [{ lastActivityAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore
      ? encodeCommunicationInboxCursorFromRow(page[page.length - 1]!)
      : null;

    return {
      items: page,
      meta: { limit, nextCursor, hasMore },
    };
  }

  async findConversationById(
    organizationId: string,
    conversationId: string,
  ): Promise<CommunicationConversationListRow | null> {
    return this.prisma.communicationConversation.findFirst({
      where: { id: conversationId, organizationId },
      select: CONVERSATION_LIST_SELECT,
    });
  }

  async listConversationEvents(
    organizationId: string,
    conversationId: string,
    query: { cursor?: string; limit?: number },
  ): Promise<CommunicationCursorPageResult<CommunicationEventRow>> {
    const limit = resolveCommunicationListLimit(query.limit, {
      defaultLimit: COMMUNICATION_TIMELINE_DEFAULT_LIMIT,
      maxLimit: COMMUNICATION_TIMELINE_MAX_LIMIT,
    });
    const cursorWhere = query.cursor
      ? buildCommunicationTimelineCursorWhere(decodeCommunicationTimelineCursor(query.cursor))
      : undefined;

    const where: Prisma.CommunicationEventWhereInput = {
      organizationId,
      conversationId,
      ...(cursorWhere ?? {}),
    };

    const rows = await this.prisma.communicationEvent.findMany({
      where,
      select: COMMUNICATION_EVENT_SELECT,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore
      ? encodeCommunicationTimelineCursorFromRow(page[page.length - 1]!)
      : null;

    return {
      items: page,
      meta: { limit, nextCursor, hasMore },
    };
  }

  async summarizeConversations(
    organizationId: string,
    query: Pick<
      CommunicationConversationListQueryDto,
      | 'channel'
      | 'status'
      | 'customerId'
      | 'bookingId'
      | 'vehicleId'
      | 'stationId'
      | 'assignedUserId'
      | 'unassigned'
      | 'providerIdentity'
      | 'dateFrom'
      | 'dateTo'
    >,
  ): Promise<CommunicationConversationSummaryCounts> {
    const where = this.buildConversationListWhere(organizationId, {
      ...query,
      search: undefined,
      cursor: undefined,
      limit: undefined,
      unreadOnly: undefined,
    });

    const [unreadAgg, unassigned, requiresAttention, channelGroups] = await Promise.all([
      this.prisma.communicationConversation.aggregate({
        where,
        _sum: { unreadCount: true },
      }),
      this.prisma.communicationConversation.count({
        where: { ...where, assignedUserId: null },
      }),
      this.prisma.communicationConversation.count({
        where: { ...where, status: CommunicationConversationStatus.HUMAN_REQUIRED },
      }),
      this.prisma.communicationConversation.groupBy({
        by: ['channel'],
        where,
        _count: { _all: true },
      }),
    ]);

    const byChannel: Partial<Record<CommunicationChannel, number>> = {};
    for (const row of channelGroups) {
      byChannel[row.channel] = row._count._all;
    }

    return {
      totalUnread: Math.max(0, unreadAgg._sum.unreadCount ?? 0),
      unassigned,
      requiresAttention,
      byChannel,
    };
  }

  private buildConversationListWhere(
    organizationId: string,
    query: CommunicationConversationListQueryDto,
    cursorWhere?: Prisma.CommunicationConversationWhereInput,
  ): Prisma.CommunicationConversationWhereInput {
    const and: Prisma.CommunicationConversationWhereInput[] = [{ organizationId }];

    if (query.channel?.length) {
      and.push({ channel: { in: query.channel } });
    }
    if (query.status?.length) {
      and.push({ status: { in: query.status } });
    }
    if (query.unreadOnly) {
      and.push({ unreadCount: { gt: 0 } });
    }
    if (query.customerId) {
      and.push({ customerId: query.customerId });
    }
    if (query.bookingId) {
      and.push({ bookingId: query.bookingId });
    }
    if (query.vehicleId) {
      and.push({ vehicleId: query.vehicleId });
    }
    if (query.stationId) {
      and.push({ stationId: query.stationId });
    }
    if (query.assignedUserId) {
      and.push({ assignedUserId: query.assignedUserId });
    } else if (query.unassigned) {
      and.push({ assignedUserId: null });
    }
    if (query.providerIdentity?.length) {
      and.push({
        events: {
          some: {
            organizationId,
            providerIdentity: { in: query.providerIdentity },
          },
        },
      });
    }
    if (query.dateFrom) {
      and.push({ lastActivityAt: { gte: new Date(query.dateFrom) } });
    }
    if (query.dateTo) {
      and.push({ lastActivityAt: { lte: new Date(query.dateTo) } });
    }

    const searchWhere = this.buildSearchWhere(organizationId, query.search);
    if (searchWhere) {
      and.push(searchWhere);
    }
    if (cursorWhere) {
      and.push(cursorWhere);
    }

    return { AND: and };
  }

  private buildSearchWhere(
    organizationId: string,
    search: string | undefined,
  ): Prisma.CommunicationConversationWhereInput | undefined {
    const term = search?.trim();
    if (!term) return undefined;

    const insensitiveContains = (value: string): Prisma.StringFilter => ({
      contains: value,
      mode: 'insensitive',
    });

    const terms = term.split(/\s+/).filter(Boolean);

    const customerSearch: Prisma.CustomerWhereInput = {
      organizationId,
      AND: terms.map((part) => ({
        OR: [
          { firstName: insensitiveContains(part) },
          { lastName: insensitiveContains(part) },
          { company: insensitiveContains(part) },
        ],
      })),
    };

    const or: Prisma.CommunicationConversationWhereInput[] = [
      { customer: { is: customerSearch } },
      {
        vehicle: {
          is: {
            organizationId,
            OR: [
              { licensePlate: insensitiveContains(term) },
              { vehicleName: insensitiveContains(term) },
              { make: insensitiveContains(term) },
              { model: insensitiveContains(term) },
            ],
          },
        },
      },
      {
        station: {
          is: {
            organizationId,
            name: insensitiveContains(term),
          },
        },
      },
      {
        assignedUser: {
          is: {
            OR: [
              { name: insensitiveContains(term) },
              { firstName: insensitiveContains(term) },
              { lastName: insensitiveContains(term) },
            ],
          },
        },
      },
    ];

    const bookingSuffix = this.parseBookingSearchSuffix(term);
    if (bookingSuffix) {
      or.push({
        booking: {
          is: {
            organizationId,
            id: { endsWith: bookingSuffix, mode: 'insensitive' },
          },
        },
      });
    }

    return { OR: or };
  }

  private parseBookingSearchSuffix(term: string): string | undefined {
    const normalized = term.trim().toUpperCase();
    const match = normalized.match(/^BK-([A-Z0-9]{1,6})$/);
    if (!match) return undefined;
    return match[1]!.toLowerCase();
  }
}
