import { Injectable } from '@nestjs/common';
import { RISK_CLASS_RANK } from '../actions/workflow-action-registry.constants';
import type { WorkflowActionRiskClass } from '../actions/workflow-action-registry.types';
import { getWorkflowActionPolicy } from './workflow-action-policy.matrix';
import { buildPolicySnapshot } from './workflow-action-policy.snapshot';
import { WorkflowActionSafetyBlockService } from './workflow-action-safety-block.service';
import type {
  WorkflowActionPolicyEvaluateInput,
  WorkflowActionPolicyEvaluation,
  WorkflowActionPolicyViolation,
  WorkflowActionTechnicalPolicy,
} from './workflow-action-policy.types';

@Injectable()
export class WorkflowActionPolicyService {
  constructor(private readonly safetyBlocks: WorkflowActionSafetyBlockService) {}

  evaluate(input: WorkflowActionPolicyEvaluateInput): WorkflowActionPolicyEvaluation {
    const violations: WorkflowActionPolicyViolation[] = [];
    const policy = getWorkflowActionPolicy(input.actionType);

    if (!policy) {
      return this.denied(input.actionType, [
        { code: 'UNKNOWN_ACTION', message: `No technical policy for action: ${input.actionType}` },
      ]);
    }

    if (!input.organizationId?.trim()) {
      violations.push({ code: 'TENANT_VIOLATION', message: 'organizationId is required' });
    }

    const safety = this.safetyBlocks.evaluate(input);
    if (safety.blocked) {
      violations.push({
        code: safety.code ?? 'SAFETY_BLOCK',
        message: safety.reason ?? 'Action blocked by safety policy',
      });
    }

    const useFrozenSnapshot = Boolean(input.runApproved && input.frozenSnapshot);
    const snapshot = useFrozenSnapshot
      ? input.frozenSnapshot!
      : buildPolicySnapshot(policy);

    if (
      !useFrozenSnapshot
      && input.frozenSnapshot
      && input.frozenSnapshot.snapshotHash !== snapshot.snapshotHash
      && input.mode === 'execute'
      && input.runApproved
    ) {
      violations.push({
        code: 'POLICY_CHANGED_POST_APPROVAL',
        message: 'Policy changed after approval — frozen snapshot preserved',
      });
    }

    const activePolicy = useFrozenSnapshot
      ? this.policyFromSnapshot(snapshot, policy)
      : policy;

    if (activePolicy.capabilityGate === 'DISABLED') {
      violations.push({
        code: 'CAPABILITY_DISABLED',
        message: `Action ${input.actionType} is disabled by technical policy`,
      });
    }

    if (input.mode === 'preview' && !activePolicy.dryRunAvailable) {
      violations.push({
        code: 'DRY_RUN_UNAVAILABLE',
        message: `Dry-run preview is not available for ${input.actionType}`,
      });
    }

    this.assertRiskNotDowngraded(activePolicy.riskClass, input.clientRiskClass, violations);
    this.assertPermission(input.actorPermissions ?? [], activePolicy.requiredPermission, violations);
    this.assertTrigger(input.eventType, activePolicy, violations);
    this.assertEntityType(input.entityType, activePolicy, violations);
    this.assertScope(input.scopeType, activePolicy, violations);
    this.assertForbiddenCombinations(input.eventType, activePolicy, violations);

    const requiresApproval =
      activePolicy.approvalRule === 'REQUIRED'
      && input.mode === 'execute'
      && !input.runApproved;

    if (requiresApproval) {
      violations.push({
        code: 'APPROVAL_REQUIRED',
        message: `Approval required for ${input.actionType} (${activePolicy.riskClass})`,
      });
    }

    return {
      allowed: violations.length === 0,
      violations,
      policy: activePolicy,
      snapshot,
      requiresApproval,
      safetyBlocked: safety.blocked,
      useFrozenSnapshot,
    };
  }

  private denied(
    actionType: string,
    violations: WorkflowActionPolicyViolation[],
  ): WorkflowActionPolicyEvaluation {
    const fallbackPolicy = getWorkflowActionPolicy(actionType);
    const snapshot = fallbackPolicy
      ? buildPolicySnapshot(fallbackPolicy)
      : buildPolicySnapshot({
          actionType,
          policyVersion: 'unknown',
          capabilityGate: 'DISABLED',
          riskClass: 'CRITICAL',
          requiredPermission: 'WORKFLOW_ADMIN',
          approvalRule: 'REQUIRED',
          allowedTriggers: [],
          allowedEntityTypes: [],
          allowedScopes: [],
          timeout: { defaultMs: 0, maxMs: 0 },
          retry: { maxAttempts: 0, initialBackoffMs: 0, maxBackoffMs: 0 },
          maxAttempts: 0,
          fallbackCapable: false,
          dataCategories: [],
          auditLevel: 'FORENSIC',
          retentionClass: 'COMPLIANCE',
          dryRunAvailable: false,
          compensationPossible: false,
        });

    return {
      allowed: false,
      violations,
      policy: fallbackPolicy ?? snapshot as unknown as WorkflowActionTechnicalPolicy,
      snapshot,
      requiresApproval: true,
      safetyBlocked: false,
      useFrozenSnapshot: false,
    };
  }

