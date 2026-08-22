import { Injectable, NotFoundException } from '@nestjs/common';
import { StationAccessService } from '@shared/stations/station-access.service';
import type { CommunicationConversationListRow } from '../read/communication-read.mapper';

@Injectable()
export class CommunicationWriteScopeService {
  constructor(private readonly stationAccess: StationAccessService) {}

  async assertConversationMutable(
    actorUserId: string,
    organizationId: string,
    conversation: CommunicationConversationListRow,
  ): Promise<void> {
    if (conversation.stationId) {
      const access = await this.stationAccess.resolve(actorUserId, organizationId);
      try {
        this.stationAccess.assertStationReadable(access, conversation.stationId);
      } catch {
        throw new NotFoundException('Communication conversation not found');
      }
    }
  }
}
