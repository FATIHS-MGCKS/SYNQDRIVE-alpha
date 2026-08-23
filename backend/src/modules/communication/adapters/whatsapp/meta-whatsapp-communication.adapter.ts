import { Injectable } from '@nestjs/common';
import {
  CommunicationActorType,
  CommunicationChannel,
  CommunicationConversationStatus,
  CommunicationDirection,
  CommunicationEventType,
  CommunicationProviderIdentity,
  WhatsAppConversation,
  WhatsAppConversationStatus,
  WhatsAppMessage,
} from '@prisma/client';
import { buildCanonicalIdempotencyKey } from '../../normalization/communication-idempotency';
import { CommunicationNormalizationError, CommunicationNormalizationErrorCode } from '../../normalization/communication-normalization.errors';
import type { NormalizedCommunicationInput } from '../../normalization/communication-normalization.types';
import type { MessagingProviderNormalizationPort } from '../../ports/messaging-normalization.port';
import type {
  MetaWhatsAppAiIntentProjectionSource,
  MetaWhatsAppHumanRequiredProjectionSource,
  MetaWhatsAppInboundProjectionSource,
  MetaWhatsAppLifecycleStatus,
  MetaWhatsAppOutboundProjectionSource,
  MetaWhatsAppStatusProjectionSource,
} from './meta-whatsapp-communication.types';

@Injectable()
export class MetaWhatsAppCommunicationAdapter implements MessagingProviderNormalizationPort {
  normalizeInbound(source: unknown): NormalizedCommunicationInput {
    return this.fromInbound(this.assertInboundSource(source));
  }

  normalizeOutboundAccepted(source: unknown): NormalizedCommunicationInput {
    return this.fromOutboundAccepted(this.assertOutboundSource(source));
  }

  normalizeDeliveryUpdate(source: unknown): NormalizedCommunicationInput {
    return this.fromStatusUpdate(this.assertStatusSource(source));
  }

  normalizeFailure(source: unknown): NormalizedCommunicationInput {
    const statusSource = this.assertStatusSource(source);
    if (statusSource.status !== 'FAILED') {
      throw new CommunicationNormalizationError(
        CommunicationNormalizationErrorCode.INVALID_NORMALIZED_INPUT,
        'normalizeFailure requires FAILED lifecycle status',
      );
    }
    return this.fromStatusUpdate(statusSource);
  }

  fromInbound(source: MetaWhatsAppInboundProjectionSource): NormalizedCommunicationInput {
    const { conversation, message } = source;
    this.assertNativeConversation(conversation, message);

    const occurredAt = source.occurredAt ?? message.createdAt;
    const providerMessageId = this.requireProviderMessageId(message);
    const providerEventId = source.webhookExternalEventId?.trim() || `wa-msg:${message.id}`;

    const projection: NormalizedCommunicationInput['projection'] = {};
    if (message.direction === 'incoming') {
      projection.unreadDelta = 1;
    }

    return {
      envelope: this.buildEnvelope(conversation, { includeInitialStatus: true }),
      event: {
        eventType: CommunicationEventType.MESSAGE_RECEIVED,
        occurredAt,
        direction: CommunicationDirection.INBOUND,
        providerIdentity: CommunicationProviderIdentity.META_WHATSAPP,
        providerEventId,
        providerMessageId,
        idempotencyKey: this.buildIdempotencyKey({
          organizationId: conversation.organizationId,
          nativeConversationId: conversation.id,
          eventType: CommunicationEventType.MESSAGE_RECEIVED,
          providerEventId,
          providerMessageId,
        }),
        actorType: CommunicationActorType.CUSTOMER,
      },
      projection,
    };
  }

  fromOutboundAccepted(source: MetaWhatsAppOutboundProjectionSource): NormalizedCommunicationInput {
    const { conversation, message } = source;
    this.assertNativeConversation(conversation, message);

    if (message.status === 'FAILED' || message.status === 'QUEUED') {
      throw new CommunicationNormalizationError(
        CommunicationNormalizationErrorCode.INVALID_NORMALIZED_INPUT,
        'outbound projection requires accepted SENT native message',
      );
    }

    const occurredAt = source.occurredAt ?? message.updatedAt ?? message.createdAt;
    const providerMessageId = message.providerMessageId?.trim() || undefined;
    const providerEventId = providerMessageId ? `wa-sent:${message.id}` : `wa-sent:${message.id}`;

    return {
      envelope: this.buildEnvelope(conversation, { includeInitialStatus: false }),
      event: {
        eventType: CommunicationEventType.MESSAGE_SENT,
        occurredAt,
        direction: CommunicationDirection.OUTBOUND,
        providerIdentity: CommunicationProviderIdentity.META_WHATSAPP,
        providerEventId,
        providerMessageId: providerMessageId ?? null,
        idempotencyKey: this.buildIdempotencyKey({
          organizationId: conversation.organizationId,
          nativeConversationId: conversation.id,
          eventType: CommunicationEventType.MESSAGE_SENT,
          providerEventId,
          providerMessageId,
        }),
        actorType: resolveOutboundActorType(message),
      },
    };
  }

