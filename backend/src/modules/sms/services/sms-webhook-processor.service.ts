import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { SmsCommunicationProjectionIntegration } from '@modules/communication/adapters/sms/sms-communication-projection.integration';
import { buildSmsWebhookExternalEventId } from '@modules/communication/adapters/sms/sentdm-sms-communication.shared';
import { SmsConversationRepository } from '../repositories/sms-conversation.repository';
import { SmsMessageRepository } from '../repositories/sms-message.repository';
import { SmsWebhookEventRepository } from '../repositories/sms-webhook-event.repository';
import type { VerifiedSmsWebhookIngress } from './sms-webhook-security.service';
import {
  isInboundReceivedEvent,
  isTerminalDeliveryEvent,
  mapSentDmEventToMessageStatus,
} from '../providers/sentdm-webhook.parser';
import { normalizePhoneNumber } from '../utils/sms-phone.util';
import { SmsMessageDeliveryStatus } from '@prisma/client';
import { SmsConfigService } from './sms-config.service';

type DeliveryWebhookResult =
  | { kind: 'updated'; transitioned: boolean }
  | { kind: 'unknown_message' };

@Injectable()
export class SmsWebhookProcessorService {
  private readonly logger = new Logger(SmsWebhookProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: SmsConfigService,
    private readonly webhookEvents: SmsWebhookEventRepository,
    private readonly conversations: SmsConversationRepository,
    private readonly messages: SmsMessageRepository,
    private readonly projection: SmsCommunicationProjectionIntegration,
  ) {}

  async processVerifiedIngress(verified: VerifiedSmsWebhookIngress): Promise<void> {
    if (!this.configService.isRuntimeEnabled()) {
      this.logger.warn({
        msg: 'SMS webhook ignored — runtime disabled',
        organizationId: verified.organizationId,
        webhookEndpointId: verified.webhookEndpointId,
      });
      return;
    }

    const providerMessageId = verified.parsed.payload.message_id?.trim();
    const messageStatus = mapSentDmEventToMessageStatus(
      verified.parsed.event,
      verified.parsed.payload.message_status,
    );
    if (!providerMessageId) {
      this.logger.warn({
        msg: 'SMS webhook missing provider message id',
        organizationId: verified.organizationId,
        eventType: verified.parsed.event,
      });
      return;
    }

    const externalEventId = buildSmsWebhookExternalEventId(providerMessageId, messageStatus);
    const existing = await this.webhookEvents.findByExternalEventId(externalEventId);
    if (existing?.processedAt) {
      return;
    }

    const eventRow =
      existing ??
      (await this.webhookEvents.beginProcessing({
        organizationId: verified.organizationId,
        webhookEndpointId: verified.webhookEndpointId,
        externalEventId,
        eventType: verified.parsed.event,
        signatureValid: true,
      }));

    const claim = await this.webhookEvents.tryClaimProcessing(eventRow.id);
    if (claim.outcome === 'already_processed' || claim.outcome === 'held_by_peer') {
      return;
    }

    const isDeliveryEvent =
      isTerminalDeliveryEvent(verified.parsed.event) || verified.parsed.event === 'message.sent';

    try {
      if (isInboundReceivedEvent(verified.parsed.event)) {
        await this.handleInbound(verified, providerMessageId, externalEventId);
      } else if (isDeliveryEvent) {
        const deliveryResult = await this.handleDeliveryUpdate(
          verified,
          providerMessageId,
          messageStatus,
          externalEventId,
        );
        if (deliveryResult.kind === 'unknown_message') {
          await this.webhookEvents.markUnknownProviderMessage(eventRow.id);
          this.logger.warn({
            msg: 'SMS delivery webhook uncorrelated — left unprocessed for retry/reconciliation',
            organizationId: verified.organizationId,
            providerMessageId,
            eventType: verified.parsed.event,
          });
          return;
        }
      }

      await this.webhookEvents.markProcessed(eventRow.id);
      await this.prisma.orgSmsConfig.updateMany({
        where: { organizationId: verified.organizationId },
        data: { lastWebhookAt: new Date() },
      });
    } catch (err: unknown) {
      await this.webhookEvents.markProcessingError(eventRow.id);
      this.logger.error({
        msg: 'SMS webhook native processing failed',
        organizationId: verified.organizationId,
        webhookEndpointId: verified.webhookEndpointId,
        providerMessageId,
        eventType: verified.parsed.event,
      });
      throw err;
    }
  }

