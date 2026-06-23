import { Injectable } from '@nestjs/common';
import { WhatsAppAiMode, WhatsAppConversation, WhatsAppTemplate, OrgWhatsAppConfig } from '@prisma/client';
import { WhatsAppPolicyBlockedException } from './utils/whatsapp-errors';

export const WHATSAPP_SENSITIVE_FLAGS = [
  'UNKNOWN_CUSTOMER',
  'NO_ACTIVE_BOOKING',
  'PERSONAL_DATA',
  'PAYMENT_PROBLEM',
  'DAMAGE_DISPUTE',
  'ACCIDENT',
  'LEGAL',
  'INSURANCE',
  'BOOKING_CHANGE',
  'REFUND',
  'LOW_CONFIDENCE',
  'OUT_OF_SCOPE',
  'PROVIDER_DATA_STALE',
  'COMPLAINT',
] as const;

export type WhatsAppSensitiveFlag = (typeof WHATSAPP_SENSITIVE_FLAGS)[number];

export interface AiDecisionContext {
  intent?: string;
  confidence?: number;
  sensitiveFlags?: WhatsAppSensitiveFlag[];
}

@Injectable()
export class WhatsAppMessagePolicyService {
  canSendFreeText(
    _orgId: string,
    config: OrgWhatsAppConfig,
    conversation: Pick<WhatsAppConversation, 'customerId' | 'lastCustomerMessageAt'>,
  ): { allowed: boolean; reason?: string } {

    if (!config.isActive) {
      return { allowed: false, reason: 'WhatsApp integration is not active for this organization' };
    }

    // Service window placeholder — block risky free text outside window until calculable
    const serviceWindowOpen =
      config.serviceWindowOpen ||
      this.isWithinServiceWindow(conversation.lastCustomerMessageAt);

    if (!serviceWindowOpen) {
      return {
        allowed: false,
        reason:
          'Free-text WhatsApp messages are only allowed within the customer service window. Use an approved template instead.',
      };
    }

    return { allowed: true };
  }

  canSendTemplate(
    orgId: string,
    template: Pick<WhatsAppTemplate, 'providerStatus' | 'organizationId'>,
  ): { allowed: boolean; reason?: string } {
    if (template.organizationId !== orgId) {
      return { allowed: false, reason: 'Template does not belong to this organization' };
    }

    if (template.providerStatus !== 'APPROVED' && template.providerStatus !== 'DRAFT') {
      if (template.providerStatus === 'PENDING_APPROVAL') {
        return { allowed: false, reason: 'Template is pending Meta approval' };
      }
      return { allowed: false, reason: `Template status ${template.providerStatus} does not allow sending` };
    }

    // DRAFT templates: only in non-production for local testing
    if (template.providerStatus === 'DRAFT' && process.env.NODE_ENV === 'production') {
      return { allowed: false, reason: 'Draft templates cannot be sent in production' };
    }

    return { allowed: true };
  }

  canAutoReply(
    config: OrgWhatsAppConfig,
    conversation: Pick<WhatsAppConversation, 'customerId' | 'status'>,
    aiDecision: AiDecisionContext,
  ): { allowed: boolean; reason?: string; storeSuggestionOnly?: boolean } {
    if (!config.isActive) {
      return { allowed: false, reason: 'WhatsApp is inactive' };
    }

    if (config.aiMode === WhatsAppAiMode.OFF) {
      return { allowed: false, reason: 'AI mode is OFF — no suggestions or auto-replies' };
    }

    if (config.aiMode === WhatsAppAiMode.SUGGEST_ONLY) {
      return { allowed: false, reason: 'AI is suggest-only', storeSuggestionOnly: true };
    }

    const approval = this.requiresHumanApproval(aiDecision);
    if (approval.required) {
      return {
        allowed: false,
        reason: approval.reason ?? 'Sensitive case requires human approval',
      };
    }

    if (!conversation.customerId) {
      return {
        allowed: false,
        reason: 'Unknown customer — human handover required',
      };
    }

    if (config.aiMode === WhatsAppAiMode.AUTO_SIMPLE) {
      const safeIntents = ['GENERAL', 'BOOKING_STATUS', 'PICKUP_INFO', 'RETURN_INFO'];
      if (aiDecision.intent && !safeIntents.includes(aiDecision.intent)) {
        return {
          allowed: false,
          reason: `Intent ${aiDecision.intent} is not auto-replyable in AUTO_SIMPLE mode`,
        };
      }
      return { allowed: true };
    }

    if (config.aiMode === WhatsAppAiMode.FULL) {
      return { allowed: true };
    }

    return { allowed: false, reason: 'AI auto-reply not permitted' };
  }

  requiresHumanApproval(aiDecision: AiDecisionContext): {
    required: boolean;
    reason?: string;
    flags?: WhatsAppSensitiveFlag[];
  } {
    const flags = aiDecision.sensitiveFlags ?? [];
    const confidence = aiDecision.confidence ?? 1;

    if (flags.includes('UNKNOWN_CUSTOMER')) {
      return { required: true, reason: 'Unknown customer — human handover required', flags };
    }

    const critical = flags.filter((f) =>
      [
        'PAYMENT_PROBLEM',
        'ACCIDENT',
        'DAMAGE_DISPUTE',
        'LEGAL',
        'COMPLAINT',
        'BOOKING_CHANGE',
        'REFUND',
        'INSURANCE',
        'PERSONAL_DATA',
      ].includes(f),
    );

    if (critical.length > 0) {
      return {
        required: true,
        reason: `Sensitive topic (${critical.join(', ')}) requires human approval`,
        flags: critical,
      };
    }

    if (flags.includes('LOW_CONFIDENCE') || confidence < 0.7) {
      return { required: true, reason: 'Low AI confidence — human review required', flags };
    }

    if (flags.includes('PROVIDER_DATA_STALE') && aiDecision.intent) {
      const vehicleCritical = ['LOCATION', 'VEHICLE_STATUS', 'VEHICLE_WARNING'].includes(
        aiDecision.intent,
      );
      if (vehicleCritical) {
        return {
          required: true,
          reason: 'Vehicle telemetry unavailable or stale — human review required',
          flags,
        };
      }
    }

    if (flags.includes('NO_ACTIVE_BOOKING') && aiDecision.intent) {
      const bookingCritical = ['PICKUP_INFO', 'RETURN_INFO', 'LOCATION', 'VEHICLE_STATUS'].includes(
        aiDecision.intent,
      );
      if (bookingCritical) {
        return {
          required: true,
          reason: 'No active booking for this request — human review required',
          flags,
        };
      }
    }

    return { required: false };
  }

  assertAutoReplyAllowed(
    config: OrgWhatsAppConfig,
    conversation: Pick<WhatsAppConversation, 'customerId' | 'status'>,
    aiDecision: AiDecisionContext,
  ): void {
    const result = this.canAutoReply(config, conversation, aiDecision);
    if (!result.allowed && !result.storeSuggestionOnly) {
      throw new WhatsAppPolicyBlockedException(
        result.reason ?? 'Auto-reply blocked by policy',
        aiDecision.sensitiveFlags,
      );
    }
  }

  /** 24h service window per Meta — simplified until booking-aware window exists */
  private isWithinServiceWindow(lastCustomerMessageAt: Date | null | undefined): boolean {
    if (!lastCustomerMessageAt) return false;
    const hours = (Date.now() - lastCustomerMessageAt.getTime()) / (1000 * 60 * 60);
    return hours <= 24;
  }
}
