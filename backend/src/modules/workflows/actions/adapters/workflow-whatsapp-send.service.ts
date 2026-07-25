import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  WhatsAppMessageDeliveryStatus,
  WhatsAppTemplateProviderStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { WhatsAppConsentService } from '@modules/whatsapp/whatsapp-consent.service';
import { WhatsAppMessagePolicyService } from '@modules/whatsapp/whatsapp-message-policy.service';
import { WhatsAppProviderService } from '@modules/whatsapp/providers/whatsapp-provider.service';
import { WhatsAppTemplateService } from '@modules/whatsapp/whatsapp-template.service';
import {
  WhatsAppConsentBlockedException,
  WhatsAppProviderNotConfiguredException,
} from '@modules/whatsapp/utils/whatsapp-errors';
import { normalizePhoneNumber, toE164Phone } from '@modules/whatsapp/utils/whatsapp-phone.util';
import type { WorkflowActionExecutionContext } from '../workflow-action-execution.context';
import type {
  WhatsAppAiMessageSendActionConfig,
  WhatsAppTemplateSendActionConfig,
  WorkflowWhatsAppDeliveryStatus,
  WorkflowWhatsAppMessageKind,
} from './workflow-action-adapter.types';
import { WorkflowWhatsAppCommunicationPolicyService } from './workflow-whatsapp-communication-policy.service';
import { maskPhoneNumber } from './workflow-whatsapp-mask.util';

export const WORKFLOW_WHATSAPP_AI_TRANSPARENCY_DE =
  '\n\n— Diese Nachricht wurde mit KI-Unterstützung erstellt.';

export interface WorkflowWhatsAppSendResult {
  whatsAppMessageId: string;
  conversationId: string;
  deliveryStatus: WorkflowWhatsAppDeliveryStatus;
  providerMessageId: string | null;
  idempotencyKey: string;
  maskedRecipient: string;
  duplicate: boolean;
  templateId?: string;
  templateName?: string;
  templateLanguage?: string;
  dryRun?: boolean;
}