  private async handleInbound(
    verified: VerifiedSmsWebhookIngress,
    providerMessageId: string,
    externalEventId: string,
  ) {
    const contactPhoneRaw = verified.parsed.payload.inbound_number?.trim();
    if (!contactPhoneRaw) {
      return;
    }
    const phoneNormalized = normalizePhoneNumber(contactPhoneRaw);
    if (!phoneNormalized) {
      return;
    }

    const content = verified.parsed.payload.text?.trim() ?? '';
    const conversation = await this.conversations.ensureConversation({
      organizationId: verified.organizationId,
      contactPhone: contactPhoneRaw.startsWith('+') ? contactPhoneRaw : `+${phoneNormalized}`,
      contactPhoneNormalized: phoneNormalized,
    });

    const existing = await this.messages.findByProviderMessageId(providerMessageId, verified.organizationId);
    if (existing) {
      return;
    }

    const { message, created } = await this.messages.createInboundMessage({
      organizationId: verified.organizationId,
      conversationId: conversation.id,
      content,
      providerMessageId,
      businessOperationId: `inbound:${providerMessageId}`,
      deliveredAt: verified.occurredAt,
    });

    if (created) {
      await this.conversations.recordInboundActivity({
        conversationId: conversation.id,
        organizationId: verified.organizationId,
        preview: content,
        occurredAt: verified.occurredAt,
        unreadDelta: 1,
      });
    }

    try {
      await this.projection.projectInbound({
        conversation,
        message,
        webhookExternalEventId: externalEventId,
        occurredAt: verified.occurredAt,
      });
    } catch {
      this.logger.error({
        msg: 'SMS inbound canonical projection failed',
        organizationId: verified.organizationId,
        providerMessageId,
        eventType: verified.parsed.event,
      });
    }
  }

  private async handleDeliveryUpdate(
    verified: VerifiedSmsWebhookIngress,
    providerMessageId: string,
    messageStatus: string,
    externalEventId: string,
  ): Promise<DeliveryWebhookResult> {
    const before = await this.messages.findByProviderMessageId(providerMessageId, verified.organizationId);
    if (!before) {
      return { kind: 'unknown_message' };
    }

    const updated = await this.messages.applyDeliveryStatusUpdateByProviderMessageId({
      organizationId: verified.organizationId,
      providerMessageId,
      providerStatus: messageStatus,
      occurredAt: verified.occurredAt,
      failureCode: verified.parsed.payload.failure_code ?? null,
    });
    if (!updated) {
      return { kind: 'unknown_message' };
    }

    const transitioned = updated.status !== before.status;

    if (updated.status === SmsMessageDeliveryStatus.DELIVERED && transitioned) {
      try {
        await this.projection.projectStatusUpdate({
          conversation: updated.conversation,
          message: updated,
          status: 'DELIVERED',
          webhookExternalEventId: externalEventId,
          occurredAt: verified.occurredAt,
        });
      } catch {
        this.logger.error({
          msg: 'SMS delivery canonical projection failed',
          organizationId: verified.organizationId,
          providerMessageId,
          eventType: verified.parsed.event,
        });
      }
      return { kind: 'updated', transitioned: true };
    }

    if (updated.status === SmsMessageDeliveryStatus.FAILED && transitioned) {
      try {
        await this.projection.projectStatusUpdate({
          conversation: updated.conversation,
          message: updated,
          status: 'FAILED',
          webhookExternalEventId: externalEventId,
          failureCode: verified.parsed.payload.failure_code ?? undefined,
          occurredAt: verified.occurredAt,
        });
      } catch {
        this.logger.error({
          msg: 'SMS failure canonical projection failed',
          organizationId: verified.organizationId,
          providerMessageId,
          eventType: verified.parsed.event,
        });
      }
      return { kind: 'updated', transitioned: true };
    }

    return { kind: 'updated', transitioned };
  }
}