  fromStatusUpdate(source: MetaWhatsAppStatusProjectionSource): NormalizedCommunicationInput {
    const { conversation, message, status } = source;
    this.assertNativeConversation(conversation, message);

    const eventType = mapLifecycleStatusToEventType(status);
    const providerMessageId = this.requireProviderMessageId(message);
    const providerEventId =
      status === 'FAILED'
        ? `wa-failed:${message.id}`
        : source.webhookExternalEventId.trim();

    const metadata =
      status === 'FAILED' && source.failureReason
        ? { failureCode: sanitizeFailureCode(source.failureReason) }
        : undefined;

    return {
      envelope: this.buildEnvelope(conversation, { includeInitialStatus: false }),
      event: {
        eventType,
        occurredAt: source.occurredAt,
        direction: CommunicationDirection.OUTBOUND,
        providerIdentity: CommunicationProviderIdentity.META_WHATSAPP,
        providerEventId,
        providerMessageId,
        idempotencyKey: this.buildIdempotencyKey({
          organizationId: conversation.organizationId,
          nativeConversationId: conversation.id,
          eventType,
          providerEventId,
          providerMessageId,
        }),
        metadata,
      },
    };
  }

  fromOutboundFailed(source: MetaWhatsAppOutboundProjectionSource): NormalizedCommunicationInput {
    const { conversation, message } = source;
    this.assertNativeConversation(conversation, message);

    if (message.status !== 'FAILED') {
      throw new CommunicationNormalizationError(
        CommunicationNormalizationErrorCode.INVALID_NORMALIZED_INPUT,
        'outbound failure projection requires FAILED native message',
      );
    }

    const occurredAt = source.occurredAt ?? message.updatedAt ?? message.createdAt;
    const providerMessageId = message.providerMessageId?.trim() || undefined;
    const providerEventId = `wa-failed:${message.id}`;

    return {
      envelope: this.buildEnvelope(conversation, { includeInitialStatus: false }),
      event: {
        eventType: CommunicationEventType.MESSAGE_FAILED,
        occurredAt,
        direction: CommunicationDirection.OUTBOUND,
        providerIdentity: CommunicationProviderIdentity.META_WHATSAPP,
        providerEventId,
        providerMessageId: providerMessageId ?? null,
        idempotencyKey: this.buildIdempotencyKey({
          organizationId: conversation.organizationId,
          nativeConversationId: conversation.id,
          eventType: CommunicationEventType.MESSAGE_FAILED,
          providerEventId,
          providerMessageId,
        }),
        actorType: resolveOutboundActorType(message),
        metadata: message.failureReason
          ? { failureCode: sanitizeFailureCode(message.failureReason) }
          : undefined,
      },
    };
  }

  fromHumanRequired(source: MetaWhatsAppHumanRequiredProjectionSource): NormalizedCommunicationInput {
    const { conversation } = source;
    const occurredAt = source.occurredAt ?? resolveNativeTransitionOccurredAt(conversation);
    const providerEventId =
      source.webhookExternalEventId?.trim() ||
      buildWhatsAppTransitionProviderEventId('wa-human', conversation);

    return {
      envelope: this.buildEnvelope(conversation, { includeInitialStatus: false }),
      event: {
        eventType: CommunicationEventType.HUMAN_REQUIRED,
        occurredAt,
        direction: CommunicationDirection.INTERNAL,
        providerIdentity: CommunicationProviderIdentity.META_WHATSAPP,
        providerEventId,
        idempotencyKey: this.buildIdempotencyKey({
          organizationId: conversation.organizationId,
          nativeConversationId: conversation.id,
          eventType: CommunicationEventType.HUMAN_REQUIRED,
          providerEventId,
        }),
        metadata: source.handoffReasonCode
          ? { handoffReasonCode: source.handoffReasonCode }
          : undefined,
      },
      projection: {
        status: CommunicationConversationStatus.HUMAN_REQUIRED,
      },
    };
  }

