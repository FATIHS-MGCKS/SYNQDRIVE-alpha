import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { WorkflowActionExecutionContext } from '../workflow-action-execution.context';
import type {
  WorkflowActionExecuteResult,
  WorkflowActionPreviewResult,
  WorkflowActionValidationResult,
} from '../workflow-action-registry.types';
import { WorkflowActionAuditService } from '../adapters/workflow-action-audit.service';
import type {
  WhatsAppAiMessageSendActionConfig,
  WorkflowAiCommunicationPromptKey,
} from '../adapters/workflow-action-adapter.types';
import { maskPhoneNumber } from '../adapters/workflow-whatsapp-mask.util';
import { WorkflowWhatsAppSendService } from '../adapters/workflow-whatsapp-send.service';
import { WorkflowAiCommunicationPipelineService } from '../adapters/ai-communication/workflow-ai-communication-pipeline.service';
import { WORKFLOW_AI_COMMUNICATION_PROMPTS } from '../adapters/ai-communication/workflow-ai-communication-prompts';
import { isWorkflowAiCommunicationEnabled } from '../adapters/ai-communication/workflow-ai-communication.config';
import { BaseWorkflowActionHandler } from './base-workflow-action.handler';

@Injectable()
export class WhatsAppAiMessageSendActionHandler extends BaseWorkflowActionHandler {
  readonly definition = this.buildDefinition({
    type: 'whatsapp.ai_message.send',
    version: '1.0.0',
    capabilityStatus: this.resolveCapabilityStatus(),
    riskClass: 'CRITICAL',
    requiredPermission: 'WORKFLOW_CUSTOMER_CONTACT',
    configSchema: {
      schemaVersion: '1.0.0',
      additionalProperties: false,
      properties: {
        recipient: { type: 'object', required: true },
        toPhone: { type: 'string' },
        promptKey: { type: 'string' },
        promptVersion: { type: 'string' },
        purpose: { type: 'string' },
        locale: { type: 'string', enum: ['de', 'en'] },
        message: { type: 'string' },
        customerContextText: { type: 'string' },
        messageKind: { type: 'string', enum: ['transactional', 'marketing', 'support'] },
        respectQuietHours: { type: 'boolean' },
        appendAiTransparency: { type: 'boolean' },
        verifiedDiagnosis: { type: 'boolean' },
        sensitiveFlags: { type: 'array' },
      },
    },
    timeoutPolicy: { defaultMs: 120_000, maxMs: 600_000 },
  });

  constructor(
    private readonly whatsAppSend: WorkflowWhatsAppSendService,
    private readonly aiPipeline: WorkflowAiCommunicationPipelineService,
    private readonly audit: WorkflowActionAuditService,
  ) {
    super();
  }

  private resolveCapabilityStatus(): 'ENABLED' | 'DISABLED' {
    return isWorkflowAiCommunicationEnabled() ? 'ENABLED' : 'DISABLED';
  }

  validate(
    config: unknown,
    ctx: WorkflowActionExecutionContext,
  ): WorkflowActionValidationResult {
    const base = super.validate(config, ctx);
    if (!base.valid || !base.normalizedConfig) return base;

    const record = base.normalizedConfig;
    const recipient = record.recipient;
    if (!recipient || typeof recipient !== 'object' || Array.isArray(recipient)) {
      return { valid: false, errors: ['recipient must be an object'] };
    }
    const rec = recipient as Record<string, unknown>;
    if (rec.type !== 'customer' && rec.type !== 'booking') {
      return { valid: false, errors: ['recipient.type must be customer or booking'] };
    }

    if (!record.message && !record.promptKey) {
      return { valid: false, errors: ['promptKey is required when message is not provided'] };
    }

    if (record.promptKey) {
      const key = record.promptKey as WorkflowAiCommunicationPromptKey;
      const prompt = WORKFLOW_AI_COMMUNICATION_PROMPTS[key];
      if (!prompt) {
        return { valid: false, errors: [`Unknown promptKey: ${String(record.promptKey)}`] };
      }
      if (record.promptVersion && record.promptVersion !== prompt.version) {
        return {
          valid: false,
          errors: [`promptVersion must be ${prompt.version} for ${key}`],
        };
      }
    }

    return { valid: true, errors: [], normalizedConfig: record };
  }

