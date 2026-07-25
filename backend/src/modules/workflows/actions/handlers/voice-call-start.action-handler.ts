import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { WorkflowActionExecutionContext } from '../workflow-action-execution.context';
import type {
  WorkflowActionExecuteResult,
  WorkflowActionPreviewResult,
  WorkflowActionValidationResult,
} from '../workflow-action-registry.types';
import { WorkflowActionAuditService } from '../adapters/workflow-action-audit.service';
import type {
  VoiceCallStartActionConfig,
  WorkflowVoiceScenarioKey,
} from '../adapters/workflow-action-adapter.types';
import { maskPhoneNumber } from '../adapters/workflow-whatsapp-mask.util';
import { WorkflowVoiceCallStartService } from '../adapters/workflow-voice-call-start.service';
import { WORKFLOW_VOICE_SCENARIOS } from '../adapters/workflow-voice-scenarios';
import { BaseWorkflowActionHandler } from './base-workflow-action.handler';

@Injectable()
export class VoiceCallStartActionHandler extends BaseWorkflowActionHandler {
  readonly definition = this.buildDefinition({
    type: 'voice.call.start',
    version: '1.0.0',
    capabilityStatus: 'ENABLED',
    riskClass: 'HIGH',
    requiredPermission: 'WORKFLOW_VOICE_CALL',
    configSchema: {
      schemaVersion: '1.0.0',
      additionalProperties: false,
      properties: {
        scenarioKey: {
          type: 'string',
          required: true,
          enum: [
            'booking_follow_up',
            'invoice_reminder',
            'complaint_resolution',
            'operational_workflow',
            'emergency_safety',
          ],
        },
        scenarioVersion: { type: 'string', required: true },
        callPurpose: {
          type: 'string',
          required: true,
          enum: ['transactional', 'support', 'collections', 'emergency'],
        },
        recipient: { type: 'object', required: true },
        toPhone: { type: 'string' },
        agentVersion: { type: 'number' },
        toolAllowlist: { type: 'array' },
        maxDurationSeconds: { type: 'number' },
        respectCallHours: { type: 'boolean' },
        verifiedDiagnosis: { type: 'boolean' },
        includeTechnicalDiagnosis: { type: 'boolean' },
        sensitiveFlags: { type: 'array' },
      },
    },
    timeoutPolicy: { defaultMs: 300_000, maxMs: 600_000 },
  });

