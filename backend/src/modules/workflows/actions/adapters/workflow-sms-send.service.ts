import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OutboundSmsEventType,
  OutboundSmsSourceType,
  OutboundSmsStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { SmsConsentService } from '@modules/sms/sms-consent.service';
import { SmsMessagingService } from '@modules/sms/sms-messaging.service';
import { OutboundSmsService } from '@modules/sms/outbound-sms.service';
import { SmsConsentBlockedException, SmsProviderNotConfiguredException } from '@modules/sms/utils/sms-errors';
import {
  assertSmsBodyLength,
  estimateSmsCostUsd,
  estimateSmsSegmentCount,
} from '@modules/sms/utils/sms-segment.util';
import { normalizePhoneNumber, toE164Phone } from '@modules/whatsapp/utils/whatsapp-phone.util';
import type { WorkflowActionExecutionContext } from '../workflow-action-execution.context';
import type {
  SmsSendActionConfig,
  WorkflowSmsDeliveryStatus,
  WorkflowSmsLocale,
} from './workflow-action-adapter.types';
import { WorkflowSmsCommunicationPolicyService } from './workflow-sms-communication-policy.service';
import { WorkflowCommunicationPolicyEngineService } from '../../communication-policy';
import type { WorkflowCommunicationPolicySnapshot } from '../../communication-policy';
import { maskPhoneNumber } from './workflow-whatsapp-mask.util';
import {
  renderWorkflowSmsTemplate,
  WORKFLOW_SMS_TEMPLATES,
} from './workflow-sms-templates';

export interface WorkflowSmsSendResult {
  outboundSmsId: string;
  deliveryStatus: WorkflowSmsDeliveryStatus;
  providerMessageSid: string | null;
  idempotencyKey: string;
  maskedRecipient: string;
  duplicate: boolean;
  templateKey: string;
  templateVersion: string;
  locale: WorkflowSmsLocale;
  segmentCount: number;
  estimatedCostUsd: number | null;
  dryRun?: boolean;
}

