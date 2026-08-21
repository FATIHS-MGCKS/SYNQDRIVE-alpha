import { Injectable, Logger } from '@nestjs/common';
import { WhatsAppMessageDeliveryStatus } from '@prisma/client';
import { CommunicationProjectionFeatureService } from '../../communication-projection-feature.service';
import { CommunicationProjectionService } from '../../communication-projection.service';
import { CommunicationNormalizationError } from '../../normalization/communication-normalization.errors';
import { MetaWhatsAppCommunicationAdapter, buildWhatsAppTransitionProviderEventId } from './meta-whatsapp-communication.adapter';
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
    await this.projectSafely(
      async () => {
        if (!this.isEnabled(source.conversation.organizationId)) {
          return;
        }
        await this.projection.projectNormalizedInput(this.adapter.fromInbound(source));
      },
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
    await this.projectSafely(
      async () => {
        if (!this.isEnabled(source.conversation.organizationId)) {
          return;
        }
        if (source.message.status !== WhatsAppMessageDeliveryStatus.SENT) {
          return;
        }
        await this.projection.projectNormalizedInput(this.adapter.fromOutboundAccepted(source));
      },
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
    await this.projectSafely(
      async () => {
        if (!this.isEnabled(source.conversation.organizationId)) {
          return;
        }
        if (source.message.status !== WhatsAppMessageDeliveryStatus.FAILED) {
          return;
        }
        await this.projection.projectNormalizedInput(this.adapter.fromOutboundFailed(source));
      },
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
    const providerEventId =
      source.status === 'FAILED'
        ? `wa-failed:${source.message.id}`
        : source.webhookExternalEventId;

    await this.projectSafely(
      async () => {
        if (!this.isEnabled(source.conversation.organizationId)) {
          return;
        }
        const normalized =
          source.status === 'FAILED'
            ? this.adapter.normalizeFailure(source)
            : this.adapter.normalizeDeliveryUpdate(source);
        await this.projection.projectNormalizedInput(normalized);
      },
      {
        organizationId: source.conversation.organizationId,
        nativeConversationId: source.conversation.id,
        providerMessageId: source.message.providerMessageId,
        providerEventId,
        eventType: source.status === 'FAILED' ? 'MESSAGE_FAILED' : source.status,
      },
    );
  }

  async projectHumanRequired(source: MetaWhatsAppHumanRequiredProjectionSource): Promise<void> {
    await this.projectSafely(
      async () => {
        if (!this.isEnabled(source.conversation.organizationId)) {
          return;
        }
        await this.projection.projectNormalizedInput(this.adapter.fromHumanRequired(source));
      },
      {
        organizationId: source.conversation.organizationId,
        nativeConversationId: source.conversation.id,
        providerMessageId: null,
        providerEventId:
          source.webhookExternalEventId ??
          buildWhatsAppTransitionProviderEventId('wa-human', source.conversation),
        eventType: 'HUMAN_REQUIRED',
      },
    );
  }

  async projectConversationResolved(
    source: MetaWhatsAppHumanRequiredProjectionSource,
  ): Promise<void> {
    await this.projectSafely(
      async () => {
        if (!this.isEnabled(source.conversation.organizationId)) {
          return;
        }
        await this.projection.projectNormalizedInput(
          this.adapter.fromConversationResolved(source),
        );
      },
      {
        organizationId: source.conversation.organizationId,
        nativeConversationId: source.conversation.id,
        providerMessageId: null,
        providerEventId:
          source.webhookExternalEventId ??
          buildWhatsAppTransitionProviderEventId('wa-resolved', source.conversation),
        eventType: 'CONVERSATION_RESOLVED',
      },
    );
  }

  private async projectSafely(
    operation: () => Promise<void>,
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
      const errorCode =
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
          errorCode,
        }),
      );
    }
  }
}
