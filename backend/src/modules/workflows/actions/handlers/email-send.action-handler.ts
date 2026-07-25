import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { WorkflowActionExecutionContext } from '../workflow-action-execution.context';
import type { WorkflowActionExecuteResult, WorkflowActionValidationResult } from '../workflow-action-registry.types';
import { WorkflowActionAuditService } from '../adapters/workflow-action-audit.service';
import type {
  EmailSendActionConfig,
  WorkflowEmailLocale,
  WorkflowEmailTemplateKey,
} from '../adapters/workflow-action-adapter.types';
import { maskEmailAddress } from '../adapters/workflow-email-mask.util';
import { WorkflowEmailSendService } from '../adapters/workflow-email-send.service';
import { WORKFLOW_EMAIL_TEMPLATES } from '../adapters/workflow-email-templates';
import { BaseWorkflowActionHandler } from './base-workflow-action.handler';

@Injectable()
export class EmailSendActionHandler extends BaseWorkflowActionHandler {
  readonly definition = this.buildDefinition({
    type: 'email.send',
    version: '1.0.0',
    capabilityStatus: 'ENABLED',
    riskClass: 'MEDIUM',
    requiredPermission: 'WORKFLOW_CUSTOMER_CONTACT',
    configSchema: {
      schemaVersion: '1.0.0',
      additionalProperties: false,
      properties: {
        templateId: {
          type: 'string',
          required: true,
          enum: ['booking_follow_up', 'invoice_reminder', 'workflow_operational'],
        },
        templateVersion: { type: 'string', required: true },
        locale: { type: 'string', enum: ['de', 'en'] },
        subject: { type: 'string' },
        recipient: { type: 'object', required: true },
        toEmail: { type: 'string' },
        params: { type: 'object' },
        attachmentDocumentIds: { type: 'array' },
        respectSendWindow: { type: 'boolean' },
        verifiedDiagnosis: { type: 'boolean' },
      },
    },
    timeoutPolicy: { defaultMs: 120_000, maxMs: 600_000 },
  });

  constructor(
    private readonly emailSend: WorkflowEmailSendService,
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
    const templateId = record.templateId as WorkflowEmailTemplateKey;
    const template = WORKFLOW_EMAIL_TEMPLATES[templateId];
    if (!template) {
      return { valid: false, errors: [`Unknown templateId: ${String(record.templateId)}`] };
    }
    if (record.templateVersion !== template.version) {
      return {
        valid: false,
        errors: [`templateVersion must be ${template.version} for ${templateId}`],
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
    if (rec.type === 'customer' && typeof rec.customerId !== 'string') {
      return { valid: false, errors: ['recipient.customerId is required'] };
    }
    if (rec.type === 'booking' && typeof rec.bookingId !== 'string') {
      return { valid: false, errors: ['recipient.bookingId is required'] };
    }

    if (record.toEmail !== undefined && typeof record.toEmail !== 'string') {
      return { valid: false, errors: ['toEmail must be a string'] };
    }

    const locale = record.locale as WorkflowEmailLocale | undefined;
    if (locale && locale !== 'de' && locale !== 'en') {
      return { valid: false, errors: ['locale must be de or en'] };
    }

    return { valid: true, errors: [], normalizedConfig: record };
  }

  protected describePlannedEffects(
    config: Record<string, unknown>,
    _ctx: WorkflowActionExecutionContext,
  ): string[] {
    const templateId = String(config.templateId ?? 'workflow_operational');
    const locale = String(config.locale ?? 'de');
    const recipient = config.recipient as { type?: string } | undefined;
    const masked = config.toEmail ? maskEmailAddress(String(config.toEmail)) : '(resolved from entity)';
    return [
      `Send email via template "${templateId}"@${String(config.templateVersion ?? '?')}`,
      `Locale: ${locale}`,
      `Recipient: ${recipient?.type ?? '?'} → ${masked}`,
      `Attachments: ${Array.isArray(config.attachmentDocumentIds) ? config.attachmentDocumentIds.length : 0} document ref(s)`,
    ];
  }

  async execute(
    config: Record<string, unknown>,
    ctx: WorkflowActionExecutionContext,
  ): Promise<WorkflowActionExecuteResult> {
    const parsed = config as unknown as EmailSendActionConfig;
    const allowExplicit = (ctx.actor.permissions ?? []).includes('WORKFLOW_CUSTOMER_CONTACT')
      || (ctx.actor.permissions ?? []).includes('WORKFLOW_ADMIN');

    if (parsed.toEmail && !allowExplicit) {
      return {
        status: 'FAILED',
        errorMessage: 'Explicit toEmail requires WORKFLOW_CUSTOMER_CONTACT permission',
        errorCategory: 'AUTHORIZATION',
      };
    }

    try {
      const result = await this.emailSend.send(parsed, ctx, { allowExplicitRecipient: allowExplicit });

      if (result.deliveryStatus === 'SUPPRESSED') {
        const audit = this.audit.record(
          ctx,
          'email.send',
          'denied',
          'Recipient suppressed — email not sent',
          { deliveryStatus: 'SUPPRESSED', maskedRecipient: result.maskedRecipient },
        );
        return {
          status: 'FAILED',
          errorMessage: 'Recipient email is suppressed',
          errorCategory: 'CAPABILITY',
          output: { deliveryStatus: 'SUPPRESSED', auditId: audit.auditId },
        };
      }

      const audit = this.audit.record(
        ctx,
        'email.send',
        result.duplicate ? 'duplicate' : 'execute',
        result.duplicate ? 'Email already sent for idempotency key' : 'Email sent via workflow',
        {
          outboundEmailId: result.outboundEmailId,
          deliveryStatus: result.deliveryStatus,
          templateId: result.templateId,
          templateVersion: result.templateVersion,
          locale: result.locale,
          maskedRecipient: result.maskedRecipient,
          providerMessageId: result.providerMessageId,
        },
      );

      return {
        status: 'SUCCESS',
        idempotentReplay: result.duplicate,
        output: {
          outboundEmailId: result.outboundEmailId,
          deliveryStatus: result.deliveryStatus,
          providerMessageId: result.providerMessageId,
          idempotencyKey: result.idempotencyKey,
          maskedRecipient: result.maskedRecipient,
          templateId: result.templateId,
          templateVersion: result.templateVersion,
          locale: result.locale,
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
          errorCategory: err instanceof NotFoundException ? 'NOT_FOUND' : 'VALIDATION',
        };
      }
      throw err;
    }
  }
}
