import { Injectable, Logger } from '@nestjs/common';
import { WhatsAppMessageDeliveryStatus } from '@prisma/client';
import { CommunicationProjectionFeatureService } from '../../communication-projection-feature.service';
import { CommunicationProjectionService } from '../../communication-projection.service';
import { CommunicationNormalizationError } from '../../normalization/communication-normalization.errors';
import { MetaWhatsAppCommunicationAdapter } from './meta-whatsapp-communication.adapter';
import type {
  MetaWhatsAppHumanRequiredProjectionSource,
  MetaWhatsAppInboundProjectionSource,
  MetaWhatsAppOutboundProjectionSource,
  MetaWhatsAppStatusProjectionSource,
} from './meta-whatsapp-communication.types';

@Injectable()
export class WhatsAppCommunicationProjectionIntegration {
  private readonly logger = new Logger(WhatsAppCommunicationProjectionIntegration.name);

  constructor(
    private readonly featureFlags: CommunicationProjectionFeatureService,
    private readonly adapter: MetaWhatsAppCommunicationAdapter,
    private readonly projection: CommunicationProjectionService,
  ) {}

  isEnabled(organizationId: string): boolean {
    return this.featureFlags.isWhatsAppProjectionEnabled(organizationId);
  }

  async projectInbound(source: MetaWhatsAppInboundProjectionSource): Promise<void> {
    if (!this.isEnabled(source.conversation.organizationId)) {
      return;
    }
    await this.projectSafely(
      () => this.projection.projectNormalizedInput(this.adapter.fromInbound(source)),
      {
        organizationId: source.conversation.organizationId,
        nativeConversationId: source.conversation.id,
        providerMessageId: source.message.providerMessageId,
        providerEventId: source.webhookExternalEventId ?? null,
        eventType: 'MESSAGE_RECEIVED',
      },
    );
  }

  async projectOutboundAccepted(source: MetaWhatsAppOutboundProjectionSource): Promise<void> {
    if (!this.isEnabled(source.conversation.organizationId)) {
      return;
    }
    if (source.message.status !== WhatsAppMessageDeliveryStatus.SENT) {
      return;
    }
    await this.projectSafely(
      () => this.projection.projectNormalizedInput(this.adapter.fromOutboundAccepted(source)),
      {
        organizationId: source.conversation.organizationId,
        nativeConversationId: source.conversation.id,
        providerMessageId: source.message.providerMessageId,
        providerEventId: `wa-sent:${source.message.id}`,
        eventType: 'MESSAGE_SENT',
      },
    );
  }

  async projectOutboundFailed(source: MetaWhatsAppOutboundProjectionSource): Promise<void> {
    if (!this.isEnabled(source.conversation.organizationId)) {
      return;
    }
    if (source.message.status !== WhatsAppMessageDeliveryStatus.FAILED) {
      return;
    }
    await this.projectSafely(
      () => this.projection.projectNormalizedInput(this.adapter.fromOutboundFailed(source)),
      {
        organizationId: source.conversation.organizationId,
        nativeConversationId: source.conversation.id,
        providerMessageId: source.message.providerMessageId,
        providerEventId: `wa-failed:${source.message.id}`,
        eventType: 'MESSAGE_FAILED',
      },
    );
  }

  async projectStatusUpdate(source: MetaWhatsAppStatusProjectionSource): Promise<void> {
    if (!this.isEnabled(source.conversation.organizationId)) {
      return;
    }
    const normalized =
      source.status === 'FAILED'
        ? this.adapter.normalizeFailure(source)
        : this.adapter.normalizeDeliveryUpdate(source);

    await this.projectSafely(
      () => this.projection.projectNormalizedInput(normalized),
      {
        organizationId: source.conversation.organizationId,
        nativeConversationId: source.conversation.id,
        providerMessageId: source.message.providerMessageId,
        providerEventId: source.webhookExternalEventId,
        eventType: normalized.event.eventType,
      },
    );
  }

  async projectHumanRequired(source: MetaWhatsAppHumanRequiredProjectionSource): Promise<void> {
    if (!this.isEnabled(source.conversation.organizationId)) {
      return;
    }
    await this.projectSafely(
      () => this.projection.projectNormalizedInput(this.adapter.fromHumanRequired(source)),
      {
        organizationId: source.conversation.organizationId,
        nativeConversationId: source.conversation.id,
        providerMessageId: null,
        providerEventId: source.webhookExternalEventId ?? null,
        eventType: 'HUMAN_REQUIRED',
      },
    );
  }

  private async projectSafely(
    operation: () => Promise<unknown>,
    context: {
      organizationId: string;
      nativeConversationId: string;
      providerMessageId: string | null | undefined;
      providerEventId: string | null | undefined;
      eventType: string;
    },
  ): Promise<void> {
    try {
      await operation();
    } catch (error) {
      const code =
        error instanceof CommunicationNormalizationError
          ? error.code
          : 'PROJECTION_FAILURE';
      this.logger.warn(
        JSON.stringify({
          msg: 'whatsapp_canonical_projection_failed',
          organizationId: context.organizationId,
          channel: 'WHATSAPP',
          nativeConversationId: context.nativeConversationId,
          providerMessageId: context.providerMessageId ?? null,
          providerEventId: context.providerEventId ?? null,
          eventType: context.eventType,
          errorCode: code,
          errorMessage: error instanceof Error ? error.message : 'unknown',
        }),
      );
    }
  }
}
