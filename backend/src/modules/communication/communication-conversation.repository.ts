import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CommunicationChannel,
  CommunicationConversation,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type {
  CommunicationTx,
  CreateCommunicationConversationInput,
  EnsureCommunicationConversationInput,
  UpdateCommunicationConversationProjectionInput,
} from './communication.types';

@Injectable()
export class CommunicationConversationRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: CommunicationTx) {
    return tx ?? this.prisma;
  }

  async createConversation(
    input: CreateCommunicationConversationInput,
    tx?: CommunicationTx,
  ): Promise<CommunicationConversation> {
    this.assertUnreadCount(input.unreadCount);
    return this.client(tx).communicationConversation.create({
      data: {
        organizationId: input.organizationId,
        channel: input.channel,
        nativeConversationId: input.nativeConversationId,
        status: input.status,
        customerId: input.customerId ?? undefined,
        bookingId: input.bookingId ?? undefined,
        vehicleId: input.vehicleId ?? undefined,
        stationId: input.stationId ?? undefined,
        assignedUserId: input.assignedUserId ?? undefined,
        assignedAgentRef: input.assignedAgentRef ?? undefined,
        assignedAgentType: input.assignedAgentType ?? undefined,
        lastActivityAt: input.lastActivityAt,
        unreadCount: input.unreadCount ?? 0,
        metadata: input.metadata ?? undefined,
      },
    });
  }

  async findById(
    organizationId: string,
    id: string,
    tx?: CommunicationTx,
  ): Promise<CommunicationConversation | null> {
    return this.client(tx).communicationConversation.findFirst({
      where: { id, organizationId },
    });
  }

  async findByNativeReference(
    organizationId: string,
    channel: CommunicationChannel,
    nativeConversationId: string,
    tx?: CommunicationTx,
  ): Promise<CommunicationConversation | null> {
    return this.client(tx).communicationConversation.findUnique({
      where: {
        communication_conversations_org_channel_native: {
          organizationId,
          channel,
          nativeConversationId,
        },
      },
    });
  }

  /**
   * Idempotent envelope upsert keyed by org + channel + nativeConversationId.
   * Updates projection fields on replay without changing canonical id.
   */
  async ensureConversationEnvelope(
    input: EnsureCommunicationConversationInput,
    tx?: CommunicationTx,
  ): Promise<{ conversation: CommunicationConversation; created: boolean }> {
    this.assertUnreadCount(input.unreadCount);
    const existing = await this.findByNativeReference(
      input.organizationId,
      input.channel,
      input.nativeConversationId,
      tx,
    );
    if (existing) {
      return { conversation: existing, created: false };
    }

    try {
      const conversation = await this.createConversation(input, tx);
      return { conversation, created: true };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === 'P2002'
      ) {
        const raced = await this.findByNativeReference(
          input.organizationId,
          input.channel,
          input.nativeConversationId,
          tx,
        );
        if (raced) {
          return { conversation: raced, created: false };
        }
      }
      throw error;
    }
  }

  async updateConversationProjection(
    organizationId: string,
    id: string,
    patch: UpdateCommunicationConversationProjectionInput,
    tx?: CommunicationTx,
  ): Promise<CommunicationConversation> {
    this.assertUnreadCount(patch.unreadCount);
    const existing = await this.findById(organizationId, id, tx);
    if (!existing) {
      throw new BadRequestException('Communication conversation not found');
    }

    return this.client(tx).communicationConversation.update({
      where: { id: existing.id },
      data: {
        status: patch.status,
        customerId: patch.customerId,
        bookingId: patch.bookingId,
        vehicleId: patch.vehicleId,
        stationId: patch.stationId,
        assignedUserId: patch.assignedUserId,
        assignedAgentRef: patch.assignedAgentRef,
        assignedAgentType: patch.assignedAgentType,
        lastActivityAt: patch.lastActivityAt,
        unreadCount: patch.unreadCount,
        metadata: patch.metadata,
      },
    });
  }

  private assertUnreadCount(unreadCount: number | undefined): void {
    if (unreadCount !== undefined && unreadCount < 0) {
      throw new BadRequestException('unreadCount must be >= 0');
    }
  }
}
