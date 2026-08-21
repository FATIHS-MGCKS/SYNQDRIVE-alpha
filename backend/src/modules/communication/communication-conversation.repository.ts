import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CommunicationChannel,
  CommunicationConversation,
  CommunicationConversationStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { CommunicationTenantContextValidation } from './communication-tenant-context.validation';
import type {
  CommunicationTx,
  CreateCommunicationConversationInput,
  EnsureCommunicationConversationInput,
  UpdateCommunicationConversationProjectionInput,
} from './communication.types';

@Injectable()
export class CommunicationConversationRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: CommunicationTenantContextValidation,
  ) {}

  private client(tx?: CommunicationTx) {
    return tx ?? this.prisma;
  }

  async createConversation(
    input: CreateCommunicationConversationInput,
    tx?: CommunicationTx,
  ): Promise<CommunicationConversation> {
    this.assertUnreadCount(input.unreadCount);
    await this.tenantContext.assertConversationContextBelongsToOrg(
      input.organizationId,
      input,
      tx,
    );
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
   * Idempotent envelope ensure keyed by org + channel + nativeConversationId.
   * Uses PostgreSQL INSERT ... ON CONFLICT DO NOTHING (via createMany skipDuplicates)
   * so concurrent first events never abort the surrounding transaction.
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

    await this.tenantContext.assertConversationContextBelongsToOrg(
      input.organizationId,
      input,
      tx,
    );

    const inserted = await this.client(tx).communicationConversation.createMany({
      data: [this.toCreateManyData(input)],
      skipDuplicates: true,
    });

    const conversation = await this.findByNativeReference(
      input.organizationId,
      input.channel,
      input.nativeConversationId,
      tx,
    );
    if (!conversation) {
      throw new BadRequestException(
        'Communication conversation envelope ensure failed to resolve canonical row',
      );
    }

    return { conversation, created: inserted.count === 1 };
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

    await this.tenantContext.assertConversationContextBelongsToOrg(
      organizationId,
      patch,
      tx,
    );

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
        unreadCount: patch.unreadCount,
        metadata: patch.metadata,
      },
    });
  }

  /**
   * Atomically advances lastActivityAt using PostgreSQL GREATEST — safe under
   * concurrent transactions; older events cannot regress activity ordering.
   */
  async bumpLastActivityAt(
    organizationId: string,
    id: string,
    candidate: Date,
    tx?: CommunicationTx,
  ): Promise<CommunicationConversation> {
    await this.client(tx).$executeRaw`
      UPDATE communication_conversations
      SET last_activity_at = GREATEST(last_activity_at, ${candidate}),
          updated_at = NOW()
      WHERE id = ${id}
        AND organization_id = ${organizationId}
    `;

    const conversation = await this.findById(organizationId, id, tx);
    if (!conversation) {
      throw new BadRequestException('Communication conversation not found');
    }
    return conversation;
  }

  /**
   * Atomically increments unreadCount for org-scoped conversation rows.
   * Used by projection replay-safe path — delta must be a positive integer.
   */
  async incrementUnreadCount(
    organizationId: string,
    id: string,
    delta: number,
    tx?: CommunicationTx,
  ): Promise<CommunicationConversation> {
    if (!Number.isInteger(delta) || delta <= 0) {
      throw new BadRequestException('unread increment delta must be a positive integer');
    }

    const existing = await this.findById(organizationId, id, tx);
    if (!existing) {
      throw new BadRequestException('Communication conversation not found');
    }

    try {
      return await this.client(tx).communicationConversation.update({
        where: { id: existing.id },
        data: {
          unreadCount: { increment: delta },
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === 'P2004'
      ) {
        throw new BadRequestException('unreadCount must be >= 0');
      }
      throw error;
    }
  }

  private toCreateManyData(
    input: CreateCommunicationConversationInput,
  ): Prisma.CommunicationConversationCreateManyInput {
    return {
      organizationId: input.organizationId,
      channel: input.channel,
      nativeConversationId: input.nativeConversationId,
      status: input.status ?? CommunicationConversationStatus.AI_ACTIVE,
      customerId: input.customerId ?? undefined,
      bookingId: input.bookingId ?? undefined,
      vehicleId: input.vehicleId ?? undefined,
      stationId: input.stationId ?? undefined,
      assignedUserId: input.assignedUserId ?? undefined,
      assignedAgentRef: input.assignedAgentRef ?? undefined,
      assignedAgentType: input.assignedAgentType ?? undefined,
      lastActivityAt: input.lastActivityAt ?? new Date(),
      unreadCount: input.unreadCount ?? 0,
      metadata: input.metadata ?? undefined,
    };
  }

  private assertUnreadCount(unreadCount: number | undefined): void {
    if (unreadCount !== undefined && unreadCount < 0) {
      throw new BadRequestException('unreadCount must be >= 0');
    }
  }
}
