import { Injectable } from '@nestjs/common';
import {
  CommunicationActorType,
  CommunicationConversationStatus,
  CommunicationDirection,
  CommunicationEventType,
  Prisma,
} from '@prisma/client';
import { CommunicationEventRepository } from '../communication-event.repository';
import type { CommunicationConversationListRow } from '../read/communication-read.mapper';
import {
  assertOperatorStatusTransition,
  isHumanTakeoverEligibleStatus,
} from './communication-conversation-state-machine';
import { CommunicationWriteError } from './communication-write.errors';

export { isHumanTakeoverEligibleStatus } from './communication-conversation-state-machine';

@Injectable()
export class CommunicationHumanTakeoverService {
  constructor(private readonly events: CommunicationEventRepository) {}

  async performHumanTakeover(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      conversationId: string;
      actorUserId: string;
      row: CommunicationConversationListRow;
      lifecycleEventKey: (action: string, conversationId: string, updatedAt: Date) => string;
    },
  ): Promise<{
    changed: boolean;
    previousStatus: CommunicationConversationStatus;
    newStatus: CommunicationConversationStatus;
  }> {
    if (!isHumanTakeoverEligibleStatus(input.row.status)) {
      throw CommunicationWriteError.invalidTransition(
        input.row.status,
        CommunicationConversationStatus.HUMAN_ACTIVE,
      );
    }

    if (input.row.assignedUserId && input.row.assignedUserId !== input.actorUserId) {
      throw CommunicationWriteError.alreadyClaimed();
    }

    if (
      input.row.assignedUserId === input.actorUserId
      && input.row.status === CommunicationConversationStatus.HUMAN_ACTIVE
    ) {
      return {
        changed: false,
        previousStatus: input.row.status,
        newStatus: input.row.status,
      };
    }

    if (input.row.assignedUserId && input.row.assignedUserId !== input.actorUserId) {
      throw CommunicationWriteError.alreadyClaimed();
    }

    const previousStatus = input.row.status;
    const targetStatus = CommunicationConversationStatus.HUMAN_ACTIVE;
    assertOperatorStatusTransition(previousStatus, targetStatus);

    const updatedCount = await tx.communicationConversation.updateMany({
      where: {
        id: input.conversationId,
        organizationId: input.organizationId,
        assignedUserId: input.row.assignedUserId ?? null,
        status: previousStatus,
        updatedAt: input.row.updatedAt,
      },
      data: {
        assignedUserId: input.actorUserId,
        status: targetStatus,
      },
    });

    if (updatedCount.count === 0) {
      const current = await tx.communicationConversation.findFirst({
        where: { id: input.conversationId, organizationId: input.organizationId },
      });
      if (
        current?.assignedUserId === input.actorUserId
        && current.status === CommunicationConversationStatus.HUMAN_ACTIVE
      ) {
        return { changed: false, previousStatus, newStatus: targetStatus };
      }
      throw CommunicationWriteError.alreadyClaimed();
    }

    await this.events.appendEventIdempotently(
      {
        organizationId: input.organizationId,
        conversationId: input.conversationId,
        channel: input.row.channel,
        eventType: CommunicationEventType.HUMAN_ASSIGNED,
        occurredAt: new Date(),
        direction: CommunicationDirection.INTERNAL,
        actorType: CommunicationActorType.USER,
        actorId: input.actorUserId,
        idempotencyKey: input.lifecycleEventKey('takeover', input.conversationId, input.row.updatedAt),
        metadata: {
          previousStatus,
          newStatus: targetStatus,
          assigneeUserId: input.actorUserId,
        },
      },
      tx,
    );

    return { changed: true, previousStatus, newStatus: targetStatus };
  }
}
