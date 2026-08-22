import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  mapCommunicationEvent,
  mapConversationDetail,
  mapConversationListItem,
} from './communication-read.mapper';
import { CommunicationReadRepository } from './communication-read.repository';
import type { CommunicationConversationListQueryDto } from './dto/communication-read-shared.dto';
import type {
  CommunicationConversationDetailDto,
  CommunicationConversationListResponseDto,
  CommunicationConversationSummaryDto,
  CommunicationEventListResponseDto,
} from './dto/communication-read-response.dto';
import type { CommunicationEventListQueryDto } from './dto/communication-read-shared.dto';

@Injectable()
export class CommunicationReadService {
  private readonly logger = new Logger(CommunicationReadService.name);

  constructor(private readonly repository: CommunicationReadRepository) {}

  async listConversations(
    organizationId: string,
    query: CommunicationConversationListQueryDto,
  ): Promise<CommunicationConversationListResponseDto> {
    const started = Date.now();
    const page = await this.repository.listConversations(organizationId, query);
    this.logRead('list_conversations', organizationId, {
      resultCount: page.items.length,
      hasMore: page.meta.hasMore,
      durationMs: Date.now() - started,
      filters: this.safeFilterNames(query),
    });
    return {
      items: page.items.map(mapConversationListItem),
      nextCursor: page.meta.nextCursor,
      hasMore: page.meta.hasMore,
    };
  }

  async getConversation(
    organizationId: string,
    conversationId: string,
  ): Promise<CommunicationConversationDetailDto> {
    const started = Date.now();
    const row = await this.repository.findConversationById(organizationId, conversationId);
    if (!row) {
      throw new NotFoundException('Communication conversation not found');
    }
    this.logRead('get_conversation', organizationId, {
      conversationId,
      durationMs: Date.now() - started,
    });
    return mapConversationDetail(row);
  }

  async listConversationEvents(
    organizationId: string,
    conversationId: string,
    query: CommunicationEventListQueryDto,
  ): Promise<CommunicationEventListResponseDto> {
    const started = Date.now();
    const conversation = await this.repository.findConversationById(organizationId, conversationId);
    if (!conversation) {
      throw new NotFoundException('Communication conversation not found');
    }

    const page = await this.repository.listConversationEvents(
      organizationId,
      conversationId,
      query,
    );
    this.logRead('list_conversation_events', organizationId, {
      conversationId,
      resultCount: page.items.length,
      hasMore: page.meta.hasMore,
      durationMs: Date.now() - started,
    });
    return {
      items: page.items.map(mapCommunicationEvent),
      nextCursor: page.meta.nextCursor,
      hasMore: page.meta.hasMore,
    };
  }

  async summarizeConversations(
    organizationId: string,
    query: CommunicationConversationListQueryDto,
  ): Promise<CommunicationConversationSummaryDto> {
    const started = Date.now();
    const summary = await this.repository.summarizeConversations(organizationId, query);
    this.logRead('summarize_conversations', organizationId, {
      durationMs: Date.now() - started,
      filters: this.safeFilterNames(query),
    });
    return summary;
  }

  private safeFilterNames(query: CommunicationConversationListQueryDto): string[] {
    const names: string[] = [];
    if (query.channel?.length) names.push('channel');
    if (query.status?.length) names.push('status');
    if (query.unreadOnly) names.push('unreadOnly');
    if (query.customerId) names.push('customerId');
    if (query.bookingId) names.push('bookingId');
    if (query.vehicleId) names.push('vehicleId');
    if (query.stationId) names.push('stationId');
    if (query.assignedUserId) names.push('assignedUserId');
    if (query.unassigned) names.push('unassigned');
    if (query.providerIdentity?.length) names.push('providerIdentity');
    if (query.dateFrom) names.push('dateFrom');
    if (query.dateTo) names.push('dateTo');
    if (query.search) names.push('search');
    return names;
  }

  private logRead(
    endpoint: string,
    organizationId: string,
    fields: Record<string, unknown>,
  ): void {
    this.logger.log(
      JSON.stringify({
        msg: 'communication_read_request',
        endpoint,
        organizationId,
        ...fields,
      }),
    );
  }
}