  fromConversationResolved(
    source: MetaWhatsAppHumanRequiredProjectionSource,
  ): NormalizedCommunicationInput {
    const { conversation } = source;
    const occurredAt = source.occurredAt ?? resolveNativeTransitionOccurredAt(conversation);
    const providerEventId =
      source.webhookExternalEventId?.trim() ||
      buildWhatsAppTransitionProviderEventId('wa-resolved', conversation);

    return {
      envelope: this.buildEnvelope(conversation, { includeInitialStatus: false }),
      event: {
        eventType: CommunicationEventType.CONVERSATION_RESOLVED,
        occurredAt,
        direction: CommunicationDirection.INTERNAL,
        providerIdentity: CommunicationProviderIdentity.META_WHATSAPP,
        providerEventId,
        idempotencyKey: this.buildIdempotencyKey({
          organizationId: conversation.organizationId,
          nativeConversationId: conversation.id,
          eventType: CommunicationEventType.CONVERSATION_RESOLVED,
          providerEventId,
        }),
      },
      projection: {
        status: CommunicationConversationStatus.RESOLVED,
      },
    };
  }

  fromAiIntentDetected(source: MetaWhatsAppAiIntentProjectionSource): NormalizedCommunicationInput {
    const { conversation } = source;
    const occurredAt = source.occurredAt ?? conversation.updatedAt;
    const providerEventId = `wa-ai-intent:${source.suggestionId}`;

    return {
      envelope: this.buildEnvelope(conversation, { includeInitialStatus: false }),
      event: {
        eventType: CommunicationEventType.AI_INTENT_DETECTED,
        occurredAt,
        direction: CommunicationDirection.INTERNAL,
        providerIdentity: CommunicationProviderIdentity.META_WHATSAPP,
        providerEventId,
        idempotencyKey: this.buildIdempotencyKey({
          organizationId: conversation.organizationId,
          nativeConversationId: conversation.id,
          eventType: CommunicationEventType.AI_INTENT_DETECTED,
          providerEventId,
        }),
        actorType: CommunicationActorType.AI_AGENT,
        metadata: {
          intentCode: source.intentCode,
          ...(source.confidence != null ? { confidence: source.confidence } : {}),
        },
      },
    };
  }

  private buildEnvelope(
    conversation: WhatsAppConversation,
    options: { includeInitialStatus: boolean },
  ): NormalizedCommunicationInput['envelope'] {
    return {
      organizationId: conversation.organizationId,
      channel: CommunicationChannel.WHATSAPP,
      nativeConversationId: conversation.id,
      initialStatus: options.includeInitialStatus
        ? mapWhatsAppConversationStatus(conversation.status)
        : undefined,
      initialContext: {
        customerId: conversation.customerId,
        bookingId: conversation.bookingId,
        vehicleId: conversation.vehicleId,
        assignedUserId: conversation.assignedTo,
      },
    };
  }

  private buildIdempotencyKey(input: {
    organizationId: string;
    nativeConversationId: string;
    eventType: CommunicationEventType;
    providerEventId?: string | null;
    providerMessageId?: string | null;
  }): string {
    return buildCanonicalIdempotencyKey({
      organizationId: input.organizationId,
      channel: CommunicationChannel.WHATSAPP,
      providerIdentity: CommunicationProviderIdentity.META_WHATSAPP,
      eventType: input.eventType,
      nativeConversationId: input.nativeConversationId,
      providerEventId: input.providerEventId,
      providerMessageId: input.providerMessageId,
    });
  }

  private assertNativeConversation(
    conversation: WhatsAppConversation,
    message: WhatsAppMessage,
  ): void {
    if (message.conversationId !== conversation.id) {
      throw new CommunicationNormalizationError(
        CommunicationNormalizationErrorCode.INVALID_NORMALIZED_INPUT,
        'WhatsApp message does not belong to the supplied conversation',
      );
    }
    if (message.organizationId !== conversation.organizationId) {
      throw new CommunicationNormalizationError(
        CommunicationNormalizationErrorCode.INVALID_NORMALIZED_INPUT,
        'WhatsApp message organization does not match conversation',
      );
    }
    if (conversation.id === message.providerMessageId) {
      throw new CommunicationNormalizationError(
        CommunicationNormalizationErrorCode.INVALID_NORMALIZED_INPUT,
        'nativeConversationId must not equal provider message id (wamid)',
      );
    }
  }

