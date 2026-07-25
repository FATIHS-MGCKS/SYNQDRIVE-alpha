import { Injectable } from '@nestjs/common';
import { WorkflowActionRunStatus } from '@prisma/client';
import type { WorkflowActionExecutionContext } from './workflow-action-execution.context';
import { RISK_CLASS_RANK } from './workflow-action-registry.constants';
import { WorkflowActionRegistryService } from './workflow-action-registry.service';
import {
  WorkflowActionRegistryError,
  type WorkflowActionExecuteResult,
  type WorkflowActionPreviewResult,
  type WorkflowActionRiskClass,
  type WorkflowActionValidationResult,
} from './workflow-action-registry.types';

export interface WorkflowActionInvokeInput {
  type: string;
  version?: string;
  config: unknown;
  context: WorkflowActionExecutionContext;
  mode: 'validate' | 'preview' | 'execute';
}

@Injectable()
export class WorkflowActionRegistryExecutorService {
  constructor(private readonly registry: WorkflowActionRegistryService) {}

  validateConfig(
    type: string,
    config: unknown,
    context: WorkflowActionExecutionContext,
    version?: string,
  ): WorkflowActionValidationResult {
    const handler = this.registry.resolve(type, version ?? context.actionVersion);
    this.assertCapability(handler.definition.capabilityStatus, type);
    this.assertRiskNotDowngraded(handler.definition.riskClass, context.clientRiskClass);
    return handler.validate(config, context);
  }

  async preview(
    type: string,
    config: Record<string, unknown>,
    context: WorkflowActionExecutionContext,
    version?: string,
  ): Promise<WorkflowActionPreviewResult> {
    const handler = this.registry.resolve(type, version ?? context.actionVersion);
    this.assertCapability(handler.definition.capabilityStatus, type);
    this.assertRiskNotDowngraded(handler.definition.riskClass, context.clientRiskClass);
    const validation = handler.validate(config, context);
    if (!validation.valid) {
      throw new WorkflowActionRegistryError(
        validation.errors.join('; '),
        'VALIDATION_FAILED',
      );
    }
    const auth = await handler.authorize(validation.normalizedConfig ?? config, context);
    if (!auth.authorized) {
      throw new WorkflowActionRegistryError(auth.reason ?? 'Unauthorized', 'UNAUTHORIZED');
    }
    return handler.preview(validation.normalizedConfig ?? config, context);
  }

  async execute(
    type: string,
    config: Record<string, unknown>,
    context: WorkflowActionExecutionContext,
    version?: string,
  ): Promise<WorkflowActionExecuteResult> {
    const handler = this.registry.resolve(type, version ?? context.actionVersion);
    const def = handler.definition;
    this.assertCapability(def.capabilityStatus, type);
    this.assertRiskNotDowngraded(def.riskClass, context.clientRiskClass);

    if (def.requiresApproval && context.actor.kind === 'system') {
      // Approval gate is part of handler execute for approval-request types;
      // other actions with requiresApproval still route through WAITING_APPROVAL upstream.
    }

    const validation = handler.validate(config, context);
    if (!validation.valid) {
      return {
        status: 'FAILED',
        errorMessage: validation.errors.join('; '),
        errorCategory: 'VALIDATION',
      };
    }

    const normalized = validation.normalizedConfig ?? config;
    const auth = await handler.authorize(normalized, context);
    if (!auth.authorized) {
      return {
        status: 'FAILED',
        errorMessage: auth.reason ?? 'Unauthorized',
        errorCategory: 'AUTHORIZATION',
      };
    }

    try {
      context.logger.debug(`Executing ${type}@${def.version}`, {
        actionRunId: context.actionRunId,
        organizationId: context.organizationId,
      });
      return await handler.execute(normalized, context);
    } catch (err) {
      const classified = handler.classifyError(err);
      return {
        status: 'FAILED',
        errorMessage: classified.message,
        errorCategory: classified.category,
      };
    }
  }

  toLegacyStatus(result: WorkflowActionExecuteResult): WorkflowActionRunStatus {
    if (result.status === 'WAITING_APPROVAL') return 'WAITING_APPROVAL';
    if (result.status === 'FAILED') return 'FAILED';
    return 'SUCCESS';
  }

  private assertCapability(
    status: import('./workflow-action-registry.types').WorkflowActionCapabilityStatus,
    type: string,
  ): void {
    if (status === 'DISABLED') {
      throw new WorkflowActionRegistryError(
        `Action ${type} is disabled`,
        'CAPABILITY_DISABLED',
      );
    }
  }

  private assertRiskNotDowngraded(
    handlerRisk: WorkflowActionRiskClass,
    clientRisk?: string,
  ): void {
    if (!clientRisk) return;
    const client = clientRisk.toUpperCase() as WorkflowActionRiskClass;
    if (!(client in RISK_CLASS_RANK)) return;
    if (RISK_CLASS_RANK[client] < RISK_CLASS_RANK[handlerRisk]) {
      throw new WorkflowActionRegistryError(
        `Risk class cannot be downgraded from ${handlerRisk} to ${client}`,
        'RISK_DOWNGRADE',
      );
    }
  }
}
