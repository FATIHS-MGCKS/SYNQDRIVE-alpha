import { Injectable } from '@nestjs/common';
import { WorkflowActionRunStatus } from '@prisma/client';
import type { WorkflowActionExecutionContext } from './workflow-action-execution.context';
import { RISK_CLASS_RANK } from './workflow-action-registry.constants';
import { WorkflowActionRegistryService } from './workflow-action-registry.service';
import { WorkflowActionPolicyService } from '../policies/workflow-action-policy.service';
import type { WorkflowActionPolicySnapshot } from '../policies/workflow-action-policy.types';
import { parsePolicySnapshot } from '../policies/workflow-action-policy.snapshot';
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
  constructor(
    private readonly registry: WorkflowActionRegistryService,
    private readonly policyService: WorkflowActionPolicyService,
  ) {}

  validateConfig(
    type: string,
    config: unknown,
    context: WorkflowActionExecutionContext,
    version?: string,
  ): WorkflowActionValidationResult {
    const handler = this.registry.resolve(type, version ?? context.actionVersion);
    this.assertCapability(handler.definition.capabilityStatus, type);
    const policy = this.enforcePolicy('preview', type, config, context);
    this.assertRiskNotDowngraded(policy.policy.riskClass, context.clientRiskClass);
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
    const policy = this.enforcePolicy('preview', type, config, context);
    this.assertRiskNotDowngraded(policy.policy.riskClass, context.clientRiskClass);
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

    let policyEval;
    try {
      policyEval = this.enforcePolicy('execute', type, config, context);
    } catch (err) {
      if (err instanceof WorkflowActionRegistryError) {
        return {
          status: 'FAILED',
          errorMessage: err.message,
          errorCategory: err.code === 'UNAUTHORIZED' ? 'AUTHORIZATION' : 'VALIDATION',
        };
      }
      throw err;
    }

    this.assertRiskNotDowngraded(policyEval.policy.riskClass, context.clientRiskClass);

    if (policyEval.requiresApproval) {
      return {
        status: 'WAITING_APPROVAL',
        output: {
          waitingApproval: true,
          policySnapshot: policyEval.snapshot,
        },
      };
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

  private enforcePolicy(
    mode: 'preview' | 'execute',
    actionType: string,
    config: unknown,
    context: WorkflowActionExecutionContext,
  ) {
    const frozen = parsePolicySnapshot(context.policySnapshot);
    const evaluation = this.policyService.evaluate({
      organizationId: context.organizationId,
      actionType,
      eventType: context.event.eventType,
      entityType: context.event.entityType,
      scopeType: context.scopeType ?? 'organization',
      actorPermissions: context.actor.permissions,
      clientRiskClass: context.clientRiskClass,
      mode,
      frozenSnapshot: frozen,
      runApproved: context.runApproved,
      actionConfig:
        config && typeof config === 'object' && !Array.isArray(config)
          ? (config as Record<string, unknown>)
          : {},
      payload: context.event.payload,
    });

    context.policySnapshot = evaluation.snapshot as unknown as Record<string, unknown>;

    if (!evaluation.allowed) {
      const primary = evaluation.violations[0];
      throw new WorkflowActionRegistryError(
        evaluation.violations.map((v) => v.message).join('; '),
        this.mapViolationCode(primary?.code),
      );
    }

    return evaluation;
  }

  private mapViolationCode(
    code?: string,
  ): WorkflowActionRegistryError['code'] {
    switch (code) {
      case 'CAPABILITY_DISABLED':
        return 'CAPABILITY_DISABLED';
      case 'PERMISSION_DENIED':
      case 'RISK_DOWNGRADE':
        return code === 'PERMISSION_DENIED' ? 'UNAUTHORIZED' : 'RISK_DOWNGRADE';
      case 'TENANT_VIOLATION':
        return 'TENANT_VIOLATION';
      case 'TRIGGER_NOT_ALLOWED':
      case 'ENTITY_TYPE_NOT_ALLOWED':
      case 'SCOPE_NOT_ALLOWED':
      case 'APPROVAL_REQUIRED':
      case 'SAFETY_BLOCK':
      case 'UNVERIFIED_DIAGNOSIS':
      case 'DRY_RUN_UNAVAILABLE':
      case 'POLICY_CHANGED_POST_APPROVAL':
        return 'VALIDATION_FAILED';
      default:
        return 'VALIDATION_FAILED';
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
