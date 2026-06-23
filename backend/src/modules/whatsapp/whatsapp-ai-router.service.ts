import { Injectable, Logger } from '@nestjs/common';
import {
  OrgWhatsAppConfig,
  Prisma,
  WhatsAppAiDecision,
  WhatsAppAiIntent,
  WhatsAppAiMode,
  WhatsAppConversationStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { AuditService } from '@modules/activity-log/audit.service';
import { ActivityAction, ActivityEntity } from '@prisma/client';
import { WhatsAppAiContextService } from './whatsapp-ai-context.service';
import { WhatsAppAiToolsService } from './whatsapp-ai-tools.service';
import { classifyWhatsAppIntent } from './whatsapp-ai-intent.util';
import { buildSuggestedReply } from './whatsapp-ai-reply.builder';
import {
  WhatsAppMessagePolicyService,
  WhatsAppSensitiveFlag,
} from './whatsapp-message-policy.service';
import {
  AUTO_SIMPLE_SAFE_INTENTS,
  VEHICLE_DIMO_INTENTS,
  WhatsAppAiRouterInput,
  WhatsAppAiRouterResult,
  WhatsAppAiToolName,
  WhatsAppAiSourceContextIds,
} from './whatsapp-ai.types';

const CONFIDENCE_THRESHOLD = 0.7;

const NEEDS_ACTIVE_BOOKING_INTENTS: WhatsAppAiIntent[] = [
  WhatsAppAiIntent.PICKUP_INFO,
  WhatsAppAiIntent.RETURN_INFO,
  WhatsAppAiIntent.LOCATION,
  WhatsAppAiIntent.VEHICLE_STATUS,
  WhatsAppAiIntent.VEHICLE_WARNING,
];

const FULL_MODE_BLOCKED_AUTO_INTENTS: WhatsAppAiIntent[] = [
  WhatsAppAiIntent.PAYMENT,
  WhatsAppAiIntent.DEPOSIT,
  WhatsAppAiIntent.DAMAGE,
  WhatsAppAiIntent.ACCIDENT,
  WhatsAppAiIntent.COMPLAINT,
  WhatsAppAiIntent.BOOKING_CHANGE,
  WhatsAppAiIntent.VEHICLE_WARNING,
];

@Injectable()
export class WhatsAppAiRouterService {
  private readonly logger = new Logger(WhatsAppAiRouterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: WhatsAppAiContextService,
    private readonly tools: WhatsAppAiToolsService,
    private readonly policy: WhatsAppMessagePolicyService,
    private readonly audit: AuditService,
  ) {}

  async route(input: WhatsAppAiRouterInput): Promise<WhatsAppAiRouterResult> {
    const { orgId, conversationId, messageContent, triggerMessageId } = input;

    const config = await this.prisma.orgWhatsAppConfig.findUnique({
      where: { organizationId: orgId },
    });
    if (!config) {
      return this.blockedResult('WhatsApp config not found', WhatsAppAiIntent.UNKNOWN);
    }

    if (config.aiMode === WhatsAppAiMode.OFF) {
      return this.blockedResult('AI is disabled', WhatsAppAiIntent.UNKNOWN);
    }

    const convo = await this.prisma.whatsAppConversation.findFirst({
      where: { id: conversationId, organizationId: orgId },
    });
    if (!convo) {
      return this.blockedResult('Conversation not found', WhatsAppAiIntent.UNKNOWN);
    }

    const classification = classifyWhatsAppIntent(messageContent);
    const intent = classification.intent;

    const ctx = await this.context.load(orgId, convo, triggerMessageId);
    const riskFlags = this.buildRiskFlags(classification, ctx, messageContent);
    const toolsToRun = this.selectTools(intent, riskFlags);
    const toolResults = await this.tools.runTools(orgId, ctx, toolsToRun);

    if (toolResults.some((t) => t.stale && VEHICLE_DIMO_INTENTS.includes(intent))) {
      if (!riskFlags.includes('PROVIDER_DATA_STALE')) {
        riskFlags.push('PROVIDER_DATA_STALE');
      }
    }

    const confidence = this.computeConfidence(classification, ctx, toolResults, riskFlags);
    if (confidence < CONFIDENCE_THRESHOLD && !riskFlags.includes('LOW_CONFIDENCE')) {
      riskFlags.push('LOW_CONFIDENCE');
    }

    const humanApproval = this.policy.requiresHumanApproval({
      intent,
      confidence,
      sensitiveFlags: riskFlags,
    });

    const humanRequired = humanApproval.required;
    const suggestedReply = buildSuggestedReply(intent, ctx, toolResults, humanRequired);

    const autoPolicy = this.policy.canAutoReply(config, convo, {
      intent,
      confidence,
      sensitiveFlags: riskFlags,
    });

    let decision: WhatsAppAiDecision;
    let humanReason: string | null = humanApproval.reason ?? null;
    let canSendAutomatically = false;

    if (humanRequired) {
      decision = WhatsAppAiDecision.HUMAN_REQUIRED;
      canSendAutomatically = false;
    } else if (config.aiMode === WhatsAppAiMode.SUGGEST_ONLY || autoPolicy.storeSuggestionOnly) {
      decision = WhatsAppAiDecision.SUGGEST_ONLY;
      canSendAutomatically = false;
    } else if (autoPolicy.allowed && this.isAutoSimpleIntentAllowed(config, intent, riskFlags, convo.customerId)) {
      decision = WhatsAppAiDecision.AUTO_ALLOWED;
      canSendAutomatically = true;
    } else {
      decision = WhatsAppAiDecision.SUGGEST_ONLY;
      humanReason = humanReason ?? autoPolicy.reason ?? null;
      canSendAutomatically = false;
    }

    const usedTools = toolResults.map((t) => t.tool);
    const suggestionId = await this.persistSuggestion({
      orgId,
      conversationId,
      triggerMessageId,
      suggestedReply,
      intent,
      confidence,
      riskFlags,
      usedTools,
      sourceContextIds: ctx.sourceContextIds,
      decision,
      humanReason,
    });

    await this.prisma.whatsAppConversation.update({
      where: { id: conversationId },
      data: {
        lastDetectedIntent: intent,
        status: humanRequired ? WhatsAppConversationStatus.PENDING_HUMAN : convo.status,
      },
    });

    void this.audit.record({
      actorOrganizationId: orgId,
      action: ActivityAction.CREATE,
      entity: ActivityEntity.INTEGRATION,
      entityId: suggestionId ?? conversationId,
      description: `WhatsApp AI suggestion (${intent}, ${decision}, confidence ${confidence.toFixed(2)})`,
    });

    return {
      suggestedReply,
      intent,
      confidence,
      riskFlags,
      usedTools,
      decision,
      humanReason,
      canSendAutomatically,
      suggestionId,
      reason: null,
      sourceContextIds: ctx.sourceContextIds,
    };
  }

  async requestHumanReview(
    orgId: string,
    conversationId: string,
    reason: string,
    userId?: string,
    createTask = true,
  ) {
    const convo = await this.prisma.whatsAppConversation.findFirst({
      where: { id: conversationId, organizationId: orgId },
    });
    if (!convo) return null;

    const ctx = await this.context.load(orgId, convo);
    if (createTask) {
      const config = await this.prisma.orgWhatsAppConfig.findUnique({
        where: { organizationId: orgId },
      });
      if (config?.aiCanCreateTasks) {
        await this.tools.createHumanReviewTask(orgId, ctx, reason, userId);
      }
    }

    await this.prisma.whatsAppConversation.update({
      where: { id: conversationId },
      data: { status: WhatsAppConversationStatus.PENDING_HUMAN },
    });

    return { ok: true, conversationId, status: 'PENDING_HUMAN' as const };
  }

  private buildRiskFlags(
    classification: ReturnType<typeof classifyWhatsAppIntent>,
    ctx: Awaited<ReturnType<WhatsAppAiContextService['load']>>,
    message: string,
  ): WhatsAppSensitiveFlag[] {
    const flags: WhatsAppSensitiveFlag[] = [];

    if (!ctx.customer) flags.push('UNKNOWN_CUSTOMER');
    if (ctx.customer && !ctx.hasActiveBooking && this.needsActiveBooking(classification.intent)) {
      flags.push('NO_ACTIVE_BOOKING');
    }

    for (const extra of classification.extraFlags) {
      if (this.isSensitiveFlag(extra)) flags.push(extra);
    }

    switch (classification.intent) {
      case WhatsAppAiIntent.PAYMENT:
        flags.push('PAYMENT_PROBLEM');
        break;
      case WhatsAppAiIntent.ACCIDENT:
        flags.push('ACCIDENT');
        break;
      case WhatsAppAiIntent.DAMAGE:
        if (/streit|dispute|bestreit/i.test(message)) flags.push('DAMAGE_DISPUTE');
        break;
      case WhatsAppAiIntent.COMPLAINT:
        flags.push('COMPLAINT');
        break;
      case WhatsAppAiIntent.BOOKING_CHANGE:
        flags.push('BOOKING_CHANGE');
        break;
      case WhatsAppAiIntent.OPT_OUT:
        break;
      default:
        break;
    }

    if (classification.intent === WhatsAppAiIntent.UNKNOWN) {
      flags.push('OUT_OF_SCOPE');
    }

    return [...new Set(flags)];
  }

  private needsActiveBooking(intent: WhatsAppAiIntent): boolean {
    return NEEDS_ACTIVE_BOOKING_INTENTS.includes(intent);
  }

  private isSensitiveFlag(flag: string): flag is WhatsAppSensitiveFlag {
    return [
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
    ].includes(flag);
  }

  private selectTools(intent: WhatsAppAiIntent, flags: WhatsAppSensitiveFlag[]): WhatsAppAiToolName[] {
    if (flags.includes('UNKNOWN_CUSTOMER')) return [];

    const tools: WhatsAppAiToolName[] = [];
    switch (intent) {
      case WhatsAppAiIntent.BOOKING_STATUS:
        tools.push('getBookingSummary');
        break;
      case WhatsAppAiIntent.PICKUP_INFO:
        tools.push('getPickupInstructions');
        break;
      case WhatsAppAiIntent.RETURN_INFO:
        tools.push('getReturnInstructions');
        break;
      case WhatsAppAiIntent.DOCUMENTS:
        tools.push('getMissingDocuments');
        break;
      case WhatsAppAiIntent.PAYMENT:
      case WhatsAppAiIntent.DEPOSIT:
        tools.push('getPaymentDepositStatus');
        break;
      case WhatsAppAiIntent.LOCATION:
        tools.push('getVehicleLocationSummary');
        break;
      case WhatsAppAiIntent.VEHICLE_STATUS:
        tools.push('getVehicleStatus');
        break;
      case WhatsAppAiIntent.VEHICLE_WARNING:
        tools.push('getVehicleWarningSummary');
        break;
      case WhatsAppAiIntent.DAMAGE:
        tools.push('getOpenDamages');
        break;
      default:
        if (intent === WhatsAppAiIntent.GENERAL) tools.push('getBookingSummary');
        break;
    }
    return tools;
  }

  private computeConfidence(
    classification: ReturnType<typeof classifyWhatsAppIntent>,
    ctx: Awaited<ReturnType<WhatsAppAiContextService['load']>>,
    toolResults: Awaited<ReturnType<WhatsAppAiToolsService['runTools']>>,
    flags: WhatsAppSensitiveFlag[],
  ): number {
    let score = 0.35 + classification.matchStrength * 0.25;
    if (ctx.customer) score += 0.2;
    if (ctx.booking) score += 0.15;
    if (ctx.vehicle) score += 0.1;
    const okTools = toolResults.filter((t) => t.ok).length;
    if (okTools > 0) score += 0.1;
    if (flags.includes('PROVIDER_DATA_STALE')) score -= 0.2;
    if (flags.includes('UNKNOWN_CUSTOMER')) score -= 0.35;
    return Math.max(0, Math.min(1, score));
  }

  private isAutoSimpleIntentAllowed(
    config: OrgWhatsAppConfig,
    intent: WhatsAppAiIntent,
    flags: WhatsAppSensitiveFlag[],
    customerId: string | null,
  ): boolean {
    if (!customerId) return false;
    if (flags.length > 0) return false;
    if (config.aiMode === WhatsAppAiMode.AUTO_SIMPLE) {
      return AUTO_SIMPLE_SAFE_INTENTS.includes(intent);
    }
    if (config.aiMode === WhatsAppAiMode.FULL) {
      return !FULL_MODE_BLOCKED_AUTO_INTENTS.includes(intent);
    }
    return false;
  }

  private async persistSuggestion(data: {
    orgId: string;
    conversationId: string;
    triggerMessageId?: string | null;
    suggestedReply: string;
    intent: WhatsAppAiIntent;
    confidence: number;
    riskFlags: WhatsAppSensitiveFlag[];
    usedTools: WhatsAppAiToolName[];
    sourceContextIds: WhatsAppAiSourceContextIds;
    decision: WhatsAppAiDecision;
    humanReason: string | null;
  }): Promise<string> {
    const row = await this.prisma.whatsAppAiSuggestion.create({
      data: {
        organizationId: data.orgId,
        conversationId: data.conversationId,
        triggerMessageId: data.triggerMessageId ?? null,
        suggestedReply: data.suggestedReply,
        intent: data.intent,
        confidence: data.confidence,
        riskFlags: data.riskFlags,
        usedTools: data.usedTools,
        sourceContextIds: data.sourceContextIds as unknown as Prisma.InputJsonValue,
        decision: data.decision,
        humanReason: data.humanReason,
      },
    });
    return row.id;
  }

  private blockedResult(reason: string, intent: WhatsAppAiIntent): WhatsAppAiRouterResult {
    return {
      suggestedReply: null,
      intent,
      confidence: 0,
      riskFlags: [],
      usedTools: [],
      decision: WhatsAppAiDecision.HUMAN_REQUIRED,
      humanReason: reason,
      canSendAutomatically: false,
      suggestionId: null,
      reason,
      sourceContextIds: {
        organizationId: '',
        conversationId: '',
      },
    };
  }
}
