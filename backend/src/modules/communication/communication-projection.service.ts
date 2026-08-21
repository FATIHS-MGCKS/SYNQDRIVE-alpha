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
import { CommunicationTenantContextValidation } from './communication-tenant-context.validation';
import type { UpdateCommunicationConversationProjectionInput } from './communication.types';
import {
  conversationToContextPatch,
  diffConversationContextPatch,
  mergeConversationContext,
  pickDefinedConversationContext,
} from './normalization/communication-context-merge';
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
    private readonly tenantContext: CommunicationTenantContextValidation,
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
    const createContext = pickDefinedConversationContext(envelope.initialContext);

    const envelopeResult = await this.conversations.ensureConversationEnvelope(
      {
        organizationId: envelope.organizationId,
        channel: envelope.channel,
        nativeConversationId: envelope.nativeConversationId,
        status: envelope.initialStatus,
        customerId: createContext.customerId,
        bookingId: createContext.bookingId,
        vehicleId: createContext.vehicleId,
        stationId: createContext.stationId,
        assignedUserId: createContext.assignedUserId,
        assignedAgentRef: createContext.assignedAgentRef,
        assignedAgentType: createContext.assignedAgentType,
        lastActivityAt: event.occurredAt,
      },
      tx,
    );

    let conversation = envelopeResult.conversation;

    if (conversation.channel !== envelope.channel) {
      throw new CommunicationNormalizationError(
        CommunicationNormalizationErrorCode.CHANNEL_MISMATCH,
        `Conversation channel ${conversation.channel} does not match envelope channel ${envelope.channel}`,
      );
    }

    const effectiveContext = mergeConversationContext(
      conversationToContextPatch(conversation),
      envelope.initialContext,
      projection?.context,
    );

    const contextPatch = diffConversationContextPatch(conversation, effectiveContext);
    if (contextPatch) {
      await this.tenantContext.assertConversationContextBelongsToOrg(
        envelope.organizationId,
        contextPatch,
        tx,
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
        customerId: effectiveContext.customerId ?? null,
        bookingId: effectiveContext.bookingId ?? null,
        vehicleId: effectiveContext.vehicleId ?? null,
        metadata: event.metadata as Prisma.InputJsonValue | undefined,
      },
      tx,
    );

    const projectionPatch = this.buildProjectionPatch(
      conversation,
      projection,
      appendResult.created,
      event.occurredAt,
      contextPatch,
    );

    if (projectionPatch) {
      conversation = await this.conversations.updateConversationProjection(
        envelope.organizationId,
        conversation.id,
        projectionPatch,
        tx,
      );
    }

    if (appendResult.created && projection?.unreadDelta !== undefined) {
      conversation = await this.conversations.incrementUnreadCount(
        envelope.organizationId,
        conversation.id,
        projection.unreadDelta,
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
    contextPatch: ReturnType<typeof diffConversationContextPatch>,
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

    if (contextPatch) {
      if (contextPatch.customerId !== undefined) update.customerId = contextPatch.customerId;
      if (contextPatch.bookingId !== undefined) update.bookingId = contextPatch.bookingId;
      if (contextPatch.vehicleId !== undefined) update.vehicleId = contextPatch.vehicleId;
      if (contextPatch.stationId !== undefined) update.stationId = contextPatch.stationId;
      if (contextPatch.assignedUserId !== undefined) {
        update.assignedUserId = contextPatch.assignedUserId;
      }
      if (contextPatch.assignedAgentRef !== undefined) {
        update.assignedAgentRef = contextPatch.assignedAgentRef;
      }
      if (contextPatch.assignedAgentType !== undefined) {
        update.assignedAgentType = contextPatch.assignedAgentType;
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
    }

    if (eventCreated && patch?.unreadDelta !== undefined) {
      // unreadDelta is applied via atomic incrementUnreadCount — not here.
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
