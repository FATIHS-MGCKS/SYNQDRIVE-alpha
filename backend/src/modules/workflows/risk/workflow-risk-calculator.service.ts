import { Injectable } from '@nestjs/common';
import { RISK_CLASS_RANK } from '../actions/workflow-action-registry.constants';
import type { WorkflowActionRiskClass } from '../actions/workflow-action-registry.types';
import { getWorkflowActionPolicy } from '../policies/workflow-action-policy.matrix';
import { WorkflowActionSafetyBlockService } from '../policies/workflow-action-safety-block.service';
import { normalizeActionType, normalizeTriggerType } from '../workflow-definition.validator';
import { applyWorkflowRiskCombinationRules } from './workflow-risk-combination.rules';
import type {
  WorkflowRiskActionAssessment,
  WorkflowRiskAssessment,
  WorkflowRiskAssessmentInput,
} from './workflow-risk-classification.types';
import { getWorkflowRiskPolicyBinding } from './workflow-risk-policy.bindings';
import {
  WORKFLOW_RISK_REGISTRY_VERSION,
  collectSemanticCategories,
  getActionRiskClass,
  getTriggerRiskClass,
  getWorkflowRiskRegistryEntry,
  listCriticalActionsNotGenerallyAvailable,
  listWorkflowRiskRegistryEntries,
} from './workflow-risk.registry';

@Injectable()
export class WorkflowRiskCalculatorService {
  constructor(private readonly safetyBlocks: WorkflowActionSafetyBlockService) {}

  assessWorkflow(input: WorkflowRiskAssessmentInput): WorkflowRiskAssessment {
    const triggerType = normalizeTriggerType(input.trigger.type);
    const triggerRisk = getTriggerRiskClass(triggerType);

    const conditionFields = (input.conditions ?? []).flatMap((c) =>
      [c.field, c.path].filter((v): v is string => typeof v === 'string' && v.length > 0),
    );
    const conditionRisk = this.assessConditionRisk(conditionFields);

    const actionAssessments: WorkflowRiskActionAssessment[] = (input.actions ?? []).map(
      (action, index) => this.assessAction(action.type, index, input, triggerType),
    );

    const actionRisks = actionAssessments.map((a) => a.effectiveRiskClass);
    const maxActionRisk = actionRisks.reduce<WorkflowActionRiskClass>(
      (max, r) => (RISK_CLASS_RANK[r] > RISK_CLASS_RANK[max] ? r : max),
      'LOW',
    );

    const baseWorkflowRisk = [triggerRisk, conditionRisk, maxActionRisk].reduce((max, r) =>
      RISK_CLASS_RANK[r] > RISK_CLASS_RANK[max] ? r : max,
    );

    const semanticCategories = collectSemanticCategories(
      input.actions.map((a) => normalizeActionType(a.type)),
    );

    const { workflowRisk, rules } = applyWorkflowRiskCombinationRules({
      baseWorkflowRisk,
      triggerRisk,
      actionRisks,
      semanticCategories,
      triggerType,
      conditionFields,
    });

    const policyBinding = getWorkflowRiskPolicyBinding(workflowRisk);
    const safetyBlockReasons = actionAssessments
      .filter((a) => a.safetyBlocked && a.safetyBlockReason)
      .map((a) => `${a.actionType}: ${a.safetyBlockReason}`);

    const activationBlockReasons: string[] = [];
    for (const action of actionAssessments) {
      const entry = getWorkflowRiskRegistryEntry('action', normalizeActionType(action.actionType));
      if (entry?.capabilityGate === 'DISABLED') {
        activationBlockReasons.push(`Action ${action.actionType} is not enabled (capability DISABLED)`);
      }
      if (entry?.baseRiskClass === 'CRITICAL' && entry.generallyAvailable === false) {
        activationBlockReasons.push(
          `Action ${action.actionType} is CRITICAL and not generally available for workflow activation`,
        );
      }
    }

    const mandatoryWarnings = [
      ...new Set([...policyBinding.mandatoryWarnings, ...actionAssessments.flatMap(() => [])]),
    ];

    return {
      registryVersion: WORKFLOW_RISK_REGISTRY_VERSION,
      assessedAt: new Date().toISOString(),
      workflowRiskClass: workflowRisk,
      triggerRiskClass: triggerRisk,
      conditionRiskClass: conditionRisk,
      maxActionRiskClass: maxActionRisk,
      combinationRules: rules,
      actions: actionAssessments,
      policyBinding,
      mandatoryWarnings,
      safetyBlocked: safetyBlockReasons.length > 0,
      safetyBlockReasons,
      blockedFromActivation: activationBlockReasons.length > 0,
      activationBlockReasons,
    };
  }

  listRegistry() {
    return {
      registryVersion: WORKFLOW_RISK_REGISTRY_VERSION,
      entries: listWorkflowRiskRegistryEntries(),
      criticalNotGenerallyAvailable: listCriticalActionsNotGenerallyAvailable(),
      policyBindings: {
        LOW: getWorkflowRiskPolicyBinding('LOW'),
        MEDIUM: getWorkflowRiskPolicyBinding('MEDIUM'),
        HIGH: getWorkflowRiskPolicyBinding('HIGH'),
        CRITICAL: getWorkflowRiskPolicyBinding('CRITICAL'),
      },
    };
  }

  private assessAction(
    rawType: string,
    index: number,
    input: WorkflowRiskAssessmentInput,
    triggerType: string,
  ): WorkflowRiskActionAssessment {
    const actionType = normalizeActionType(rawType);
    const registryEntry = getWorkflowRiskRegistryEntry('action', actionType);
    const policy = getWorkflowActionPolicy(actionType);
    const baseRisk = registryEntry?.baseRiskClass ?? policy?.riskClass ?? getActionRiskClass(actionType);
    const effectiveRisk = policy?.riskClass
      ? ([baseRisk, policy.riskClass] as WorkflowActionRiskClass[]).reduce((max, r) =>
          RISK_CLASS_RANK[r] > RISK_CLASS_RANK[max] ? r : max,
        )
      : baseRisk;

    const override = input.safetyOverrides?.find((o) => o.actionType === actionType);
    let safetyBlocked = false;
    let safetyBlockReason: string | undefined;

    if (override?.blocked) {
      safetyBlocked = true;
      safetyBlockReason = override.reason;
    } else if (input.organizationId) {
      const safety = this.safetyBlocks.evaluate({
        organizationId: input.organizationId,
        actionType,
        eventType: input.eventType ?? triggerType,
        scopeType: 'organization',
        mode: 'preview',
        actionConfig: input.actions[index]?.config,
      });
      if (safety.blocked) {
        safetyBlocked = true;
        safetyBlockReason = safety.reason;
      }
    }

    return {
      actionType,
      index,
      baseRiskClass: baseRisk,
      effectiveRiskClass: effectiveRisk,
      semanticCategories: registryEntry?.semanticCategories ?? ['operational'],
      policyBinding: getWorkflowRiskPolicyBinding(effectiveRisk),
      capabilityGate:
        registryEntry?.capabilityGate ?? policy?.capabilityGate ?? 'UNKNOWN',
      safetyBlocked,
      safetyBlockReason,
    };
  }

  private assessConditionRisk(fields: string[]): WorkflowActionRiskClass {
    const criticalPatterns = [/payment/i, /kyc/i, /block/i, /cancel/i, /charge/i];
    if (fields.some((f) => criticalPatterns.some((p) => p.test(f)))) {
      return 'CRITICAL';
    }
    if (fields.some((f) => /risk|complaint|overdue/i.test(f))) {
      return 'MEDIUM';
    }
    return 'LOW';
  }
}
