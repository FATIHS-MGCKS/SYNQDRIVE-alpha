import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { WorkflowActionExecutionContext } from '../workflow-action-execution.context';
import type { WorkflowActionExecuteResult, WorkflowActionPreviewResult, WorkflowActionValidationResult } from '../workflow-action-registry.types';
import { WorkflowActionAuditService } from '../adapters/workflow-action-audit.service';
import type { WhatsAppAiMessageSendActionConfig } from '../adapters/workflow-action-adapter.types';
import { maskPhoneNumber } from '../adapters/workflow-whatsapp-mask.util';
import {
  WorkflowWhatsAppSendService,
} from '../adapters/workflow-whatsapp-send.service';
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
        message: { type: 'string' },
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
    private readonly audit: WorkflowActionAuditService,
  ) {
    super();
  }

  private resolveCapabilityStatus(): 'ENABLED' | 'DISABLED' {
    return process.env.WORKFLOW_WHATSAPP_AI_MESSAGE_ENABLED === 'true' ? 'ENABLED' : 'DISABLED';
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

    return { valid: true, errors: [], normalizedConfig: record };
  }

  protected describePlannedEffects(
    config: Record<string, unknown>,
    _ctx: WorkflowActionExecutionContext,
  ): string[] {
    const recipient = config.recipient as { type?: string } | undefined;
    const masked = config.toPhone ? maskPhoneNumber(String(config.toPhone)) : '(resolved from entity)';
    const flags = Array.isArray(config.sensitiveFlags) ? config.sensitiveFlags.length : 0;
    return [
      'Send AI-assisted WhatsApp message (requires approval + AI pipeline)',
      `Recipient: ${recipient?.type ?? '?'} → ${masked}`,
      `Sensitive flags: ${flags}`,
      'AI transparency disclaimer appended by default',
    ];
  }

  async execute(
    config: Record<string, unknown>,
    ctx: WorkflowActionExecutionContext,
  ): Promise<WorkflowActionExecuteResult> {
    if (this.resolveCapabilityStatus() === 'DISABLED') {
      return {
        status: 'FAILED',
        errorMessage: 'whatsapp.ai_message.send is disabled until the AI pipeline is available',
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

    if ((parsed.sensitiveFlags?.length ?? 0) > 0 && !ctx.runApproved) {
      return {
        status: 'FAILED',
        errorMessage: 'AI message with sensitive flags requires workflow approval',
        errorCategory: 'VALIDATION',
      };
    }

    const dryRun = false;

    try {
      const result = await this.whatsAppSend.sendAiMessage(parsed, ctx, {
        allowExplicitPhone: allowExplicit,
        dryRun,
      });

      const audit = this.audit.record(
        ctx,
        'whatsapp.ai_message.send',
        result.duplicate ? 'duplicate' : 'execute',
        result.duplicate
          ? 'WhatsApp AI message already sent for idempotency key'
          : 'WhatsApp AI message sent via workflow',
        {
          whatsAppMessageId: result.whatsAppMessageId || undefined,
          deliveryStatus: result.deliveryStatus,
          maskedRecipient: result.maskedRecipient,
          providerMessageId: result.providerMessageId,
          dryRun: false,
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
          dryRun: false,
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
}
