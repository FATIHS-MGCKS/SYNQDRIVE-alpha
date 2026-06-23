import { forwardRef, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ActivityAction, ActivityEntity, WhatsAppMessageDeliveryStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { AuditService } from '@modules/activity-log/audit.service';
import { WhatsAppProviderService } from './providers/whatsapp-provider.service';
import { WhatsAppConversationMatcherService } from './whatsapp-conversation-matcher.service';
import { WhatsAppConsentService } from './whatsapp-consent.service';
import { normalizePhoneNumber } from './utils/whatsapp-phone.util';
import { WhatsAppService } from './whatsapp.service';

@Injectable()
export class WhatsAppWebhookService {
  private readonly logger = new Logger(WhatsAppWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: WhatsAppProviderService,
    private readonly matcher: WhatsAppConversationMatcherService,
    private readonly consent: WhatsAppConsentService,
    private readonly audit: AuditService,
    @Inject(forwardRef(() => WhatsAppService))
    private readonly whatsAppService: WhatsAppService,
  ) {}

  async verifySubscription(
    phoneNumberId: string | undefined,
    mode: string | undefined,
    token: string | undefined,
    challenge: string | undefined,
  ): Promise<string> {
    const config = await this.resolveConfigByPhoneNumberId(phoneNumberId);
    if (!config) {
      this.logger.warn('Webhook verify: no config for phoneNumberId');
      return '';
    }

    const result = this.provider.verifyWebhook(config, mode, token, challenge);
    if (!result) {
      throw new UnauthorizedException('Webhook verification failed');
    }
    return result;
  }

  async receiveWebhook(
    rawBody: Buffer,
    payload: unknown,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<void> {
    const parsed = this.provider.parseWebhook(payload, headers);
    const phoneNumberId = parsed.phoneNumberId;

    const config = await this.resolveConfigByPhoneNumberId(phoneNumberId);
    if (config) {
      const valid = this.provider.validateSignature(config, rawBody, headers);
      if (!valid && process.env.NODE_ENV === 'production') {
        throw new UnauthorizedException('Invalid webhook signature');
      }
    }

    for (const entry of parsed.entries) {
      await this.processEntryIdempotent(entry, config, phoneNumberId, payload, headers);
    }

    if (config) {
      await this.prisma.orgWhatsAppConfig.update({
        where: { organizationId: config.organizationId },
        data: { lastWebhookAt: new Date() },
      });
    }
  }

  private async processEntryIdempotent(
    entry: {
      externalEventId: string;
      eventType: string;
      inboundMessage?: {
        providerMessageId: string;
        fromPhone: string;
        fromName?: string;
        body: string;
        timestamp: Date;
      };
      statusUpdate?: {
        providerMessageId: string;
        status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
        timestamp: Date;
        failureReason?: string;
      };
    },
    config: Awaited<ReturnType<typeof this.resolveConfigByPhoneNumberId>>,
    phoneNumberId: string | undefined,
    payload: unknown,
    headers: Record<string, string | string[] | undefined>,
  ) {
    const existing = await this.prisma.whatsAppWebhookEvent.findUnique({
      where: { externalEventId: entry.externalEventId },
    });
    if (existing?.processedAt) return;

    const orgId = config?.organizationId ?? null;
    let webhookEvent = existing;

    if (!webhookEvent) {
      try {
        webhookEvent = await this.prisma.whatsAppWebhookEvent.create({
          data: {
            organizationId: orgId,
            phoneNumberId: phoneNumberId ?? null,
            externalEventId: entry.externalEventId,
            eventType: entry.eventType,
            payload: payload as Prisma.InputJsonValue,
            headers: headers as Prisma.InputJsonValue,
            signatureValid: config ? this.provider.validateSignature(config, Buffer.from(JSON.stringify(payload)), headers) : null,
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
      if (entry.inboundMessage && orgId) {
        await this.handleInboundMessage(orgId, phoneNumberId, entry.inboundMessage);
      } else if (entry.statusUpdate && orgId) {
        await this.handleStatusUpdate(orgId, entry.statusUpdate);
      }

      await this.prisma.whatsAppWebhookEvent.update({
        where: { id: webhookEvent.id },
        data: { processedAt: new Date(), processingError: null },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Processing failed';
      await this.prisma.whatsAppWebhookEvent.update({
        where: { id: webhookEvent.id },
        data: { processingError: message },
      });
      this.logger.error(`Webhook processing error: ${message}`);
    }
  }

  private async handleInboundMessage(
    orgId: string,
    phoneNumberId: string | undefined,
    inbound: {
      providerMessageId: string;
      fromPhone: string;
      fromName?: string;
      body: string;
      timestamp: Date;
    },
  ) {
    const phoneNormalized = normalizePhoneNumber(inbound.fromPhone);
    if (!phoneNormalized) return;

    const existingMsg = await this.prisma.whatsAppMessage.findUnique({
      where: { providerMessageId: inbound.providerMessageId },
    });
    if (existingMsg) return;

    const match = await this.matcher.matchContext(orgId, inbound.fromPhone, inbound.fromName);

    let convo = await this.prisma.whatsAppConversation.findUnique({
      where: {
        organizationId_contactPhoneNormalized: {
          organizationId: orgId,
          contactPhoneNormalized: phoneNormalized,
        },
      },
    });

    if (!convo) {
      convo = await this.prisma.whatsAppConversation.create({
        data: {
          organizationId: orgId,
          contactPhone: inbound.fromPhone,
          contactPhoneNormalized: phoneNormalized,
          contactName: match.contactName,
          phoneNumberId: phoneNumberId ?? null,
          customerId: match.customerId,
          bookingId: match.bookingId,
          vehicleId: match.vehicleId,
          status: match.status,
          lastMessageAt: inbound.timestamp,
          lastCustomerMessageAt: inbound.timestamp,
          lastMessagePreview: inbound.body.slice(0, 120),
          unreadCount: 1,
        },
      });
    } else {
      convo = await this.prisma.whatsAppConversation.update({
        where: { id: convo.id },
        data: {
          contactName: match.contactName ?? convo.contactName,
          customerId: match.customerId ?? convo.customerId,
          bookingId: match.bookingId ?? convo.bookingId,
          vehicleId: match.vehicleId ?? convo.vehicleId,
          status: match.customerId ? 'OPEN' : convo.status,
          lastMessageAt: inbound.timestamp,
          lastCustomerMessageAt: inbound.timestamp,
          lastMessagePreview: inbound.body.slice(0, 120),
          unreadCount: { increment: 1 },
        },
      });
    }

    await this.prisma.whatsAppMessage.create({
      data: {
        organizationId: orgId,
        conversationId: convo.id,
        direction: 'incoming',
        senderType: 'customer',
        senderName: inbound.fromName ?? match.contactName,
        content: inbound.body,
        messageType: 'text',
        providerMessageId: inbound.providerMessageId,
        status: WhatsAppMessageDeliveryStatus.DELIVERED,
      },
    });

    await this.consent.processInboundConsentKeywords(
      orgId,
      inbound.fromPhone,
      inbound.body,
      match.customerId,
    );

    void this.audit.record({
      actorOrganizationId: orgId,
      action: ActivityAction.CREATE,
      entity: ActivityEntity.INTEGRATION,
      entityId: convo.id,
      description: 'Inbound WhatsApp message received via webhook',
      metaJson: { providerMessageId: inbound.providerMessageId },
    });

    // Same auto-reply path as dev simulation — policy + AI router guardrails apply.
    void this.whatsAppService.processInboundAutoReply(orgId, convo.id).catch((err: Error) =>
      this.logger.warn(`[WhatsApp] Webhook auto-reply skipped: ${err.message}`),
    );
  }

  private async handleStatusUpdate(
    orgId: string,
    update: {
      providerMessageId: string;
      status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
      failureReason?: string;
    },
  ) {
    const msg = await this.prisma.whatsAppMessage.findFirst({
      where: { organizationId: orgId, providerMessageId: update.providerMessageId },
    });
    if (!msg) return;

    const statusMap: Record<string, WhatsAppMessageDeliveryStatus> = {
      SENT: WhatsAppMessageDeliveryStatus.SENT,
      DELIVERED: WhatsAppMessageDeliveryStatus.DELIVERED,
      READ: WhatsAppMessageDeliveryStatus.READ,
      FAILED: WhatsAppMessageDeliveryStatus.FAILED,
    };

    await this.prisma.whatsAppMessage.update({
      where: { id: msg.id },
      data: {
        status: statusMap[update.status],
        failureReason: update.failureReason ?? msg.failureReason,
      },
    });
  }

  private async resolveConfigByPhoneNumberId(phoneNumberId: string | undefined) {
    if (!phoneNumberId) return null;
    return this.prisma.orgWhatsAppConfig.findFirst({
      where: { phoneNumberId, isActive: true },
    });
  }
}
