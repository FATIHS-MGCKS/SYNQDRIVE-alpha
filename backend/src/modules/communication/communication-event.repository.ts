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
   * Uses PostgreSQL INSERT ... ON CONFLICT DO NOTHING (via createMany skipDuplicates)
   * so concurrent replays never abort the surrounding transaction.
   * Does not mutate existing rows — returns prior event on replay.
   */
  async appendEventIdempotently(
    input: AppendCommunicationEventInput,
    tx?: CommunicationTx,
  ): Promise<{ event: CommunicationEvent; created: boolean }> {
    if (!input.idempotencyKey) {
      const event = await this.appendEvent(input, tx);
      return { event, created: true };
    }

    const existing = await this.findByIdempotencyKey(
      input.organizationId,
      input.idempotencyKey,
      tx,
    );
    if (existing) {
      return { event: existing, created: false };
    }

    const inserted = await this.client(tx).communicationEvent.createMany({
      data: [this.toCreateManyData(input)],
      skipDuplicates: true,
    });

    const event = await this.findByIdempotencyKey(
      input.organizationId,
      input.idempotencyKey,
      tx,
    );
    if (!event) {
      throw new BadRequestException(
        'Communication event idempotent append failed to resolve canonical row',
      );
    }

    return { event, created: inserted.count === 1 };
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

  private async findByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
    tx?: CommunicationTx,
  ): Promise<CommunicationEvent | null> {
    return this.client(tx).communicationEvent.findUnique({
      where: {
        communication_events_org_idempotency_key: {
          organizationId,
          idempotencyKey,
        },
      },
    });
  }

  private toCreateManyData(
    input: AppendCommunicationEventInput,
  ): Prisma.CommunicationEventCreateManyInput {
    if (!input.occurredAt) {
      throw new BadRequestException('occurredAt is required');
    }
    return {
      organizationId: input.organizationId,
      conversationId: input.conversationId,
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
      customerId: input.customerId ?? undefined,
      bookingId: input.bookingId ?? undefined,
      vehicleId: input.vehicleId ?? undefined,
      metadata: input.metadata ?? undefined,
      redactedPayloadRef: input.redactedPayloadRef ?? undefined,
    };
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
