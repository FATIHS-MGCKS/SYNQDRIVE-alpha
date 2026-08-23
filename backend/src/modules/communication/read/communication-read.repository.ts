import { Injectable } from '@nestjs/common';
import {
  CommunicationChannel,
  CommunicationConversationStatus,
  CommunicationProviderIdentity,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { buildConversationWhere } from '@modules/voice-assistant/voice-conversation.util';
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
import {
  COMMUNICATION_ATTENTION_PREVIEW_TIERS,
  buildCommunicationAttentionPreviewTierWhere,
  resolveCommunicationAttentionPreviewLimit,
} from './communication-read.attention-preview';
import type { CommunicationConversationListQueryDto } from './dto/communication-read-shared.dto';

export interface CommunicationConversationSummaryCounts {
  totalUnreadMessages: number;
  unreadConversations: number;
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

    const intentNativeIds = query.intent
      ? await this.resolveIntentFilterNativeIds(organizationId, query.intent)
      : undefined;

    const voiceNativeIds = this.hasVoiceCallFilters(query)
      ? await this.resolveVoiceFilterNativeIds(organizationId, query)
      : undefined;

    const where = this.buildConversationListWhere(
      organizationId,
      query,
      cursorWhere,
      intentNativeIds,
      voiceNativeIds,
    );

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

  async listAttentionPreviewConversations(
    organizationId: string,
    limit?: number,
  ): Promise<CommunicationConversationListRow[]> {
    const resolvedLimit = resolveCommunicationAttentionPreviewLimit(limit);
    const result: CommunicationConversationListRow[] = [];
    const excludeIds: string[] = [];

    for (const tier of COMMUNICATION_ATTENTION_PREVIEW_TIERS) {
      if (result.length >= resolvedLimit) break;

      const rows = await this.prisma.communicationConversation.findMany({
        where: {
          AND: [
            { organizationId },
            buildCommunicationAttentionPreviewTierWhere(tier),
            ...(excludeIds.length > 0 ? [{ id: { notIn: excludeIds } }] : []),
          ],
        },
        select: CONVERSATION_LIST_SELECT,
        orderBy: [{ lastActivityAt: 'desc' }, { id: 'asc' }],
        take: resolvedLimit - result.length,
      });

      for (const row of rows) {
        result.push(row);
        excludeIds.push(row.id);
      }
    }

    return result;
  }

  async findConversationById(
    organizationId: string,
    conversationId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<CommunicationConversationListRow | null> {
    const client = tx ?? this.prisma;
    return client.communicationConversation.findFirst({
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
    query: CommunicationConversationListQueryDto,
  ): Promise<CommunicationConversationSummaryCounts> {
    const intentNativeIds = query.intent
      ? await this.resolveIntentFilterNativeIds(organizationId, query.intent)
      : undefined;
    const voiceNativeIds = this.hasVoiceCallFilters(query)
      ? await this.resolveVoiceFilterNativeIds(organizationId, query)
      : undefined;
    const where = this.buildConversationListWhere(organizationId, {
      ...query,
      cursor: undefined,
      limit: undefined,
    }, undefined, intentNativeIds, voiceNativeIds);

    const [unreadAgg, unreadConversations, unassigned, requiresAttention, channelGroups] =
      await Promise.all([
      this.prisma.communicationConversation.aggregate({
        where,
        _sum: { unreadCount: true },
      }),
      this.prisma.communicationConversation.count({
        where: { ...where, unreadCount: { gt: 0 } },
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
      totalUnreadMessages: Math.max(0, unreadAgg._sum.unreadCount ?? 0),
      unreadConversations,
      unassigned,
      requiresAttention,
      byChannel,
    };
  }

  private buildConversationListWhere(
    organizationId: string,
    query: CommunicationConversationListQueryDto,
    cursorWhere?: Prisma.CommunicationConversationWhereInput,
    intentNativeIds?: string[] | null,
    voiceNativeIds?: string[] | null,
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
      // Operational filter: conversation has at least one canonical event from provider.
      and.push({
        events: {
          some: {
            organizationId,
            providerIdentity: { in: query.providerIdentity },
          },
        },
      });
    }
    if (query.dateFrom || query.dateTo) {
      const voiceOnlyDateFilter =
        voiceNativeIds != null
        && query.channel?.length === 1
        && query.channel[0] === CommunicationChannel.VOICE;
      if (!voiceOnlyDateFilter) {
        if (query.dateFrom) {
          and.push({ lastActivityAt: { gte: new Date(query.dateFrom) } });
        }
        if (query.dateTo) {
          and.push({ lastActivityAt: { lte: new Date(query.dateTo) } });
        }
      }
    }

    const searchWhere = this.buildSearchWhere(organizationId, query.search);
    if (searchWhere) {
      and.push(searchWhere);
    }
    if (query.intent) {
      const intentFilter = this.buildCanonicalIntentFilter(query.intent, intentNativeIds);
      if (intentFilter) {
        and.push(intentFilter);
      }
    }
    if (voiceNativeIds) {
      and.push({
        channel: CommunicationChannel.VOICE,
        nativeConversationId: {
          in: voiceNativeIds.length > 0 ? voiceNativeIds : ['__none__'],
        },
      });
    }
    if (cursorWhere) {
      and.push(cursorWhere);
    }

    return { AND: and };
  }

  private buildCanonicalIntentFilter(
    intent: string,
    nativeIds: string[] | null | undefined,
  ): Prisma.CommunicationConversationWhereInput | undefined {
    const key = intent.trim().toLowerCase();
    switch (key) {
      case 'unknown_customer':
        return { customerId: null };
      case 'booking':
      case 'has_booking':
        return { bookingId: { not: null } };
      case 'ai_suggested':
        return {
          unreadCount: { gt: 0 },
          channel: CommunicationChannel.WHATSAPP,
          ...(nativeIds
            ? { nativeConversationId: { in: nativeIds.length > 0 ? nativeIds : ['__none__'] } }
            : {}),
        };
      default:
        if (nativeIds) {
          return {
            channel: CommunicationChannel.WHATSAPP,
            nativeConversationId: { in: nativeIds.length > 0 ? nativeIds : ['__none__'] },
          };
        }
        return undefined;
    }
  }

  private async resolveIntentFilterNativeIds(
    organizationId: string,
    intent: string,
  ): Promise<string[] | null> {
    const key = intent.trim().toLowerCase();
    if (key === 'unknown_customer' || key === 'booking' || key === 'has_booking') {
      return null;
    }

    let intentWhere: Prisma.WhatsAppConversationWhereInput = { organizationId };

    switch (key) {
      case 'payment':
        intentWhere.lastDetectedIntent = { in: ['PAYMENT', 'DEPOSIT'] };
        break;
      case 'damage':
        intentWhere.lastDetectedIntent = { in: ['DAMAGE', 'ACCIDENT'] };
        break;
      case 'documents':
        intentWhere.lastDetectedIntent = 'DOCUMENTS';
        break;
      case 'ai_suggested':
        intentWhere.AND = [
          { lastDetectedIntent: { not: null } },
          { lastDetectedIntent: { notIn: ['UNKNOWN', 'OPT_OUT'] } },
        ];
        break;
      default:
        intentWhere.lastDetectedIntent = intent.trim().toUpperCase();
        break;
    }

    const rows = await this.prisma.whatsAppConversation.findMany({
      where: intentWhere,
      select: { id: true },
    });
    return rows.map((row) => row.id);
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
            memberships: {
              some: {
                organizationId,
                status: 'ACTIVE',
              },
            },
            AND: terms.map((part) => ({
              OR: [
                { name: insensitiveContains(part) },
                { firstName: insensitiveContains(part) },
                { lastName: insensitiveContains(part) },
              ],
            })),
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

  private hasVoiceCallFilters(query: CommunicationConversationListQueryDto): boolean {
    const includesVoice =
      !query.channel?.length
      || query.channel.includes(CommunicationChannel.VOICE);
    if (!includesVoice) return false;

    const voiceOnlyChannel =
      query.channel?.length === 1 && query.channel[0] === CommunicationChannel.VOICE;

    return Boolean(
      query.callDirection
      || query.callOutcome
      || query.callHasTranscript != null
      || query.callEscalatedOnly
      || (voiceOnlyChannel && (query.dateFrom || query.dateTo)),
    );
  }

  private async resolveVoiceFilterNativeIds(
    organizationId: string,
    query: CommunicationConversationListQueryDto,
  ): Promise<string[]> {
    const voiceOnlyChannel =
      query.channel?.length === 1 && query.channel[0] === CommunicationChannel.VOICE;

    const voiceWhere = buildConversationWhere(organizationId, {
      direction: query.callDirection,
      outcome: query.callOutcome,
      hasTranscript: query.callHasTranscript,
      escalatedOnly: query.callEscalatedOnly,
      dateFrom: voiceOnlyChannel ? query.dateFrom : undefined,
      dateTo: voiceOnlyChannel ? query.dateTo : undefined,
    });

    const rows = await this.prisma.voiceConversation.findMany({
      where: voiceWhere,
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }
}