  constructor(
    private readonly voiceCallStart: WorkflowVoiceCallStartService,
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
    const scenarioKey = record.scenarioKey as WorkflowVoiceScenarioKey;
    const scenario = WORKFLOW_VOICE_SCENARIOS[scenarioKey];
    if (!scenario) {
      return { valid: false, errors: [`Unknown scenarioKey: ${String(record.scenarioKey)}`] };
    }
    if (record.scenarioVersion !== scenario.version) {
      return {
        valid: false,
        errors: [`scenarioVersion must be ${scenario.version} for ${scenarioKey}`],
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
    const parsed = config as unknown as VoiceCallStartActionConfig;
    const allowExplicit = (ctx.actor.permissions ?? []).includes('WORKFLOW_VOICE_CALL')
      || (ctx.actor.permissions ?? []).includes('WORKFLOW_ADMIN');

    try {
      const result = await this.voiceCallStart.start(parsed, ctx, {
        allowExplicitPhone: allowExplicit,
        dryRun: true,
      });
      return {
        sideEffectFree: true,
        summary: `Would start voice call scenario ${result.scenarioKey}`,
        plannedEffects: this.describePlannedEffects(config, ctx),
        metadata: {
          callPlan: result.callPlan,
          maskedRecipient: result.maskedRecipient,
          maxDurationSeconds: result.maxDurationSeconds,
          toolAllowlist: result.toolAllowlist,
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        sideEffectFree: true,
        summary: `Voice call blocked: ${message}`,
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
      `Start outbound voice call via SynqDrive Voice Orchestrator`,
      `Scenario: "${String(config.scenarioKey ?? 'operational_workflow')}"@${String(config.scenarioVersion ?? '?')}`,
      `Purpose: ${String(config.callPurpose ?? 'transactional')}`,
      `Recipient: ${recipient?.type ?? '?'} → ${masked}`,
      `No direct Twilio/ElevenLabs orchestration from workflow runtime`,
    ];
  }

  async execute(
    config: Record<string, unknown>,
    ctx: WorkflowActionExecutionContext,
  ): Promise<WorkflowActionExecuteResult> {
    const parsed = config as unknown as VoiceCallStartActionConfig;
    const allowExplicit = (ctx.actor.permissions ?? []).includes('WORKFLOW_VOICE_CALL')
      || (ctx.actor.permissions ?? []).includes('WORKFLOW_ADMIN');
    const scenario = WORKFLOW_VOICE_SCENARIOS[parsed.scenarioKey];

    if (parsed.toPhone && !allowExplicit) {
      return {
        status: 'FAILED',
        errorMessage: 'Explicit toPhone requires WORKFLOW_VOICE_CALL permission',
        errorCategory: 'AUTHORIZATION',
      };
    }

    const needsApproval =
      scenario.requiresApproval
      || (parsed.sensitiveFlags?.length ?? 0) > 0
      || parsed.callPurpose === 'emergency'
      || scenario.emergencyEscalation;

    if (needsApproval && !ctx.runApproved) {
      return {
        status: 'FAILED',
        errorMessage: 'Sensitive or high-risk voice call requires workflow approval',
        errorCategory: 'VALIDATION',
      };
    }

    try {
      const result = await this.voiceCallStart.start(parsed, ctx, { allowExplicitPhone: allowExplicit });

      const audit = this.audit.record(
        ctx,
        'voice.call.start',
        result.duplicate ? 'duplicate' : 'execute',
        result.duplicate
          ? 'Voice call already requested for idempotency key'
          : 'Outbound voice call started via workflow orchestrator',
        {
          conversationId: result.conversationId,
          maskedRecipient: result.maskedRecipient,
          status: result.status,
          twilioCallSid: result.twilioCallSid,
          elevenLabsConversationId: result.elevenLabsConversationId,
          scenarioKey: result.scenarioKey,
          scenarioVersion: result.scenarioVersion,
          agentDeploymentId: result.agentDeploymentId,
          agentVersion: result.agentVersion,
          maxDurationSeconds: result.maxDurationSeconds,
          toolAllowlist: result.toolAllowlist,
        },
      );

      return {
        status: 'SUCCESS',
        idempotentReplay: result.duplicate,
        output: {
          conversationId: result.conversationId,
          idempotencyKey: result.idempotencyKey,
          maskedRecipient: result.maskedRecipient,
          status: result.status,
          twilioCallSid: result.twilioCallSid,
          elevenLabsConversationId: result.elevenLabsConversationId,
          scenarioKey: result.scenarioKey,
          scenarioVersion: result.scenarioVersion,
          agentDeploymentId: result.agentDeploymentId,
          agentVersion: result.agentVersion,
          maxDurationSeconds: result.maxDurationSeconds,
          toolAllowlist: result.toolAllowlist,
          auditId: audit.auditId,
        },
      };
    } catch (err: unknown) {
      if (
        err instanceof BadRequestException
        || err instanceof NotFoundException
        || err instanceof ForbiddenException
        || err instanceof ServiceUnavailableException
      ) {
        return {
          status: 'FAILED',
          errorMessage: err.message,
          errorCategory: err instanceof NotFoundException
            ? 'NOT_FOUND'
            : err instanceof ForbiddenException
              ? 'AUTHORIZATION'
              : err instanceof ServiceUnavailableException
                ? 'TRANSIENT'
                : 'VALIDATION',
        };
      }
      throw err;
    }
  }
}