@Injectable()
export class WorkflowSmsSendService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: SmsMessagingService,
    private readonly consent: SmsConsentService,
    private readonly communicationPolicy: WorkflowSmsCommunicationPolicyService,
    private readonly policyEngine: WorkflowCommunicationPolicyEngineService,
    private readonly outboundSms: OutboundSmsService,
  ) {}

  buildIdempotencyKey(ctx: WorkflowActionExecutionContext): string {
    return `workflow:${ctx.organizationId}:${ctx.idempotencyKey}:action:${ctx.actionIndex}:sms`;
  }

  async findExistingSend(orgId: string, idempotencyKey: string) {
    return this.prisma.outboundSms.findFirst({
      where: { organizationId: orgId, sendIdempotencyKey: idempotencyKey },
      select: {
        id: true,
        status: true,
        providerMessageSid: true,
        toPhoneMasked: true,
        segmentCount: true,
        estimatedCostUsd: true,
        templateKey: true,
        templateVersion: true,
        locale: true,
      },
    });
  }

  async send(
    config: SmsSendActionConfig,
    ctx: WorkflowActionExecutionContext,
    options?: { allowExplicitPhone?: boolean; dryRun?: boolean },
  ): Promise<WorkflowSmsSendResult> {
    const idempotencyKey = this.buildIdempotencyKey(ctx);
    const existing = await this.findExistingSend(ctx.organizationId, idempotencyKey);
    if (existing) {
      return this.toResult(existing, idempotencyKey, true);
    }

    const template = WORKFLOW_SMS_TEMPLATES[config.templateKey];
    if (!template) {
      throw new BadRequestException(`Unknown SMS template: ${config.templateKey}`);
    }
    if (template.version !== config.templateVersion) {
      throw new BadRequestException(
        `Template version mismatch: expected ${template.version}, got ${config.templateVersion}`,
      );
    }

    const locale = config.locale ?? 'de';
    const body = renderWorkflowSmsTemplate(template, locale, config.params ?? {});
    assertSmsBodyLength(body, config.maxSegments ?? 3);

    const segmentCount = estimateSmsSegmentCount(body);
    const estimatedCostUsd = estimateSmsCostUsd(segmentCount);

    if (config.fallbackFromWhatsAppMessageId) {
      await this.assertWhatsAppFallbackLink(
        ctx.organizationId,
        config.fallbackFromWhatsAppMessageId,
      );
    }

    const resolved = await this.resolveRecipient(config, ctx, options?.allowExplicitPhone === true);
    const messageKind = config.messageKind ?? 'transactional';

    await this.assertConsent(ctx.organizationId, resolved.phoneE164, messageKind);

    const policyResult = await this.communicationPolicy.evaluate({
      organizationId: ctx.organizationId,
      phoneNormalized: resolved.phoneNormalized,
      enforceQuietHours: template.enforceQuietHours,
      respectQuietHours: config.respectQuietHours,
      messageKind,
      bookingId: resolved.bookingId,
      customerId: resolved.customerId,
      phase: options?.dryRun ? 'plan' : 'pre_send',
    });
    this.policyEngine.assertSendPermitted(policyResult, {
      allowWithApproval: ctx.runApproved === true,
    });
    if (!policyResult.allowed) {
      throw new BadRequestException(policyResult.reason ?? 'Communication policy blocked send');
    }

    const policySnapshot: WorkflowCommunicationPolicySnapshot | undefined = policyResult.snapshot;

    const sender = await this.messaging.resolveSender(ctx.organizationId);

    if (options?.dryRun) {
      return {
        outboundSmsId: '',
        deliveryStatus: 'PREPARED',
        providerMessageSid: null,
        idempotencyKey,
        maskedRecipient: maskPhoneNumber(resolved.phoneE164),
        duplicate: false,
        templateKey: config.templateKey,
        templateVersion: config.templateVersion,
        locale,
        segmentCount,
        estimatedCostUsd,
        dryRun: true,
      };
    }

    const preSendPolicy = await this.communicationPolicy.evaluate({
      organizationId: ctx.organizationId,
      phoneNormalized: resolved.phoneNormalized,
      enforceQuietHours: template.enforceQuietHours,
      respectQuietHours: config.respectQuietHours,
      messageKind,
      bookingId: resolved.bookingId,
      customerId: resolved.customerId,
      phase: 'pre_send',
      frozenSnapshot: policySnapshot ?? null,
      runApproved: ctx.runApproved,
    });
    this.policyEngine.assertSendPermitted(preSendPolicy, {
      allowWithApproval: ctx.runApproved === true,
    });

    const row = await this.prisma.outboundSms.create({
      data: {
        organizationId: ctx.organizationId,
        bookingId: resolved.bookingId,
        customerId: resolved.customerId,
        sourceType: config.fallbackFromWhatsAppMessageId
          ? OutboundSmsSourceType.WHATSAPP_FALLBACK
          : OutboundSmsSourceType.WORKFLOW,
        status: OutboundSmsStatus.QUEUED,
        toPhoneNormalized: resolved.phoneNormalized,
        toPhoneMasked: maskPhoneNumber(resolved.phoneE164),
        fromSenderRef: sender.fromSenderRef,
        body,
        templateKey: config.templateKey,
        templateVersion: config.templateVersion,
        locale,
        segmentCount,
        estimatedCostUsd: estimatedCostUsd ?? undefined,
        sendIdempotencyKey: idempotencyKey,
        fallbackFromWhatsAppMsgId: config.fallbackFromWhatsAppMessageId ?? null,
        provider: 'twilio',
      },
    });

    await this.outboundSms.recordEvent(row.id, OutboundSmsEventType.QUEUED);
    await this.prisma.outboundSms.update({
      where: { id: row.id },
      data: { status: OutboundSmsStatus.SENDING },
    });
    await this.outboundSms.recordEvent(row.id, OutboundSmsEventType.SENDING);

    const timeoutMs = 30_000;
    let providerResult;
    try {
      providerResult = await Promise.race([
        this.messaging.sendSms(ctx.organizationId, {
          toE164: resolved.phoneE164,
          body,
          sender,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('SMS_PROVIDER_TIMEOUT')), timeoutMs),
        ),
      ]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await this.markFailed(row.id, message.includes('TIMEOUT') ? 'TIMEOUT' : message);
      throw err;
    }

    const finalStatus =
      providerResult.status === 'FAILED'
        ? OutboundSmsStatus.FAILED
        : providerResult.status === 'SENT_SIMULATED'
          ? OutboundSmsStatus.SENT_SIMULATED
          : OutboundSmsStatus.SENT;

    const updated = await this.prisma.outboundSms.update({
      where: { id: row.id },
      data: {
        status: finalStatus,
        providerMessageSid: providerResult.providerMessageSid || null,
        segmentCount: providerResult.segmentCount ?? segmentCount,
        errorMessage: providerResult.failureReason ?? null,
        sentAt:
          finalStatus === OutboundSmsStatus.SENT || finalStatus === OutboundSmsStatus.SENT_SIMULATED
            ? new Date()
            : null,
      },
    });

    await this.outboundSms.recordEvent(
      row.id,
      finalStatus === OutboundSmsStatus.FAILED
        ? OutboundSmsEventType.FAILED
        : OutboundSmsEventType.SENT,
      {
        providerMessageSid: providerResult.providerMessageSid,
        failureReason: providerResult.failureReason,
      },
    );

    if (finalStatus === OutboundSmsStatus.FAILED) {
      throw new BadRequestException(providerResult.failureReason ?? 'SMS provider failed');
    }

    return this.toResult(updated, idempotencyKey, false);
  }

  private toResult(
    row: {
      id: string;
      status: OutboundSmsStatus;
      providerMessageSid: string | null;
      toPhoneMasked: string;
      segmentCount: number | null;
      estimatedCostUsd: { toNumber?: () => number } | number | null;
      templateKey: string | null;
      templateVersion: string | null;
      locale: string | null;
    },
    idempotencyKey: string,
    duplicate: boolean,
  ): WorkflowSmsSendResult {
    const cost =
      row.estimatedCostUsd && typeof row.estimatedCostUsd === 'object' && 'toNumber' in row.estimatedCostUsd
        ? row.estimatedCostUsd.toNumber?.() ?? null
        : typeof row.estimatedCostUsd === 'number'
          ? row.estimatedCostUsd
          : null;

    return {
      outboundSmsId: row.id,
      deliveryStatus: this.mapDeliveryStatus(row.status),
      providerMessageSid: row.providerMessageSid,
      idempotencyKey,
      maskedRecipient: row.toPhoneMasked,
      duplicate,
      templateKey: row.templateKey ?? 'workflow_operational',
      templateVersion: row.templateVersion ?? '1.0.0',
      locale: (row.locale as WorkflowSmsLocale) ?? 'de',
      segmentCount: row.segmentCount ?? 1,
      estimatedCostUsd: cost,
    };
  }

  private mapDeliveryStatus(status: OutboundSmsStatus): WorkflowSmsDeliveryStatus {
    switch (status) {
      case OutboundSmsStatus.QUEUED:
        return 'QUEUED';
      case OutboundSmsStatus.SENDING:
        return 'SENDING';
      case OutboundSmsStatus.SENT:
      case OutboundSmsStatus.SENT_SIMULATED:
        return 'SENT';
      case OutboundSmsStatus.DELIVERED:
        return 'DELIVERED';
      case OutboundSmsStatus.UNDELIVERED:
        return 'UNDELIVERED';
      case OutboundSmsStatus.FAILED:
        return 'FAILED';
      default:
        return 'QUEUED';
    }
  }

  private async resolveRecipient(
    config: SmsSendActionConfig,
    ctx: WorkflowActionExecutionContext,
    allowExplicit: boolean,
  ) {
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
    kind: 'transactional' | 'marketing' | 'support',
  ): Promise<void> {
    try {
      await this.consent.assertCanSend(orgId, phone, kind);
    } catch (err: unknown) {
      if (err instanceof SmsConsentBlockedException) throw err;
      throw err;
    }
    const normalized = normalizePhoneNumber(phone);
    if (!normalized) return;
    const consent = await this.consent.getConsent(orgId, normalized);
    if (kind === 'marketing' && consent && !consent.marketingAllowed) {
      throw new ForbiddenException('Marketing SMS requires explicit opt-in');
    }
    if (!consent?.optedInAt && kind !== 'transactional') {
      throw new ForbiddenException('SMS opt-in required for this message kind');
    }
  }

  private async assertWhatsAppFallbackLink(orgId: string, whatsAppMessageId: string) {
    const msg = await this.prisma.whatsAppMessage.findFirst({
      where: { id: whatsAppMessageId, organizationId: orgId },
      select: { id: true, status: true },
    });
    if (!msg) throw new NotFoundException('WhatsApp message not found for fallback link');
    if (msg.status !== 'FAILED') {
      throw new BadRequestException('SMS fallback link requires a failed WhatsApp message');
    }
  }

  private async markFailed(outboundSmsId: string, reason: string) {
    await this.prisma.outboundSms.update({
      where: { id: outboundSmsId },
      data: { status: OutboundSmsStatus.FAILED, errorMessage: reason },
    });
    await this.outboundSms.recordEvent(outboundSmsId, OutboundSmsEventType.FAILED, {
      errorMessage: reason,
    });
  }
}
