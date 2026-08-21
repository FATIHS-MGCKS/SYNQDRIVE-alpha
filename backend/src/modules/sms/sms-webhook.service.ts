import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Prisma, SmsMessageDeliveryStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { SmsCommunicationProjectionIntegration } from '@modules/communication/adapters/sms/sms-communication-projection.integration';
import { buildSmsWebhookExternalEventId } from '@modules/communication/adapters/sms/sentdm-sms-communication.shared';
import { normalizePhoneNumber } from '@modules/whatsapp/utils/whatsapp-phone.util';
import { SentDmSmsAdapter } from './providers/sentdm-sms.adapter';
import {
  isInboundReceivedEvent,
  isTerminalDeliveryEvent,
  mapSentDmEventToMessageStatus,
  parseSentDmWebhookEvent,
} from './providers/sentdm-webhook.parser';
import { verifySentDmWebhookSignature } from './providers/sentdm-webhook-verification';

@Injectable()
export class SmsWebhookService {
  private readonly logger = new Logger(SmsWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sentDmAdapter: SentDmSmsAdapter,
    private readonly projection: SmsCommunicationProjectionIntegration,
  ) {}

  async receiveWebhook(
    rawBody: Buffer,
    body: unknown,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<void> {
    const webhookId = headerValue(headers, 'x-webhook-id');
    const timestamp = headerValue(headers, 'x-webhook-timestamp');
    const signature = headerValue(headers, 'x-webhook-signature');
    const eventTypeHeader = headerValue(headers, 'x-webhook-event-type');

    const parsed = parseSentDmWebhookEvent(body);
    if (!parsed) {
      this.logger.warn({ msg: 'SMS webhook ignored: unparseable payload' });
      return;
    }

    const providerMessageId = parsed.payload.message_id?.trim();
    const messageStatus = mapSentDmEventToMessageStatus(
      parsed.event,
      parsed.payload.message_status,
    );

    let orgConfig = webhookId
      ? await this.prisma.orgSmsConfig.findFirst({
          where: { webhookEndpointId: webhookId, isActive: true },
        })
      : null;

    let message = providerMessageId
      ? await this.prisma.smsMessage.findUnique({
          where: { providerMessageId },
          include: { conversation: true },
        })
      : null;

    if (message && orgConfig && message.organizationId !== orgConfig.organizationId) {
      this.logger.warn({
        msg: 'SMS webhook cross-org correlation blocked',
        organizationId: orgConfig.organizationId,
        providerMessageId,
      });
      return;
    }

    if (!orgConfig && message) {
      orgConfig = await this.prisma.orgSmsConfig.findUnique({
        where: { organizationId: message.organizationId },
      });
    }

    const organizationId = orgConfig?.organizationId ?? message?.organizationId ?? null;
    const signingSecret = organizationId
      ? this.sentDmAdapter.resolveWebhookSigningSecret(organizationId, orgConfig)
      : null;

    const signatureValid =
      signingSecret && webhookId && timestamp && signature
        ? verifySentDmWebhookSignature({
            rawBody,
            webhookId,
            timestamp,
            signatureHeader: signature,
            signingSecret,
          })
        : false;

    if (signingSecret && !signatureValid) {
      throw new UnauthorizedException('Invalid SMS webhook signature');
    }

    if (!organizationId) {
      this.logger.warn({
        msg: 'SMS webhook ignored: tenant unresolved',
        providerMessageId: providerMessageId ?? undefined,
        eventType: eventTypeHeader ?? parsed.event,
      });
      return;
    }

    if (!providerMessageId) {
      this.logger.warn({
        msg: 'SMS webhook ignored: missing message_id',
        organizationId,
        eventType: parsed.event,
      });
      return;
    }

    const externalEventId = buildSmsWebhookExternalEventId(providerMessageId, messageStatus);
    const existing = await this.prisma.smsWebhookEvent.findUnique({
      where: { externalEventId },
    });
    if (existing?.processedAt) {
      return;
    }

    let webhookEvent = existing;
    if (!webhookEvent) {
      try {
        webhookEvent = await this.prisma.smsWebhookEvent.create({
          data: {
            organizationId,
            webhookEndpointId: webhookId ?? null,
            externalEventId,
            eventType: parsed.event,
            signatureValid: signingSecret ? signatureValid : null,
          },
        });
      } catch (err: unknown) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          return;
        }
        throw err;
      }
    }

