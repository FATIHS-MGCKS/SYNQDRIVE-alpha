import { Injectable, Logger } from '@nestjs/common';
import { CommunicationEventType, Prisma } from '@prisma/client';
import { StationAccessService } from '@shared/stations/station-access.service';
import { mapAiActivityEventRow } from './communication-ai-activity.mapper';
import { CommunicationAiActivityRepository } from './communication-ai-activity.repository';
import type { CommunicationAiActivityListQueryDto } from './dto/communication-ai-activity-query.dto';
import type { CommunicationAiActivityListResponseDto } from './dto/communication-ai-activity-response.dto';

@Injectable()
export class CommunicationAiActivityService {
  private readonly logger = new Logger(CommunicationAiActivityService.name);

  constructor(
    private readonly repository: CommunicationAiActivityRepository,
    private readonly stationAccess: StationAccessService,
  ) {}

  async listAiActivity(
    organizationId: string,
    actorUserId: string | undefined,
    query: CommunicationAiActivityListQueryDto,
  ): Promise<CommunicationAiActivityListResponseDto> {
    const started = Date.now();
    const stationScope = await this.buildStationScope(actorUserId, organizationId);
    const page = await this.repository.listAiActivity(organizationId, query, stationScope);
    const handoffRequests = page.items
      .filter((row) => row.eventType === CommunicationEventType.HUMAN_REQUIRED)
      .map((row) => ({
        id: row.id,
        conversationId: row.conversation.id,
        occurredAt: row.occurredAt,
      }));
    const handoffResolution = await this.repository.loadHandoffResolutionMap(
      organizationId,
      handoffRequests,
    );

    this.logger.log(
      JSON.stringify({
        msg: 'communication_ai_activity_list',
        organizationId,
        resultCount: page.items.length,
        hasMore: page.meta.hasMore,
        durationMs: Date.now() - started,
        category: query.category ?? 'all',
        channel: query.channel ?? null,
      }),
    );

    return {
      items: page.items.map((row) =>
        mapAiActivityEventRow(row, {
          handoffResolved: handoffResolution.get(row.id),
        }),
      ),
      nextCursor: page.meta.nextCursor,
      hasMore: page.meta.hasMore,
    };
  }

  private async buildStationScope(
    actorUserId: string | undefined,
    organizationId: string,
  ): Promise<Prisma.CommunicationConversationWhereInput | undefined> {
    const access = await this.stationAccess.resolve(actorUserId, organizationId);
    if (access.bypassScope || access.allowedStationIds === null) {
      return undefined;
    }
    if (access.allowedStationIds.length === 0) {
      return { id: { in: [] } };
    }
    return {
      OR: [
        { stationId: null },
        { stationId: { in: access.allowedStationIds } },
      ],
    };
  }
}
