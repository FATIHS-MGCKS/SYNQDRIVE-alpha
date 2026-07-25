import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { WorkflowActionExecutionContext } from '../workflow-action-execution.context';
import type { WorkflowActionExecuteResult, WorkflowActionPreviewResult, WorkflowActionValidationResult } from '../workflow-action-registry.types';
import { WorkflowActionAuditService } from '../adapters/workflow-action-audit.service';
import type { WhatsAppTemplateSendActionConfig } from '../adapters/workflow-action-adapter.types';
import { maskPhoneNumber } from '../adapters/workflow-whatsapp-mask.util';
import { WorkflowWhatsAppSendService } from '../adapters/workflow-whatsapp-send.service';
import { BaseWorkflowActionHandler } from './base-workflow-action.handler';

@Injectable()
export class WhatsAppTemplateSendActionHandler extends BaseWorkflowActionHandler {
  readonly definition = this.buildDefinition({
    type: 'whatsapp.template.send',
    version: '1.0.0',
    capabilityStatus: 'ENABLED',
    riskClass: 'HIGH',
    requiredPermission: 'WORKFLOW_CUSTOMER_CONTACT',
    configSchema: {
      schemaVersion: '1.0.0',
      additionalProperties: false,
      properties: {
        templateId: { type: 'string', required: true },
        language: { type: 'string' },
        recipient: { type: 'object', required: true },
        toPhone: { type: 'string' },
        variables: { type: 'object' },
        messageKind: { type: 'string', enum: ['transactional', 'marketing', 'support'] },
        respectQuietHours: { type: 'boolean' },
        verifiedDiagnosis: { type: 'boolean' },
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
    if (rec.type === 'customer' && typeof rec.customerId !== 'string') {
      return { valid: false, errors: ['recipient.customerId is required'] };
    }
    if (rec.type === 'booking' && typeof rec.bookingId !== 'string') {
      return { valid: false, errors: ['recipient.bookingId is required'] };
    }
    if (typeof record.templateId !== 'string' || !record.templateId.trim()) {
      return { valid: false, errors: ['templateId is required'] };
    }

    return { valid: true, errors: [], normalizedConfig: record };
  }

  async preview(
    config: Record<string, unknown>,
    ctx: WorkflowActionExecutionContext,
  ): Promise<WorkflowActionPreviewResult> {
    const parsed = config as unknown as WhatsAppTemplateSendActionConfig;
    const allowExplicit = (ctx.actor.permissions ?? []).includes('WORKFLOW_CUSTOMER_CONTACT')
      || (ctx.actor.permissions ?? []).includes('WORKFLOW_ADMIN');

    try {
      const result = await this.whatsAppSend.sendTemplate(parsed, ctx, {
        allowExplicitPhone: allowExplicit,
        dryRun: true,
      });
      return {
        sideEffectFree: true,
        summary: `Would send WhatsApp template ${result.templateName ?? parsed.templateId}`,
        plannedEffects: this.describePlannedEffects(config, ctx),
        metadata: {
          deliveryStatus: result.deliveryStatus,
          maskedRecipient: result.maskedRecipient,
          templateId: result.templateId,
          templateLanguage: result.templateLanguage,
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        sideEffectFree: true,
        summary: `WhatsApp template send blocked: ${message}`,
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
      `Send WhatsApp template ${String(config.templateId ?? '?')}`,
      `Language: ${String(config.language ?? 'from template')}`,
      `Recipient: ${recipient?.type ?? '?'} → ${masked}`,
      `Variables: ${config.variables ? Object.keys(config.variables as object).length : 0} key(s)`,
    ];
  }

  async execute(
    config: Record<string, unknown>,
    ctx: WorkflowActionExecutionContext,
  ): Promise<WorkflowActionExecuteResult> {
    const parsed = config as unknown as WhatsAppTemplateSendActionConfig;
    const allowExplicit = (ctx.actor.permissions ?? []).includes('WORKFLOW_CUSTOMER_CONTACT')
      || (ctx.actor.permissions ?? []).includes('WORKFLOW_ADMIN');

    if (parsed.toPhone && !allowExplicit) {
      return {
        status: 'FAILED',
        errorMessage: 'Explicit toPhone requires WORKFLOW_CUSTOMER_CONTACT permission',
        errorCategory: 'AUTHORIZATION',
      };
    }

    const dryRun = false;

    try {
      const result = await this.whatsAppSend.sendTemplate(parsed, ctx, {
        allowExplicitPhone: allowExplicit,
        dryRun,
      });

      const audit = this.audit.record(
        ctx,
        'whatsapp.template.send',
        result.duplicate ? 'duplicate' : 'execute',
        result.duplicate
          ? 'WhatsApp template already sent for idempotency key'
          : 'WhatsApp template sent via workflow',
        {
          whatsAppMessageId: result.whatsAppMessageId || undefined,
          deliveryStatus: result.deliveryStatus,
          templateId: result.templateId,
          templateName: result.templateName,
          templateLanguage: result.templateLanguage,
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
          templateId: result.templateId,
          templateName: result.templateName,
          templateLanguage: result.templateLanguage,
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