  async preview(
    config: Record<string, unknown>,
    ctx: WorkflowActionExecutionContext,
  ): Promise<WorkflowActionPreviewResult> {
    const parsed = config as unknown as WhatsAppAiMessageSendActionConfig;
    try {
      const draft = await this.generateDraft(parsed, ctx, true);
      return {
        sideEffectFree: true,
        summary: draft.usedFallbackTemplate
          ? 'Would send AI-assisted WhatsApp (static fallback template)'
          : 'Would send AI-assisted WhatsApp message',
        plannedEffects: this.describePlannedEffects(config, ctx),
        metadata: {
          draftMessage: draft.message,
          usedFallbackTemplate: draft.usedFallbackTemplate,
          modelId: draft.modelId,
          requiresApproval: draft.requiresApproval,
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        sideEffectFree: true,
        summary: `AI WhatsApp blocked: ${message}`,
        plannedEffects: this.describePlannedEffects(config, ctx),
        metadata: { blocked: true, reason: message },
      };
    }
  }

  protected describePlannedEffects(
    config: Record<string, unknown>,
    _ctx: WorkflowActionExecutionContext,
  ): string[] {
    const recipient = config.recipient as { type?: string } | undefined;
    const masked = config.toPhone ? maskPhoneNumber(String(config.toPhone)) : '(resolved from entity)';
    return [
      'Generate customer message via governed AI communication pipeline',
      'Send via WhatsApp provider adapter (not from LLM directly)',
      `Prompt: ${String(config.promptKey ?? 'manual')}`,
      `Recipient: ${recipient?.type ?? '?'} → ${masked}`,
    ];
  }

  async execute(
    config: Record<string, unknown>,
    ctx: WorkflowActionExecutionContext,
  ): Promise<WorkflowActionExecuteResult> {
    if (this.resolveCapabilityStatus() === 'DISABLED') {
      return {
        status: 'FAILED',
        errorMessage: 'whatsapp.ai_message.send is disabled until WORKFLOW_AI_COMMUNICATION_ENABLED=true',
        errorCategory: 'CAPABILITY',
      };
    }

    const parsed = config as unknown as WhatsAppAiMessageSendActionConfig;
    const allowExplicit = (ctx.actor.permissions ?? []).includes('WORKFLOW_CUSTOMER_CONTACT')
      || (ctx.actor.permissions ?? []).includes('WORKFLOW_ADMIN');

    if (parsed.toPhone && !allowExplicit) {
      return {
        status: 'FAILED',
        errorMessage: 'Explicit toPhone requires WORKFLOW_CUSTOMER_CONTACT permission',
        errorCategory: 'AUTHORIZATION',
      };
    }

    try {
      const draft = parsed.message?.trim() && !parsed.promptKey
        ? null
        : await this.generateDraft(parsed, ctx, false);

      if (draft?.approvalBlocked) {
        return {
          status: 'FAILED',
          errorMessage: draft.blockedReason ?? 'Approval required',
          errorCategory: 'VALIDATION',
        };
      }

      const sendConfig: WhatsAppAiMessageSendActionConfig = {
        ...parsed,
        message: parsed.message?.trim() || draft?.message || '',
        appendAiTransparency: false,
      };

      if (!sendConfig.message) {
        return {
          status: 'FAILED',
          errorMessage: 'No message content after AI pipeline',
          errorCategory: 'VALIDATION',
        };
      }

      if (parsed.message?.trim() && !ctx.runApproved) {
        return {
          status: 'FAILED',
          errorMessage: 'Manual AI message override requires workflow approval',
          errorCategory: 'VALIDATION',
        };
      }

      const result = await this.whatsAppSend.sendAiMessage(sendConfig, ctx, {
        allowExplicitPhone: allowExplicit,
        dryRun: false,
      });

      const audit = this.audit.record(
        ctx,
        'whatsapp.ai_message.send',
        result.duplicate ? 'duplicate' : 'execute',
        result.duplicate
          ? 'WhatsApp AI message already sent for idempotency key'
          : 'WhatsApp AI message sent via governed pipeline',
        {
          whatsAppMessageId: result.whatsAppMessageId || undefined,
          deliveryStatus: result.deliveryStatus,
          maskedRecipient: result.maskedRecipient,
          providerMessageId: result.providerMessageId,
          promptKey: draft?.promptKey ?? parsed.promptKey,
          promptVersion: draft?.promptVersion ?? parsed.promptVersion,
          modelId: draft?.modelId,
          usedFallbackTemplate: draft?.usedFallbackTemplate,
          citedFactIds: draft?.citedFactIds,
        },
      );

      return {
        status: 'SUCCESS',
        idempotentReplay: result.duplicate,
        output: {
          whatsAppMessageId: result.whatsAppMessageId,
          conversationId: result.conversationId,
          deliveryStatus: result.deliveryStatus,
          providerMessageId: result.providerMessageId,
          idempotencyKey: result.idempotencyKey,
          maskedRecipient: result.maskedRecipient,
          modelId: draft?.modelId,
          usedFallbackTemplate: draft?.usedFallbackTemplate ?? false,
          auditId: audit.auditId,
        },
      };
    } catch (err: unknown) {
      if (
        err instanceof BadRequestException
        || err instanceof NotFoundException
        || err instanceof ForbiddenException
      ) {
        return {
          status: 'FAILED',
          errorMessage: err.message,
          errorCategory: err instanceof NotFoundException
            ? 'NOT_FOUND'
            : err instanceof ForbiddenException
              ? 'AUTHORIZATION'
              : 'VALIDATION',
        };
      }
      throw err;
    }
  }

  private async generateDraft(
    config: WhatsAppAiMessageSendActionConfig,
    ctx: WorkflowActionExecutionContext,
    dryRun: boolean,
  ) {
    if (!config.promptKey) {
      throw new BadRequestException('promptKey is required for AI pipeline generation');
    }
    const prompt = WORKFLOW_AI_COMMUNICATION_PROMPTS[config.promptKey];
    return this.aiPipeline.generate({
      organizationId: ctx.organizationId,
      workflowRunId: ctx.workflowRunId,
      actionRunId: ctx.actionRunId,
      eventType: ctx.event.eventType,
      entityType: ctx.event.entityType,
      entityId: ctx.event.entityId,
      eventPayload: ctx.event.payload,
      purpose: config.purpose ?? 'operational',
      promptKey: config.promptKey,
      promptVersion: config.promptVersion ?? prompt.version,
      channel: 'whatsapp',
      locale: config.locale ?? 'de',
      bookingId: config.recipient.type === 'booking' ? config.recipient.bookingId : undefined,
      customerId: config.recipient.type === 'customer' ? config.recipient.customerId : undefined,
      untrustedCustomerText: config.customerContextText,
      sensitiveFlags: config.sensitiveFlags,
      runApproved: ctx.runApproved,
      verifiedDiagnosis: config.verifiedDiagnosis,
      dryRun,
    });
  }
}
