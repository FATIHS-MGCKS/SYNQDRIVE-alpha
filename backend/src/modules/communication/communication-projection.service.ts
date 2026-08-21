import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { CommunicationConversation, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { CommunicationConversationRepository } from './communication-conversation.repository';
import { CommunicationEventRepository } from './communication-event.repository';
import type { UpdateCommunicationConversationProjectionInput } from './communication.types';
import { CommunicationNormalizationError, CommunicationNormalizationErrorCode } from './normalization/communication-normalization.errors';
import type {
  CommunicationProjectionResult,
  ConversationProjectionPatch,
  NormalizedCommunicationInput,
} from './normalization/communication-normalization.types';
import { validateNormalizedCommunicationInput } from './normalization/communication-normalization.validation';

@Injectable()
export class CommunicationProjectionService {
  private readonly logger = new Logger(CommunicationProjectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: CommunicationConversationRepository,
    private readonly events: CommunicationEventRepository,
  ) {}

  /**
   * Validates and projects one normalized provider input into canonical persistence.
   * Provider adapters call this — no provider-specific branching here.
   */
  async projectNormalizedInput(
    rawInput: NormalizedCommunicationInput,
  ): Promise<CommunicationProjectionResult> {
    const input = validateNormalizedCommunicationInput(rawInput);

    if (!input.persist) {
      return {
        conversationId: '',
        eventId: '',
        conversationCreated: false,
        eventCreated: false,
      };
    }

    try {
      return await this.prisma.$transaction(async (tx) => this.projectInTransaction(input, tx));
    } catch (error) {
      throw this.mapProjectionError(error);
    }
  }

  private async projectInTransaction(
    input: NormalizedCommunicationInput,
    tx: Prisma.TransactionClient,
  ): Promise<CommunicationProjectionResult> {
    const { envelope, event, projection } = input;
    const initialContext = envelope.initialContext ?? {};

    const envelopeResult = await this.conversations.ensureConversationEnvelope(
      {
        organizationId: envelope.organizationId,
        channel: envelope.channel,
        nativeConversationId: envelope.nativeConversationId,
        status: envelope.initialStatus,
        customerId: initialContext.customerId,
        bookingId: initialContext.bookingId,
        vehicleId: initialContext.vehicleId,
        stationId: initialContext.stationId,
        assignedUserId: initialContext.assignedUserId,
        assignedAgentRef: initialContext.assignedAgentRef,
        assignedAgentType: initialContext.assignedAgentType,
        lastActivityAt: event.occurredAt,
      },
      tx,
    );

    const conversation = envelopeResult.conversation;

    if (conversation.channel !== envelope.channel) {
      throw new CommunicationNormalizationError(
        CommunicationNormalizationErrorCode.CHANNEL_MISMATCH,
        `Conversation channel ${conversation.channel} does not match envelope channel ${envelope.channel}`,
      );
    }

    const appendResult = await this.events.appendEventIdempotently(
      {
        organizationId: envelope.organizationId,
        conversationId: conversation.id,
        channel: envelope.channel,
        eventType: event.eventType,
        occurredAt: event.occurredAt,
        direction: event.direction,
        providerIdentity: event.providerIdentity,
        providerEventId: event.providerEventId,
        providerMessageId: event.providerMessageId,
        idempotencyKey: event.idempotencyKey,
        actorType: event.actorType,
        actorId: event.actorId,
        customerId: conversation.customerId,
        bookingId: conversation.bookingId,
        vehicleId: conversation.vehicleId,
        metadata: event.metadata as Prisma.InputJsonValue | undefined,
      },
      tx,
    );

    const projectionPatch = this.buildProjectionPatch(
      conversation,
      projection,
      appendResult.created,
      event.occurredAt,
    );

    if (projectionPatch) {
      await this.conversations.updateConversationProjection(
        envelope.organizationId,
        conversation.id,
        projectionPatch,
        tx,
      );
    }

    this.logProjectionSuccess({
      organizationId: envelope.organizationId,
      channel: envelope.channel,
      providerIdentity: event.providerIdentity ?? null,
      eventType: event.eventType,
      nativeConversationId: envelope.nativeConversationId,
      providerEventId: event.providerEventId ?? null,
      conversationId: conversation.id,
      eventCreated: appendResult.created,
      conversationCreated: envelopeResult.created,
    });

    return {
      conversationId: conversation.id,
      eventId: appendResult.event.id,
      conversationCreated: envelopeResult.created,
      eventCreated: appendResult.created,
    };
  }

  private buildProjectionPatch(
    existing: CommunicationConversation,
    patch: ConversationProjectionPatch | undefined,
    eventCreated: boolean,
    eventOccurredAt: Date,
  ): UpdateCommunicationConversationProjectionInput | null {
    const candidateActivity = patch?.lastActivityAt ?? eventOccurredAt;
    const lastActivityAt = maxDate(existing.lastActivityAt, candidateActivity);

    const update: UpdateCommunicationConversationProjectionInput = {
      lastActivityAt,
    };

    let hasMutation = lastActivityAt.getTime() !== existing.lastActivityAt.getTime();

    if (patch?.status !== undefined) {
      update.status = patch.status;
      hasMutation = true;
    }

    if (patch?.context) {
      if (patch.context.customerId !== undefined) update.customerId = patch.context.customerId;
      if (patch.context.bookingId !== undefined) update.bookingId = patch.context.bookingId;
      if (patch.context.vehicleId !== undefined) update.vehicleId = patch.context.vehicleId;
      if (patch.context.stationId !== undefined) update.stationId = patch.context.stationId;
      if (patch.context.assignedUserId !== undefined) {
        update.assignedUserId = patch.context.assignedUserId;
      }
      if (patch.context.assignedAgentRef !== undefined) {
        update.assignedAgentRef = patch.context.assignedAgentRef;
      }
      if (patch.context.assignedAgentType !== undefined) {
        update.assignedAgentType = patch.context.assignedAgentType;
      }
      hasMutation = true;
    }

    if (patch?.metadata !== undefined) {
      update.metadata = patch.metadata as Prisma.InputJsonValue;
      hasMutation = true;
    }

    if (patch?.unreadCountAbsolute !== undefined) {
      update.unreadCount = patch.unreadCountAbsolute;
      hasMutation = true;
    } else if (eventCreated && patch?.unreadDelta !== undefined) {
      update.unreadCount = existing.unreadCount + patch.unreadDelta;
      hasMutation = true;
    }

    return hasMutation ? update : null;
  }

  private mapProjectionError(error: unknown): Error {
    if (error instanceof CommunicationNormalizationError) {
      return error;
    }
    if (error instanceof BadRequestException) {
      const message = error.message;
      if (message.includes('does not match conversation channel')) {
        return new CommunicationNormalizationError(
          CommunicationNormalizationErrorCode.CHANNEL_MISMATCH,
          message,
        );
      }
      return new CommunicationNormalizationError(
        CommunicationNormalizationErrorCode.TENANT_CONTEXT_REJECTED,
        message,
      );
    }
    if (error instanceof ForbiddenException) {
      return new CommunicationNormalizationError(
        CommunicationNormalizationErrorCode.TENANT_CONTEXT_REJECTED,
        error.message,
      );
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === 'P2002'
    ) {
      return new CommunicationNormalizationError(
        CommunicationNormalizationErrorCode.IDEMPOTENCY_CONFLICT,
        'Canonical communication idempotency conflict',
      );
    }

    return new CommunicationNormalizationError(
      CommunicationNormalizationErrorCode.PROJECTION_FAILURE,
      error instanceof Error ? error.message : 'Projection failed',
    );
  }

  private logProjectionSuccess(fields: {
    organizationId: string;
    channel: string;
    providerIdentity: string | null;
    eventType: string;
    nativeConversationId: string;
    providerEventId: string | null;
    conversationId: string;
    eventCreated: boolean;
    conversationCreated: boolean;
  }): void {
    this.logger.log(
      JSON.stringify({
        msg: 'communication_projection_applied',
        organizationId: fields.organizationId,
        channel: fields.channel,
        providerIdentity: fields.providerIdentity,
        eventType: fields.eventType,
        nativeConversationId: fields.nativeConversationId,
        providerEventId: fields.providerEventId,
        conversationId: fields.conversationId,
        eventCreated: fields.eventCreated,
        conversationCreated: fields.conversationCreated,
      }),
    );
  }
}

function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}