@Injectable()
export class WorkflowWhatsAppSendService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly provider: WhatsAppProviderService,
    private readonly templates: WhatsAppTemplateService,
    private readonly consent: WhatsAppConsentService,
    private readonly messagePolicy: WhatsAppMessagePolicyService,
    private readonly communicationPolicy: WorkflowWhatsAppCommunicationPolicyService,
  ) {}

  buildIdempotencyKey(ctx: WorkflowActionExecutionContext, channel: 'template' | 'ai'): string {
    return `workflow:${ctx.organizationId}:${ctx.idempotencyKey}:action:${ctx.actionIndex}:whatsapp:${channel}`;
  }

  async findExistingSend(
    orgId: string,
    idempotencyKey: string,
  ): Promise<{
    id: string;
    conversationId: string;
    status: WhatsAppMessageDeliveryStatus;
    providerMessageId: string | null;
    conversation: { contactPhone: string };
  } | null> {
    const row = await this.prisma.whatsAppMessage.findFirst({
      where: { organizationId: orgId, idempotencyKey },
      select: {
        id: true,
        conversationId: true,
        status: true,
        providerMessageId: true,
        conversation: { select: { contactPhone: true } },
      },
    });
    return row;
  }

  async sendTemplate(
    config: WhatsAppTemplateSendActionConfig,
    ctx: WorkflowActionExecutionContext,
    options?: { allowExplicitPhone?: boolean; dryRun?: boolean },
  ): Promise<WorkflowWhatsAppSendResult> {
    const idempotencyKey = this.buildIdempotencyKey(ctx, 'template');
    const existing = await this.findExistingSend(ctx.organizationId, idempotencyKey);
    if (existing) {
      return this.toResult(existing, idempotencyKey, true, {
        templateId: config.templateId,
      });
    }

    const orgConfig = await this.requireActiveWhatsApp(ctx.organizationId);
    const template = await this.prisma.whatsAppTemplate.findFirst({
      where: { id: config.templateId, organizationId: ctx.organizationId },
    });
    if (!template) throw new NotFoundException('WhatsApp template not found in organization');

    const language = config.language?.trim() || template.language;
    if (config.language && config.language !== template.language) {
      throw new BadRequestException(
        `Template language mismatch: expected ${template.language}, got ${config.language}`,
      );
    }

    const templatePolicy = this.messagePolicy.canSendTemplate(ctx.organizationId, template);
    if (!templatePolicy.allowed) {
      throw new BadRequestException(templatePolicy.reason ?? 'Template not approved for sending');
    }
    if (template.providerStatus !== WhatsAppTemplateProviderStatus.APPROVED) {
      if (
        template.providerStatus === WhatsAppTemplateProviderStatus.DRAFT
        && process.env.NODE_ENV === 'production'
      ) {
        throw new BadRequestException('Draft templates cannot be sent in production');
      }
      if (template.providerStatus === WhatsAppTemplateProviderStatus.PENDING_APPROVAL) {
        throw new BadRequestException('Template is pending Meta approval');
      }
    }

    const resolved = await this.resolveRecipient(config, ctx, options?.allowExplicitPhone === true);
    const messageKind = config.messageKind ?? 'transactional';

    await this.assertConsent(ctx.organizationId, resolved.phoneE164, messageKind);

    const policyResult = await this.communicationPolicy.evaluate({
      organizationId: ctx.organizationId,
      phoneNormalized: resolved.phoneNormalized,
      templateCategory: template.category,
      messageKind,
      enforceQuietHours: true,
      respectQuietHours: config.respectQuietHours,
    });
    if (!policyResult.allowed) {
      throw new BadRequestException(policyResult.reason ?? 'Communication policy blocked send');
    }

    if (options?.dryRun) {
      return {
        whatsAppMessageId: '',
        conversationId: '',
        deliveryStatus: 'PREPARED',
        providerMessageId: null,
        idempotencyKey,
        maskedRecipient: maskPhoneNumber(resolved.phoneE164),
        duplicate: false,
        templateId: template.id,
        templateName: template.name,
        templateLanguage: language,
        dryRun: true,
      };
    }

    const convo = await this.findOrCreateConversation(
      ctx.organizationId,
      resolved.phoneE164,
      resolved.customerId,
      resolved.bookingId,
      orgConfig.phoneNumberId,
    );

    const variables = config.variables ?? {};
    const previewBody = this.renderTemplatePreview(template.bodyTemplate, variables);

    const msg = await this.prisma.whatsAppMessage.create({
      data: {
        organizationId: ctx.organizationId,
        conversationId: convo.id,
        direction: 'outgoing',
        senderType: 'workflow',
        senderName: 'SynqDrive Workflow',
        content: previewBody,
        messageType: 'template',
        templateName: template.name,
        idempotencyKey,
        status: WhatsAppMessageDeliveryStatus.QUEUED,
      },
    });

    if (!this.provider.isConfigured(orgConfig)) {
      await this.markFailed(msg.id, 'WHATSAPP_PROVIDER_NOT_CONFIGURED');
      throw new WhatsAppProviderNotConfiguredException();
    }

    const timeoutMs = 30_000;
    let providerResult;
    try {
      providerResult = await Promise.race([
        this.templates.sendTemplateMessage(orgConfig, resolved.phoneE164, template.id, variables, {
          conversationId: convo.id,
          messageId: msg.id,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('WHATSAPP_PROVIDER_TIMEOUT')), timeoutMs),
        ),
      ]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await this.markFailed(
        msg.id,
        message.includes('TIMEOUT') ? 'TIMEOUT' : message,
      );
      throw err;
    }

    const finalStatus =
      providerResult.status === 'FAILED'
        ? WhatsAppMessageDeliveryStatus.FAILED
        : WhatsAppMessageDeliveryStatus.SENT;

    const updated = await this.prisma.whatsAppMessage.update({
      where: { id: msg.id },
      data: {
        status: finalStatus,
        providerMessageId: providerResult.providerMessageId || null,
        failureReason: providerResult.failureReason ?? null,
      },
      include: { conversation: { select: { contactPhone: true } } },
    });

    await this.prisma.whatsAppConversation.update({
      where: { id: convo.id },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: previewBody.slice(0, 120),
        customerId: resolved.customerId ?? undefined,
        bookingId: resolved.bookingId ?? undefined,
      },
    });

    if (finalStatus === WhatsAppMessageDeliveryStatus.FAILED) {
      throw new BadRequestException(providerResult.failureReason ?? 'WhatsApp provider failed');
    }

    return this.toResult(updated, idempotencyKey, false, {
      templateId: template.id,
      templateName: template.name,
      templateLanguage: language,
    });
  }

  async sendAiMessage(
    config: WhatsAppAiMessageSendActionConfig,
    ctx: WorkflowActionExecutionContext,
    options?: { allowExplicitPhone?: boolean; dryRun?: boolean },
  ): Promise<WorkflowWhatsAppSendResult> {
    if (!this.isAiMessageCapabilityEnabled()) {
      throw new BadRequestException(
        'whatsapp.ai_message.send is not available until the AI pipeline is enabled',
      );
    }

    const idempotencyKey = this.buildIdempotencyKey(ctx, 'ai');
    const existing = await this.findExistingSend(ctx.organizationId, idempotencyKey);
    if (existing) {
      return this.toResult(existing, idempotencyKey, true);
    }

    const body = config.message?.trim();
    if (!body) {
      throw new BadRequestException('message is required after AI pipeline generation');
    }

    const orgConfig = await this.requireActiveWhatsApp(ctx.organizationId);
    const resolved = await this.resolveRecipient(config, ctx, options?.allowExplicitPhone === true);
    const messageKind = config.messageKind ?? 'support';

    await this.assertConsent(ctx.organizationId, resolved.phoneE164, messageKind);

    const policyResult = await this.communicationPolicy.evaluate({
      organizationId: ctx.organizationId,
      phoneNormalized: resolved.phoneNormalized,
      messageKind,
      enforceQuietHours: true,
      respectQuietHours: config.respectQuietHours,
    });
    if (!policyResult.allowed) {
      throw new BadRequestException(policyResult.reason ?? 'Communication policy blocked send');
    }

    const convo = await this.findOrCreateConversation(
      ctx.organizationId,
      resolved.phoneE164,
      resolved.customerId,
      resolved.bookingId,
      orgConfig.phoneNumberId,
    );

    const freeTextPolicy = this.messagePolicy.canSendFreeText(
      ctx.organizationId,
      orgConfig,
      convo,
    );
    if (!freeTextPolicy.allowed) {
      throw new BadRequestException(
        freeTextPolicy.reason ?? 'Free-text WhatsApp blocked outside 24h service window',
      );
    }

    const content =
      body + (config.appendAiTransparency !== false ? WORKFLOW_WHATSAPP_AI_TRANSPARENCY_DE : '');

    if (options?.dryRun) {
      return {
        whatsAppMessageId: '',
        conversationId: convo.id,
        deliveryStatus: 'PREPARED',
        providerMessageId: null,
        idempotencyKey,
        maskedRecipient: maskPhoneNumber(resolved.phoneE164),
        duplicate: false,
        dryRun: true,
      };
    }

    const msg = await this.prisma.whatsAppMessage.create({
      data: {
        organizationId: ctx.organizationId,
        conversationId: convo.id,
        direction: 'outgoing',
        senderType: 'workflow',
        senderName: 'SynqDrive Workflow',
        content,
        messageType: 'text',
        idempotencyKey,
        aiGenerated: true,
        status: WhatsAppMessageDeliveryStatus.QUEUED,
      },
    });

    if (!this.provider.isConfigured(orgConfig)) {
      await this.markFailed(msg.id, 'WHATSAPP_PROVIDER_NOT_CONFIGURED');
      throw new WhatsAppProviderNotConfiguredException();
    }

    const timeoutMs = 30_000;
    let providerResult;
    try {
      providerResult = await Promise.race([
        this.provider.sendTextMessage(orgConfig, resolved.phoneE164, content, {
          organizationId: ctx.organizationId,
          conversationId: convo.id,
          messageId: msg.id,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('WHATSAPP_PROVIDER_TIMEOUT')), timeoutMs),
        ),
      ]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await this.markFailed(msg.id, message.includes('TIMEOUT') ? 'TIMEOUT' : message);
      throw err;
    }

    const finalStatus =
      providerResult.status === 'FAILED'
        ? WhatsAppMessageDeliveryStatus.FAILED
        : WhatsAppMessageDeliveryStatus.SENT;

    const updated = await this.prisma.whatsAppMessage.update({
      where: { id: msg.id },
      data: {
        status: finalStatus,
        providerMessageId: providerResult.providerMessageId || null,
        failureReason: providerResult.failureReason ?? null,
      },
      include: { conversation: { select: { contactPhone: true } } },
    });

    if (finalStatus === WhatsAppMessageDeliveryStatus.FAILED) {
      throw new BadRequestException(providerResult.failureReason ?? 'WhatsApp provider failed');
    }

    return this.toResult(updated, idempotencyKey, false);
  }

  isAiMessageCapabilityEnabled(): boolean {
    return process.env.WORKFLOW_AI_COMMUNICATION_ENABLED === 'true';
  }

  private toResult(
    row: {
      id: string;
      conversationId: string;
      status: WhatsAppMessageDeliveryStatus;
      providerMessageId: string | null;
      conversation: { contactPhone: string };
    },
    idempotencyKey: string,
    duplicate: boolean,
    extra?: { templateId?: string; templateName?: string; templateLanguage?: string },
  ): WorkflowWhatsAppSendResult {
    return {
      whatsAppMessageId: row.id,
      conversationId: row.conversationId,
      deliveryStatus: this.mapDeliveryStatus(row.status),
      providerMessageId: row.providerMessageId,
      idempotencyKey,
      maskedRecipient: maskPhoneNumber(row.conversation.contactPhone),
      duplicate,
      ...extra,
    };
  }

  private mapDeliveryStatus(status: WhatsAppMessageDeliveryStatus): WorkflowWhatsAppDeliveryStatus {
    switch (status) {
      case WhatsAppMessageDeliveryStatus.QUEUED:
        return 'QUEUED';
      case WhatsAppMessageDeliveryStatus.SENT:
        return 'SENT';
      case WhatsAppMessageDeliveryStatus.DELIVERED:
        return 'DELIVERED';
      case WhatsAppMessageDeliveryStatus.READ:
        return 'READ';
      case WhatsAppMessageDeliveryStatus.FAILED:
        return 'FAILED';
      default:
        return 'QUEUED';
    }
  }

  private async resolveRecipient(
    config: WhatsAppTemplateSendActionConfig | WhatsAppAiMessageSendActionConfig,
    ctx: WorkflowActionExecutionContext,
    allowExplicit: boolean,
  ): Promise<{
    phoneE164: string;
    phoneNormalized: string;
    customerId: string | null;
    bookingId: string | null;
  }> {
    if (config.recipient.type === 'booking') {
      const bookingId = config.recipient.bookingId || this.bookingIdFromContext(ctx);
      if (!bookingId) throw new BadRequestException('booking recipient requires bookingId');
      const booking = await this.prisma.booking.findFirst({
        where: { id: bookingId, organizationId: ctx.organizationId },
        include: { customer: { select: { id: true, phone: true } } },
      });
      if (!booking) throw new NotFoundException('Booking not found in organization');
      const phone = booking.customer?.phone?.trim();
      if (!phone) {
        if (allowExplicit && config.toPhone) {
          return this.normalizeExplicitPhone(config.toPhone, booking.customerId, booking.id);
        }
        throw new BadRequestException('Booking customer has no valid phone');
      }
      const normalized = normalizePhoneNumber(phone);
      if (!normalized) throw new BadRequestException('Booking customer phone is invalid');
      return {
        phoneE164: toE164Phone(normalized),
        phoneNormalized: normalized,
        customerId: booking.customerId,
        bookingId: booking.id,
      };
    }

    const customerId = config.recipient.customerId || this.customerIdFromContext(ctx);
    if (!customerId) throw new BadRequestException('customer recipient requires customerId');
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId: ctx.organizationId },
      select: { id: true, phone: true },
    });
    if (!customer) throw new NotFoundException('Customer not found in organization');
    const phone = customer.phone?.trim();
    if (!phone) {
      if (allowExplicit && config.toPhone) {
        return this.normalizeExplicitPhone(config.toPhone, customer.id, null);
      }
      throw new BadRequestException('Customer has no valid phone');
    }
    const normalized = normalizePhoneNumber(phone);
    if (!normalized) throw new BadRequestException('Customer phone is invalid');
    return {
      phoneE164: toE164Phone(normalized),
      phoneNormalized: normalized,
      customerId: customer.id,
      bookingId: null,
    };
  }

  private normalizeExplicitPhone(
    toPhone: string,
    customerId: string | null,
    bookingId: string | null,
  ) {
    const normalized = normalizePhoneNumber(toPhone);
    if (!normalized) throw new BadRequestException('toPhone is not a valid E.164 number');
    return {
      phoneE164: toE164Phone(normalized),
      phoneNormalized: normalized,
      customerId,
      bookingId,
    };
  }

  private bookingIdFromContext(ctx: WorkflowActionExecutionContext): string | null {
    const payload = ctx.event.payload as Record<string, unknown> | undefined;
    const fromPayload = payload?.bookingId;
    if (typeof fromPayload === 'string' && fromPayload.trim()) return fromPayload.trim();
    if (ctx.event.entityType === 'booking' && ctx.event.entityId) return ctx.event.entityId;
    return null;
  }

  private customerIdFromContext(ctx: WorkflowActionExecutionContext): string | null {
    const payload = ctx.event.payload as Record<string, unknown> | undefined;
    const fromPayload = payload?.customerId;
    if (typeof fromPayload === 'string' && fromPayload.trim()) return fromPayload.trim();
    if (ctx.event.entityType === 'customer' && ctx.event.entityId) return ctx.event.entityId;
    return null;
  }

  private async assertConsent(
    orgId: string,
    phone: string,
    kind: WorkflowWhatsAppMessageKind,
  ): Promise<void> {
    try {
      await this.consent.assertCanSend(orgId, phone, kind);
    } catch (err: unknown) {
      if (err instanceof WhatsAppConsentBlockedException) throw err;
      throw err;
    }

    const normalized = normalizePhoneNumber(phone);
    if (!normalized) return;
    const consent = await this.consent.getConsent(orgId, normalized);
    if (kind === 'marketing' && consent && !consent.marketingAllowed) {
      throw new ForbiddenException('Marketing WhatsApp requires explicit opt-in');
    }
    if (!consent?.optedInAt && kind !== 'transactional') {
      throw new ForbiddenException('WhatsApp opt-in required for this message kind');
    }
  }

  private async requireActiveWhatsApp(orgId: string) {
    const config = await this.prisma.orgWhatsAppConfig.findUnique({
      where: { organizationId: orgId },
    });
    if (!config?.isConnected || !config.isActive) {
      throw new BadRequestException('WhatsApp is not connected or active for this organization');
    }
    return config;
  }

  private async findOrCreateConversation(
    orgId: string,
    phoneE164: string,
    customerId: string | null,
    bookingId: string | null,
    phoneNumberId: string | null,
  ) {
    const phoneNormalized = normalizePhoneNumber(phoneE164);
    if (!phoneNormalized) throw new BadRequestException('Invalid phone number');

    const existing = await this.prisma.whatsAppConversation.findUnique({
      where: {
        organizationId_contactPhoneNormalized: {
          organizationId: orgId,
          contactPhoneNormalized: phoneNormalized,
        },
      },
    });
    if (existing) return existing;

    return this.prisma.whatsAppConversation.create({
      data: {
        organizationId: orgId,
        contactPhone: phoneE164,
        contactPhoneNormalized: phoneNormalized,
        phoneNumberId,
        customerId,
        bookingId,
        status: 'OPEN',
      },
    });
  }

  private renderTemplatePreview(bodyTemplate: string, variables: Record<string, string>): string {
    return bodyTemplate.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? `{{${key}}}`);
  }

  private async markFailed(messageId: string, reason: string) {
    await this.prisma.whatsAppMessage.update({
      where: { id: messageId },
      data: {
        status: WhatsAppMessageDeliveryStatus.FAILED,
        failureReason: reason,
      },
    });
  }
}