    try {
      if (isInboundReceivedEvent(parsed.event)) {
        await this.handleInbound({
          organizationId,
          providerMessageId,
          inboundNumber: parsed.payload.inbound_number,
          text: parsed.payload.text,
          externalEventId,
          occurredAt: new Date(),
        });
      } else if (isTerminalDeliveryEvent(parsed.event)) {
        await this.handleDeliveryUpdate({
          organizationId,
          providerMessageId,
          status: parsed.event === 'message.failed' ? 'FAILED' : 'DELIVERED',
          externalEventId,
          failureCode: parsed.payload.failure_code ?? null,
          occurredAt: new Date(),
        });
      }

      await this.prisma.smsWebhookEvent.update({
        where: { id: webhookEvent.id },
        data: { processedAt: new Date(), processingError: null },
      });

      if (orgConfig) {
        await this.prisma.orgSmsConfig.update({
          where: { organizationId },
          data: { lastWebhookAt: new Date() },
        });
      }
    } catch (err: unknown) {
      const safeMessage = err instanceof Error ? 'processing_failed' : 'processing_failed';
      await this.prisma.smsWebhookEvent.update({
        where: { id: webhookEvent.id },
        data: { processingError: safeMessage },
      });
      this.logger.error({
        msg: 'SMS webhook processing error',
        organizationId,
        providerMessageId,
        eventType: parsed.event,
      });
    }
  }

  private async handleDeliveryUpdate(input: {
    organizationId: string;
    providerMessageId: string;
    status: 'DELIVERED' | 'FAILED';
    externalEventId: string;
    failureCode?: string | null;
    occurredAt: Date;
  }) {
    const message = await this.prisma.smsMessage.findFirst({
      where: {
        providerMessageId: input.providerMessageId,
        organizationId: input.organizationId,
      },
      include: { conversation: true },
    });
    if (!message) {
      this.logger.warn({
        msg: 'SMS webhook status for unknown message',
        organizationId: input.organizationId,
        providerMessageId: input.providerMessageId,
      });
      return;
    }

    if (
      message.status === SmsMessageDeliveryStatus.DELIVERED
      && input.status === 'DELIVERED'
    ) {
      return;
    }
    if (message.status === SmsMessageDeliveryStatus.FAILED && input.status === 'FAILED') {
      return;
    }

    const updated = await this.prisma.smsMessage.update({
      where: { id: message.id },
      data:
        input.status === 'DELIVERED'
          ? {
              status: SmsMessageDeliveryStatus.DELIVERED,
              providerStatus: 'DELIVERED',
              deliveredAt: input.occurredAt,
            }
          : {
              status: SmsMessageDeliveryStatus.FAILED,
              providerStatus: 'FAILED',
              failureCode: input.failureCode?.slice(0, 64) ?? null,
              failureReason: 'delivery_failed',
              failedAt: input.occurredAt,
            },
      include: { conversation: true },
    });

    await this.projection.projectStatusUpdate({
      conversation: updated.conversation,
      message: updated,
      status: input.status,
      occurredAt: input.occurredAt,
      webhookExternalEventId: input.externalEventId,
      failureCode: input.failureCode,
    });
  }

  private async handleInbound(input: {
    organizationId: string;
    providerMessageId: string;
    inboundNumber?: string;
    text?: string;
    externalEventId: string;
    occurredAt: Date;
  }) {
    const existingMsg = await this.prisma.smsMessage.findUnique({
      where: { providerMessageId: input.providerMessageId },
    });
    if (existingMsg) {
      return;
    }

    const phoneNormalized = normalizePhoneNumber(input.inboundNumber);
    if (!phoneNormalized) {
      return;
    }

    let conversation = await this.prisma.smsConversation.findUnique({
      where: {
        organizationId_contactPhoneNormalized: {
          organizationId: input.organizationId,
          contactPhoneNormalized: phoneNormalized,
        },
      },
    });

    if (!conversation) {
      conversation = await this.prisma.smsConversation.create({
        data: {
          organizationId: input.organizationId,
          contactPhone: input.inboundNumber ?? phoneNormalized,
          contactPhoneNormalized: phoneNormalized,
          lastMessageAt: input.occurredAt,
          lastCustomerMessageAt: input.occurredAt,
          lastMessagePreview: (input.text ?? '').slice(0, 120),
          unreadCount: 1,
        },
      });
    } else {
      conversation = await this.prisma.smsConversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: input.occurredAt,
          lastCustomerMessageAt: input.occurredAt,
          lastMessagePreview: (input.text ?? '').slice(0, 120),
          unreadCount: { increment: 1 },
        },
      });
    }

    const message = await this.prisma.smsMessage.create({
      data: {
        organizationId: input.organizationId,
        conversationId: conversation.id,
        direction: 'incoming',
        senderType: 'customer',
        content: input.text ?? '',
        providerMessageId: input.providerMessageId,
        businessOperationId: `inbound:${input.providerMessageId}`,
        providerStatus: 'RECEIVED',
        status: SmsMessageDeliveryStatus.DELIVERED,
        deliveredAt: input.occurredAt,
      },
      include: { conversation: true },
    });

    await this.projection.projectInbound({
      conversation: message.conversation,
      message,
      occurredAt: input.occurredAt,
      webhookExternalEventId: input.externalEventId,
    });
  }
}

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string {
  const raw = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(raw)) {
    return raw[0] ?? '';
  }
  return raw ?? '';
}