  private requireProviderMessageId(message: WhatsAppMessage): string {
    const providerMessageId = message.providerMessageId?.trim();
    if (!providerMessageId) {
      throw new CommunicationNormalizationError(
        CommunicationNormalizationErrorCode.INVALID_NORMALIZED_INPUT,
        'WhatsApp lifecycle projection requires providerMessageId (wamid)',
      );
    }
    return providerMessageId;
  }

  private assertInboundSource(source: unknown): MetaWhatsAppInboundProjectionSource {
    return this.assertSourceShape<MetaWhatsAppInboundProjectionSource>(source, 'inbound');
  }

  private assertOutboundSource(source: unknown): MetaWhatsAppOutboundProjectionSource {
    return this.assertSourceShape<MetaWhatsAppOutboundProjectionSource>(source, 'outbound');
  }

  private assertStatusSource(source: unknown): MetaWhatsAppStatusProjectionSource {
    return this.assertSourceShape<MetaWhatsAppStatusProjectionSource>(source, 'status');
  }

  private assertSourceShape<T extends { conversation: WhatsAppConversation; message?: WhatsAppMessage }>(
    source: unknown,
    label: string,
  ): T {
    if (!source || typeof source !== 'object') {
      throw new CommunicationNormalizationError(
        CommunicationNormalizationErrorCode.INVALID_NORMALIZED_INPUT,
        `WhatsApp ${label} projection source must be an object`,
      );
    }
    const candidate = source as T;
    if (!candidate.conversation?.id || !candidate.conversation.organizationId) {
      throw new CommunicationNormalizationError(
        CommunicationNormalizationErrorCode.INVALID_NORMALIZED_INPUT,
        `WhatsApp ${label} projection source requires persisted conversation`,
      );
    }
    return candidate;
  }
}

export function mapWhatsAppConversationStatus(
  status: WhatsAppConversationStatus,
): CommunicationConversationStatus | undefined {
  switch (status) {
    case WhatsAppConversationStatus.OPEN:
      return CommunicationConversationStatus.AI_ACTIVE;
    case WhatsAppConversationStatus.PENDING_HUMAN:
      return CommunicationConversationStatus.HUMAN_REQUIRED;
    case WhatsAppConversationStatus.CLOSED:
      return CommunicationConversationStatus.RESOLVED;
    default:
      return undefined;
  }
}

export function mapLifecycleStatusToEventType(
  status: MetaWhatsAppLifecycleStatus,
): CommunicationEventType {
  switch (status) {
    case 'DELIVERED':
      return CommunicationEventType.MESSAGE_DELIVERED;
    case 'READ':
      return CommunicationEventType.MESSAGE_READ;
    case 'FAILED':
      return CommunicationEventType.MESSAGE_FAILED;
    default:
      throw new CommunicationNormalizationError(
        CommunicationNormalizationErrorCode.INVALID_NORMALIZED_INPUT,
        `unsupported WhatsApp lifecycle status: ${status as string}`,
      );
  }
}

export function resolveOutboundActorType(
  message: WhatsAppMessage,
): CommunicationActorType | undefined {
  if (message.aiGenerated) {
    return CommunicationActorType.AI_AGENT;
  }
  if (message.senderType === 'human') {
    return CommunicationActorType.USER;
  }
  if (message.senderType === 'system') {
    return CommunicationActorType.SYSTEM;
  }
  return undefined;
}

export function sanitizeFailureCode(reason: string): string {
  const normalized = reason
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return normalized || 'WHATSAPP_DELIVERY_FAILED';
}

/** ISO timestamp from persisted native row — stable per transition occurrence. */
export function resolveNativeTransitionVersion(conversation: WhatsAppConversation): string {
  if (!conversation.updatedAt) {
    throw new CommunicationNormalizationError(
      CommunicationNormalizationErrorCode.INVALID_NORMALIZED_INPUT,
      'WhatsApp transition projection requires persisted conversation.updatedAt',
    );
  }
  return conversation.updatedAt.toISOString();
}

export function resolveNativeTransitionOccurredAt(conversation: WhatsAppConversation): Date {
  return new Date(resolveNativeTransitionVersion(conversation));
}

export function buildWhatsAppTransitionProviderEventId(
  prefix: 'wa-human' | 'wa-resolved',
  conversation: WhatsAppConversation,
): string {
  return `${prefix}:${conversation.id}:${resolveNativeTransitionVersion(conversation)}`;
}