  private policyFromSnapshot(
    snapshot: import('./workflow-action-policy.types').WorkflowActionPolicySnapshot,
    current: WorkflowActionTechnicalPolicy,
  ): WorkflowActionTechnicalPolicy {
    return {
      ...current,
      policyVersion: snapshot.policyVersion,
      riskClass: snapshot.riskClass,
      requiredPermission: snapshot.requiredPermission,
      approvalRule: snapshot.approvalRule,
      allowedTriggers: snapshot.allowedTriggers,
      allowedEntityTypes: snapshot.allowedEntityTypes,
      allowedScopes: snapshot.allowedScopes as WorkflowActionTechnicalPolicy['allowedScopes'],
      timeout: snapshot.timeout,
      retry: snapshot.retry,
      maxAttempts: snapshot.maxAttempts,
      fallbackCapable: snapshot.fallbackCapable,
      dataCategories: snapshot.dataCategories,
      auditLevel: snapshot.auditLevel,
      retentionClass: snapshot.retentionClass,
      dryRunAvailable: snapshot.dryRunAvailable,
      compensationPossible: snapshot.compensationPossible,
    };
  }

  private assertRiskNotDowngraded(
    policyRisk: WorkflowActionRiskClass,
    clientRisk: string | undefined,
    violations: WorkflowActionPolicyViolation[],
  ): void {
    if (!clientRisk) return;
    const client = clientRisk.toUpperCase() as WorkflowActionRiskClass;
    if (!(client in RISK_CLASS_RANK)) return;
    if (RISK_CLASS_RANK[client] < RISK_CLASS_RANK[policyRisk]) {
      violations.push({
        code: 'RISK_DOWNGRADE',
        message: `Risk class cannot be downgraded from ${policyRisk} to ${client}`,
      });
    }
  }

  private assertPermission(
    permissions: string[],
    required: string,
    violations: WorkflowActionPolicyViolation[],
  ): void {
    if (
      permissions.includes(required)
      || permissions.includes('WORKFLOW_ADMIN')
    ) {
      return;
    }
    violations.push({
      code: 'PERMISSION_DENIED',
      message: `Missing permission: ${required}`,
    });
  }

  private assertTrigger(
    eventType: string,
    policy: WorkflowActionTechnicalPolicy,
    violations: WorkflowActionPolicyViolation[],
  ): void {
    if (policy.allowedTriggers === '*') return;
    if (!policy.allowedTriggers.includes(eventType)) {
      violations.push({
        code: 'TRIGGER_NOT_ALLOWED',
        message: `Trigger ${eventType} is not allowed for ${policy.actionType}`,
      });
    }
  }

  private assertEntityType(
    entityType: string | null | undefined,
    policy: WorkflowActionTechnicalPolicy,
    violations: WorkflowActionPolicyViolation[],
  ): void {
    if (policy.allowedEntityTypes === '*') return;
    if (!entityType) return;
    if (!policy.allowedEntityTypes.includes(entityType) && !policy.allowedEntityTypes.includes('*')) {
      violations.push({
        code: 'ENTITY_TYPE_NOT_ALLOWED',
        message: `Entity type ${entityType} is not allowed for ${policy.actionType}`,
      });
    }
  }

  private assertScope(
    scopeType: string,
    policy: WorkflowActionTechnicalPolicy,
    violations: WorkflowActionPolicyViolation[],
  ): void {
    const normalized = scopeType || 'organization';
    if (!policy.allowedScopes.includes(normalized as 'organization' | 'vehicle' | 'station')) {
      violations.push({
        code: 'SCOPE_NOT_ALLOWED',
        message: `Scope ${normalized} is not allowed for ${policy.actionType}`,
      });
    }
  }

  private assertForbiddenCombinations(
    eventType: string,
    policy: WorkflowActionTechnicalPolicy,
    violations: WorkflowActionPolicyViolation[],
  ): void {
    for (const combo of policy.forbiddenTriggerCombinations ?? []) {
      if (combo.trigger === eventType) {
        violations.push({
          code: 'TRIGGER_NOT_ALLOWED',
          message: combo.reason,
        });
      }
    }
  }
}
