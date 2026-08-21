import { Injectable } from '@nestjs/common';
import {
  CommunicationActorType,
  CommunicationChannel,
  CommunicationConversationStatus,
  CommunicationDirection,
  CommunicationEventType,
  CommunicationProviderIdentity,
  SmsConversation,
  SmsMessage,
  SmsMessageDeliveryStatus,
} from '@prisma/client';
import { buildCanonicalIdempotencyKey } from '../../normalization/communication-idempotency';
import { CommunicationNormalizationError, CommunicationNormalizationErrorCode } from '../../normalization/communication-normalization.errors';
import type { NormalizedCommunicationInput } from '../../normalization/communication-normalization.types';
import type { MessagingProviderNormalizationPort } from '../../ports/messaging-normalization.port';
import type {
  SentDmSmsInboundProjectionSource,
  SentDmSmsOutboundProjectionSource,
  SentDmSmsStatusProjectionSource,
} from './sentdm-sms-communication.types';

@Injectable()
export class SentDmSmsCommunicationAdapter implements MessagingProviderNormalizationPort {
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

  fromInbound(source: SentDmSmsInboundProjectionSource): NormalizedCommunicationInput {
    const { conversation, message } = source;
    this.assertNativeConversation(conversation, message);

    const occurredAt = source.occurredAt ?? message.createdAt;
    const providerMessageId = this.requireProviderMessageId(message);
    const providerEventId = source.webhookExternalEventId.trim();

    return {
      envelope: this.buildEnvelope(conversation, { includeInitialStatus: true }),
      event: {
        eventType: CommunicationEventType.MESSAGE_RECEIVED,
        occurredAt,
        direction: CommunicationDirection.INBOUND,
        providerIdentity: CommunicationProviderIdentity.SENT_DM,
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
      projection: { unreadDelta: 1 },
    };
  }

  fromOutboundAccepted(source: SentDmSmsOutboundProjectionSource): NormalizedCommunicationInput {
    const { conversation, message } = source;
    this.assertNativeConversation(conversation, message);

    if (
      message.status !== SmsMessageDeliveryStatus.QUEUED
      && message.status !== SmsMessageDeliveryStatus.SENT
    ) {
      throw new CommunicationNormalizationError(
        CommunicationNormalizationErrorCode.INVALID_NORMALIZED_INPUT,
        'outbound projection requires accepted native SMS message',
      );
    }

    const occurredAt = source.occurredAt ?? message.acceptedAt ?? message.updatedAt ?? message.createdAt;
    const providerMessageId = this.requireProviderMessageId(message);
    const providerEventId = `sms-sent:${message.id}`;

    return {
      envelope: this.buildEnvelope(conversation, { includeInitialStatus: false }),
      event: {
        eventType: CommunicationEventType.MESSAGE_SENT,
        occurredAt,
        direction: CommunicationDirection.OUTBOUND,
        providerIdentity: CommunicationProviderIdentity.SENT_DM,
        providerEventId,
        providerMessageId,
        idempotencyKey: this.buildIdempotencyKey({
          organizationId: conversation.organizationId,
          nativeConversationId: conversation.id,
          eventType: CommunicationEventType.MESSAGE_SENT,
          providerEventId,
          providerMessageId,
        }),
        actorType: resolveOutboundActorType(message),
        metadata: message.providerStatus
          ? { providerLifecycleState: message.providerStatus }
          : undefined,
      },
    };
  }

  fromStatusUpdate(source: SentDmSmsStatusProjectionSource): NormalizedCommunicationInput {
    const { conversation, message, status } = source;
    this.assertNativeConversation(conversation, message);

    const eventType =
      status === 'FAILED'
        ? CommunicationEventType.MESSAGE_FAILED
        : CommunicationEventType.MESSAGE_DELIVERED;
    const providerMessageId = this.requireProviderMessageId(message);
    const providerEventId = source.webhookExternalEventId.trim();

    return {
      envelope: this.buildEnvelope(conversation, { includeInitialStatus: false }),
      event: {
        eventType,
        occurredAt: source.occurredAt ?? message.updatedAt,
        direction: CommunicationDirection.OUTBOUND,
        providerIdentity: CommunicationProviderIdentity.SENT_DM,
        providerEventId,
        providerMessageId,
        idempotencyKey: this.buildIdempotencyKey({
          organizationId: conversation.organizationId,
          nativeConversationId: conversation.id,
          eventType,
          providerEventId,
          providerMessageId,
        }),
        actorType: resolveOutboundActorType(message),
        metadata:
          status === 'FAILED' && source.failureCode
            ? { failureCode: sanitizeFailureCode(source.failureCode) }
            : message.providerStatus
              ? { providerLifecycleState: message.providerStatus }
              : undefined,
      },
    };
  }

  private buildEnvelope(
    conversation: SmsConversation,
    options: { includeInitialStatus: boolean },
  ): NormalizedCommunicationInput['envelope'] {
    return {
      organizationId: conversation.organizationId,
      channel: CommunicationChannel.SMS,
      nativeConversationId: conversation.id,
      initialStatus: options.includeInitialStatus
        ? CommunicationConversationStatus.AI_ACTIVE
        : undefined,
      initialContext: {
        customerId: conversation.customerId,
        bookingId: conversation.bookingId,
        vehicleId: conversation.vehicleId,
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
      channel: CommunicationChannel.SMS,
      providerIdentity: CommunicationProviderIdentity.SENT_DM,
      eventType: input.eventType,
      nativeConversationId: input.nativeConversationId,
      providerEventId: input.providerEventId,
      providerMessageId: input.providerMessageId,
    });
  }

  private assertNativeConversation(conversation: SmsConversation, message: SmsMessage): void {
    if (message.organizationId !== conversation.organizationId) {
      throw new CommunicationNormalizationError(
        CommunicationNormalizationErrorCode.INVALID_NORMALIZED_INPUT,
        'SMS message organization does not match conversation',
      );
    }
    if (message.conversationId !== conversation.id) {
      throw new CommunicationNormalizationError(
        CommunicationNormalizationErrorCode.INVALID_NORMALIZED_INPUT,
        'SMS message conversation mismatch',
      );
    }
  }

  private requireProviderMessageId(message: SmsMessage): string {
    const id = message.providerMessageId?.trim();
    if (!id) {
      throw new CommunicationNormalizationError(
        CommunicationNormalizationErrorCode.INVALID_NORMALIZED_INPUT,
        'SMS projection requires providerMessageId',
      );
    }
    return id;
  }

  private assertInboundSource(source: unknown): SentDmSmsInboundProjectionSource {
    if (!source || typeof source !== 'object') {
      throw new CommunicationNormalizationError(
        CommunicationNormalizationErrorCode.INVALID_NORMALIZED_INPUT,
        'invalid SMS inbound projection source',
      );
    }
    return source as SentDmSmsInboundProjectionSource;
  }

  private assertOutboundSource(source: unknown): SentDmSmsOutboundProjectionSource {
    if (!source || typeof source !== 'object') {
      throw new CommunicationNormalizationError(
        CommunicationNormalizationErrorCode.INVALID_NORMALIZED_INPUT,
        'invalid SMS outbound projection source',
      );
    }
    return source as SentDmSmsOutboundProjectionSource;
  }

  private assertStatusSource(source: unknown): SentDmSmsStatusProjectionSource {
    if (!source || typeof source !== 'object') {
      throw new CommunicationNormalizationError(
        CommunicationNormalizationErrorCode.INVALID_NORMALIZED_INPUT,
        'invalid SMS status projection source',
      );
    }
    return source as SentDmSmsStatusProjectionSource;
  }
}

function resolveOutboundActorType(message: SmsMessage): CommunicationActorType {
  switch (message.senderType) {
    case 'ai_agent':
      return CommunicationActorType.AI_AGENT;
    case 'user':
      return CommunicationActorType.USER;
    case 'system':
    default:
      return CommunicationActorType.SYSTEM;
  }
}

function sanitizeFailureCode(value: string): string {
  return value.trim().slice(0, 64);
}
