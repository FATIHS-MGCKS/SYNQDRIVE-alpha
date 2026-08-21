import { BadRequestException, Injectable } from '@nestjs/common';
import { CommunicationEvent, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { AppendCommunicationEventInput, CommunicationTx } from './communication.types';

@Injectable()
export class CommunicationEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: CommunicationTx) {
    return tx ?? this.prisma;
  }

  async appendEvent(
    input: AppendCommunicationEventInput,
    tx?: CommunicationTx,
  ): Promise<CommunicationEvent> {
    return this.client(tx).communicationEvent.create({
      data: this.toCreateData(input),
    });
  }

  /**
   * Append-only with idempotency on organizationId + idempotencyKey when provided.
   * Does not mutate existing rows — returns prior event on replay.
   */
  async appendEventIdempotently(
    input: AppendCommunicationEventInput,
    tx?: CommunicationTx,
  ): Promise<{ event: CommunicationEvent; created: boolean }> {
    if (input.idempotencyKey) {
      const existing = await this.client(tx).communicationEvent.findUnique({
        where: {
          communication_events_org_idempotency_key: {
            organizationId: input.organizationId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (existing) {
        return { event: existing, created: false };
      }
    }

    try {
      const event = await this.appendEvent(input, tx);
      return { event, created: true };
    } catch (error) {
      if (
        input.idempotencyKey
        && error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === 'P2002'
      ) {
        const existing = await this.client(tx).communicationEvent.findUnique({
          where: {
            communication_events_org_idempotency_key: {
              organizationId: input.organizationId,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        if (existing) {
          return { event: existing, created: false };
        }
      }
      throw error;
    }
  }

  async findById(
    organizationId: string,
    id: string,
    tx?: CommunicationTx,
  ): Promise<CommunicationEvent | null> {
    return this.client(tx).communicationEvent.findFirst({
      where: { id, organizationId },
    });
  }

  async listByConversation(
    organizationId: string,
    conversationId: string,
    tx?: CommunicationTx,
  ): Promise<CommunicationEvent[]> {
    return this.client(tx).communicationEvent.findMany({
      where: { organizationId, conversationId },
      orderBy: { occurredAt: 'asc' },
    });
  }

  private toCreateData(input: AppendCommunicationEventInput): Prisma.CommunicationEventCreateInput {
    if (!input.occurredAt) {
      throw new BadRequestException('occurredAt is required');
    }
    return {
      organization: { connect: { id: input.organizationId } },
      conversation: { connect: { id: input.conversationId } },
      channel: input.channel,
      eventType: input.eventType,
      occurredAt: input.occurredAt,
      direction: input.direction ?? undefined,
      providerIdentity: input.providerIdentity ?? undefined,
      providerEventId: input.providerEventId ?? undefined,
      providerMessageId: input.providerMessageId ?? undefined,
      idempotencyKey: input.idempotencyKey ?? undefined,
      actorType: input.actorType ?? undefined,
      actorId: input.actorId ?? undefined,
      customer: input.customerId ? { connect: { id: input.customerId } } : undefined,
      booking: input.bookingId ? { connect: { id: input.bookingId } } : undefined,
      vehicle: input.vehicleId ? { connect: { id: input.vehicleId } } : undefined,
      metadata: input.metadata ?? undefined,
      redactedPayloadRef: input.redactedPayloadRef ?? undefined,
    };
  }
}
