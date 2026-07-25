import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { WorkflowActionExecutionContext } from '../workflow-action-execution.context';
import {
  DEFAULT_ACTION_RETRY,
  DEFAULT_ACTION_TIMEOUT,
  DEFAULT_IDEMPOTENCY_POLICY,
} from '../workflow-action-registry.constants';
import type {
  WorkflowActionAuthorizationResult,
  WorkflowActionClassifiedError,
  WorkflowActionCompensateResult,
  WorkflowActionConfigSchema,
  WorkflowActionDefinition,
  WorkflowActionExecuteResult,
  WorkflowActionHandler,
  WorkflowActionPreviewResult,
  WorkflowActionRiskClass,
  WorkflowActionValidationResult,
} from '../workflow-action-registry.types';

export abstract class BaseWorkflowActionHandler implements WorkflowActionHandler {
  abstract readonly definition: WorkflowActionDefinition;

  abstract execute(
    config: Record<string, unknown>,
    ctx: WorkflowActionExecutionContext,
  ): Promise<WorkflowActionExecuteResult>;

  validate(
    config: unknown,
    _ctx: WorkflowActionExecutionContext,
  ): WorkflowActionValidationResult {
    const errors: string[] = [];
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return { valid: false, errors: ['config must be an object'] };
    }
    const record = config as Record<string, unknown>;
    if (this.definition.configSchema.additionalProperties === false) {
      for (const key of Object.keys(record)) {
        if (!this.definition.configSchema.properties[key]) {
          errors.push(`Unknown config property: ${key}`);
        }
      }
    }
    for (const [key, prop] of Object.entries(this.definition.configSchema.properties)) {
      if (prop.required && (record[key] === undefined || record[key] === null || record[key] === '')) {
        errors.push(`Missing required config property: ${key}`);
      }
      if (record[key] !== undefined && prop.enum && !prop.enum.includes(String(record[key]))) {
        errors.push(`Invalid enum value for ${key}`);
      }
    }
    return {
      valid: errors.length === 0,
      errors,
      normalizedConfig: record,
    };
  }

  async authorize(
    _config: Record<string, unknown>,
    ctx: WorkflowActionExecutionContext,
  ): Promise<WorkflowActionAuthorizationResult> {
    this.assertTenant(ctx);
    const permission = this.definition.requiredPermission;
    if (!permission) return { authorized: true };
    const perms = ctx.actor.permissions ?? [];
    if (perms.includes(permission) || perms.includes('WORKFLOW_ADMIN')) {
      return { authorized: true };
    }
    return { authorized: false, reason: `Missing permission: ${permission}` };
  }

  async preview(
    config: Record<string, unknown>,
    ctx: WorkflowActionExecutionContext,
  ): Promise<WorkflowActionPreviewResult> {
    return {
      sideEffectFree: true,
      summary: `Would execute ${this.definition.type}@${this.definition.version}`,
      plannedEffects: this.describePlannedEffects(config, ctx),
      metadata: { riskClass: this.definition.riskClass },
    };
  }

  classifyError(error: unknown): WorkflowActionClassifiedError {
    if (error instanceof BadRequestException) {
      return { category: 'VALIDATION', message: error.message, retryable: false };
    }
    if (error instanceof NotFoundException) {
      return { category: 'NOT_FOUND', message: error.message, retryable: false };
    }
    const message = error instanceof Error ? error.message : String(error);
    if (/timeout|ECONNRESET|ETIMEDOUT/i.test(message)) {
      return { category: 'TRANSIENT', message, retryable: true };
    }
    return { category: 'UNKNOWN', message, retryable: false };
  }

  protected describePlannedEffects(
    _config: Record<string, unknown>,
    _ctx: WorkflowActionExecutionContext,
  ): string[] {
    return [`Execute handler ${this.definition.type}`];
  }

  protected assertTenant(ctx: WorkflowActionExecutionContext): void {
    if (!ctx.organizationId?.trim()) {
      throw new BadRequestException('organizationId is required');
    }
  }

  protected vehicleIdFromContext(ctx: WorkflowActionExecutionContext): string | undefined {
    const fromPayload = ctx.event.payload.vehicleId;
    if (typeof fromPayload === 'string' && fromPayload) return fromPayload;
    if (ctx.event.entityType === 'vehicle' && ctx.event.entityId) return ctx.event.entityId;
    return undefined;
  }

  protected bookingIdFromContext(ctx: WorkflowActionExecutionContext): string | undefined {
    if (ctx.event.entityType === 'booking' && ctx.event.entityId) return ctx.event.entityId;
    const fromPayload = ctx.event.payload.bookingId;
    return typeof fromPayload === 'string' ? fromPayload : undefined;
  }

  protected buildDefinition(partial: {
    type: string;
    version: string;
    capabilityStatus: WorkflowActionDefinition['capabilityStatus'];
    configSchema: WorkflowActionConfigSchema;
    riskClass: WorkflowActionRiskClass;
    requiredPermission?: string;
    requiresApproval?: boolean;
    timeoutPolicy?: WorkflowActionDefinition['timeoutPolicy'];
    retryPolicy?: WorkflowActionDefinition['retryPolicy'];
    idempotencyPolicy?: WorkflowActionDefinition['idempotencyPolicy'];
  }): WorkflowActionDefinition {
    return {
      type: partial.type,
      version: partial.version,
      capabilityStatus: partial.capabilityStatus,
      configSchema: partial.configSchema,
      riskClass: partial.riskClass,
      requiredPermission: partial.requiredPermission,
      requiresApproval: partial.requiresApproval ?? false,
      timeoutPolicy: partial.timeoutPolicy ?? DEFAULT_ACTION_TIMEOUT,
      retryPolicy: partial.retryPolicy ?? DEFAULT_ACTION_RETRY,
      idempotencyPolicy: partial.idempotencyPolicy ?? DEFAULT_IDEMPOTENCY_POLICY,
    };
  }

  async compensate(
    _config: Record<string, unknown>,
    _ctx: WorkflowActionExecutionContext,
    _executeOutput: Record<string, unknown>,
  ): Promise<WorkflowActionCompensateResult> {
    return { compensated: false, summary: 'Compensation not supported for this action' };
  }
}
