import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { WorkflowActionExecutionContext } from '../workflow-action-execution.context';
import type {
  WorkflowActionExecuteResult,
  WorkflowActionPreviewResult,
  WorkflowActionValidationResult,
} from '../workflow-action-registry.types';
import { WorkflowActionAuditService } from '../adapters/workflow-action-audit.service';
import type { SmsSendActionConfig, WorkflowSmsTemplateKey } from '../adapters/workflow-action-adapter.types';
import { maskPhoneNumber } from '../adapters/workflow-whatsapp-mask.util';
import { WorkflowSmsSendService } from '../adapters/workflow-sms-send.service';
import { WORKFLOW_SMS_TEMPLATES } from '../adapters/workflow-sms-templates';
import { BaseWorkflowActionHandler } from './base-workflow-action.handler';

@Injectable()
export class SmsSendActionHandler extends BaseWorkflowActionHandler {
  readonly definition = this.buildDefinition({
    type: 'sms.send',
    version: '1.0.0',
    capabilityStatus: 'ENABLED',
    riskClass: 'HIGH',
    requiredPermission: 'WORKFLOW_CUSTOMER_CONTACT',
    configSchema: {
      schemaVersion: '1.0.0',
      additionalProperties: false,
      properties: {
        templateKey: {
          type: 'string',
          required: true,
          enum: ['booking_follow_up', 'pickup_reminder', 'workflow_operational'],
        },
        templateVersion: { type: 'string', required: true },
        locale: { type: 'string', enum: ['de', 'en'] },
        recipient: { type: 'object', required: true },
        toPhone: { type: 'string' },
        params: { type: 'object' },
        messageKind: { type: 'string', enum: ['transactional', 'marketing', 'support'] },
        respectQuietHours: { type: 'boolean' },
        verifiedDiagnosis: { type: 'boolean' },
        maxSegments: { type: 'number' },
        fallbackFromWhatsAppMessageId: { type: 'string' },
        sensitiveFlags: { type: 'array' },
      },
    },
    timeoutPolicy: { defaultMs: 120_000, maxMs: 600_000 },
  });

  constructor(
    private readonly smsSend: WorkflowSmsSendService,
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
    const templateKey = record.templateKey as WorkflowSmsTemplateKey;
    const template = WORKFLOW_SMS_TEMPLATES[templateKey];
    if (!template) {
      return { valid: false, errors: [`Unknown templateKey: ${String(record.templateKey)}`] };
    }
    if (record.templateVersion !== template.version) {
      return {
        valid: false,
        errors: [`templateVersion must be ${template.version} for ${templateKey}`],
      };
    }

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

  async preview(
    config: Record<string, unknown>,
    ctx: WorkflowActionExecutionContext,
  ): Promise<WorkflowActionPreviewResult> {
    const parsed = config as unknown as SmsSendActionConfig;
    const allowExplicit = (ctx.actor.permissions ?? []).includes('WORKFLOW_CUSTOMER_CONTACT')
      || (ctx.actor.permissions ?? []).includes('WORKFLOW_ADMIN');

    try {
      const result = await this.smsSend.send(parsed, ctx, {
        allowExplicitPhone: allowExplicit,
        dryRun: true,
      });
      return {
        sideEffectFree: true,
        summary: `Would send SMS template ${result.templateKey}`,
        plannedEffects: this.describePlannedEffects(config, ctx),
        metadata: {
          deliveryStatus: result.deliveryStatus,
          maskedRecipient: result.maskedRecipient,
          segmentCount: result.segmentCount,
          estimatedCostUsd: result.estimatedCostUsd,
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        sideEffectFree: true,
        summary: `SMS send blocked: ${message}`,
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
      `Send SMS via template "${String(config.templateKey ?? 'workflow_operational')}"@${String(config.templateVersion ?? '?')}`,
      `Locale: ${String(config.locale ?? 'de')}`,
      `Recipient: ${recipient?.type ?? '?'} → ${masked}`,
      config.fallbackFromWhatsAppMessageId
        ? `WhatsApp fallback link: ${String(config.fallbackFromWhatsAppMessageId)}`
        : 'No channel fallback link',
    ];
  }

  async execute(
    config: Record<string, unknown>,
    ctx: WorkflowActionExecutionContext,
  ): Promise<WorkflowActionExecuteResult> {
    const parsed = config as unknown as SmsSendActionConfig;
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
        errorMessage: 'SMS with sensitive flags requires workflow approval',
        errorCategory: 'VALIDATION',
      };
    }

    try {
      const result = await this.smsSend.send(parsed, ctx, { allowExplicitPhone: allowExplicit });

      const audit = this.audit.record(
        ctx,
        'sms.send',
        result.duplicate ? 'duplicate' : 'execute',
        result.duplicate ? 'SMS already sent for idempotency key' : 'SMS sent via workflow',
        {
          outboundSmsId: result.outboundSmsId,
          deliveryStatus: result.deliveryStatus,
          templateKey: result.templateKey,
          templateVersion: result.templateVersion,
          locale: result.locale,
          maskedRecipient: result.maskedRecipient,
          providerMessageSid: result.providerMessageSid,
          segmentCount: result.segmentCount,
          estimatedCostUsd: result.estimatedCostUsd,
        },
      );

      return {
        status: 'SUCCESS',
        idempotentReplay: result.duplicate,
        output: {
          outboundSmsId: result.outboundSmsId,
          deliveryStatus: result.deliveryStatus,
          providerMessageSid: result.providerMessageSid,
          idempotencyKey: result.idempotencyKey,
          maskedRecipient: result.maskedRecipient,
          templateKey: result.templateKey,
          templateVersion: result.templateVersion,
          locale: result.locale,
          segmentCount: result.segmentCount,
          estimatedCostUsd: result.estimatedCostUsd,
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
