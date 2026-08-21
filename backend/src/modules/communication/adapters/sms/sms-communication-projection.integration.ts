import { Injectable, Logger } from '@nestjs/common';
import { SmsMessageDeliveryStatus } from '@prisma/client';
import { CommunicationProjectionFeatureService } from '../../communication-projection-feature.service';
import { CommunicationProjectionService } from '../../communication-projection.service';
import { CommunicationNormalizationError } from '../../normalization/communication-normalization.errors';
import { SentDmSmsCommunicationAdapter } from './sentdm-sms-communication.adapter';
import type {
  SentDmSmsInboundProjectionSource,
  SentDmSmsOutboundProjectionSource,
  SentDmSmsStatusProjectionSource,
} from './sentdm-sms-communication.types';

@Injectable()
export class SmsCommunicationProjectionIntegration {
  private readonly logger = new Logger(SmsCommunicationProjectionIntegration.name);

  constructor(
    private readonly featureFlags: CommunicationProjectionFeatureService,
    private readonly adapter: SentDmSmsCommunicationAdapter,
    private readonly projection: CommunicationProjectionService,
  ) {}

  isEnabled(organizationId: string): boolean {
    return this.featureFlags.isSmsProjectionEnabled(organizationId);
  }

  async projectInbound(source: SentDmSmsInboundProjectionSource): Promise<void> {
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
        providerEventId: source.webhookExternalEventId,
        eventType: 'MESSAGE_RECEIVED',
      },
    );
  }

  async projectOutboundAccepted(source: SentDmSmsOutboundProjectionSource): Promise<void> {
    await this.projectSafely(
      async () => {
        if (!this.isEnabled(source.conversation.organizationId)) {
          return;
        }
        if (
          source.message.status !== SmsMessageDeliveryStatus.QUEUED
          && source.message.status !== SmsMessageDeliveryStatus.SENT
        ) {
          return;
        }
        await this.projection.projectNormalizedInput(this.adapter.fromOutboundAccepted(source));
      },
      {
        organizationId: source.conversation.organizationId,
        nativeConversationId: source.conversation.id,
        providerMessageId: source.message.providerMessageId,
        providerEventId: `sms-sent:${source.message.id}`,
        eventType: 'MESSAGE_SENT',
      },
    );
  }

  async projectStatusUpdate(source: SentDmSmsStatusProjectionSource): Promise<void> {
    const eventType = source.status === 'FAILED' ? 'MESSAGE_FAILED' : 'MESSAGE_DELIVERED';
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
        providerEventId: source.webhookExternalEventId,
        eventType,
      },
    );
  }

  private async projectSafely(
    fn: () => Promise<void>,
    context: {
      organizationId: string;
      nativeConversationId: string;
      providerMessageId?: string | null;
      providerEventId?: string | null;
      eventType: string;
    },
  ): Promise<void> {
    try {
      await fn();
    } catch (err: unknown) {
      if (err instanceof CommunicationNormalizationError) {
        this.logger.warn({
          msg: 'SMS canonical projection skipped',
          organizationId: context.organizationId,
          nativeConversationId: context.nativeConversationId,
          providerMessageId: context.providerMessageId ?? undefined,
          providerEventId: context.providerEventId ?? undefined,
          eventType: context.eventType,
          errorCode: err.code,
        });
        return;
      }
      this.logger.error({
        msg: 'SMS canonical projection failed',
        organizationId: context.organizationId,
        nativeConversationId: context.nativeConversationId,
        providerMessageId: context.providerMessageId ?? undefined,
        providerEventId: context.providerEventId ?? undefined,
        eventType: context.eventType,
      });
    }
  }
}
