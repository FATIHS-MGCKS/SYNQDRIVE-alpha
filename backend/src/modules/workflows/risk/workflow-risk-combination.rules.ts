import { RISK_CLASS_RANK } from '../actions/workflow-action-registry.constants';
import type { WorkflowActionRiskClass } from '../actions/workflow-action-registry.types';
import type {
  WorkflowRiskCombinationRuleHit,
  WorkflowRiskSemanticCategory,
} from './workflow-risk-classification.types';

const CUSTOMER_CONTACT_CATEGORIES: ReadonlySet<WorkflowRiskSemanticCategory> = new Set([
  'customer_email',
  'customer_whatsapp',
  'customer_sms',
  'ai_generated_message',
  'ai_voice_call',
]);

const CRITICAL_SEMANTIC_CATEGORIES: ReadonlySet<WorkflowRiskSemanticCategory> = new Set([
  'booking_cancellation',
  'customer_block',
  'payment',
  'kyc_decision',
]);

const AI_CATEGORIES: ReadonlySet<WorkflowRiskSemanticCategory> = new Set([
  'ai_generated_message',
  'ai_voice_call',
]);

function maxRisk(...classes: WorkflowActionRiskClass[]): WorkflowActionRiskClass {
  return classes.reduce((max, current) =>
    RISK_CLASS_RANK[current] > RISK_CLASS_RANK[max] ? current : max,
  );
}

function bumpRisk(risk: WorkflowActionRiskClass, levels = 1): WorkflowActionRiskClass {
  const order: WorkflowActionRiskClass[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const idx = order.indexOf(risk);
  return order[Math.min(order.length - 1, idx + levels)];
}

export function applyWorkflowRiskCombinationRules(input: {
  baseWorkflowRisk: WorkflowActionRiskClass;
  triggerRisk: WorkflowActionRiskClass;
  actionRisks: WorkflowActionRiskClass[];
  semanticCategories: WorkflowRiskSemanticCategory[];
  triggerType: string;
  conditionFields: string[];
}): { workflowRisk: WorkflowActionRiskClass; rules: WorkflowRiskCombinationRuleHit[] } {
  const rules: WorkflowRiskCombinationRuleHit[] = [];
  let workflowRisk = maxRisk(input.baseWorkflowRisk, input.triggerRisk, ...input.actionRisks);

  const customerContactCount = input.semanticCategories.filter((c) =>
    CUSTOMER_CONTACT_CATEGORIES.has(c),
  ).length;
  if (customerContactCount >= 2) {
    const elevated = bumpRisk(workflowRisk);
    rules.push({
      code: 'MULTI_CHANNEL_CUSTOMER_CONTACT',
      description: 'Multiple customer contact channels in one workflow elevate risk',
      elevatedTo: elevated,
    });
    workflowRisk = maxRisk(workflowRisk, elevated);
  }

  const hasAi = input.semanticCategories.some((c) => AI_CATEGORIES.has(c));
  const hasExternalContact = input.semanticCategories.some((c) => CUSTOMER_CONTACT_CATEGORIES.has(c));
  if (hasAi && hasExternalContact) {
    const elevated: WorkflowActionRiskClass = 'HIGH';
    rules.push({
      code: 'AI_PLUS_EXTERNAL_CONTACT',
      description: 'AI combined with external customer contact is at least HIGH',
      elevatedTo: elevated,
    });
    workflowRisk = maxRisk(workflowRisk, elevated);
  }

  if (
    input.semanticCategories.includes('ai_generated_message')
    && input.semanticCategories.includes('ai_voice_call')
  ) {
    rules.push({
      code: 'AI_MESSAGE_AND_VOICE',
      description: 'AI message and AI voice in one workflow elevate to CRITICAL',
      elevatedTo: 'CRITICAL',
    });
    workflowRisk = 'CRITICAL';
  }

  const criticalTriggers = new Set(['vehicle.health.critical', 'vehicle.dtc.critical']);
  if (criticalTriggers.has(input.triggerType) && hasExternalContact) {
    const elevated = bumpRisk(workflowRisk, workflowRisk === 'CRITICAL' ? 0 : 1);
    rules.push({
      code: 'CRITICAL_TRIGGER_CUSTOMER_CONTACT',
      description: 'Technical security alert trigger with customer contact elevates risk',
      elevatedTo: maxRisk(elevated, 'HIGH'),
    });
    workflowRisk = maxRisk(workflowRisk, elevated, 'HIGH');
  }

  if (input.semanticCategories.some((c) => CRITICAL_SEMANTIC_CATEGORIES.has(c))) {
    rules.push({
      code: 'CRITICAL_SEMANTIC_DOMAIN',
      description: 'Contract, payment, block, or KYC decisions are CRITICAL',
      elevatedTo: 'CRITICAL',
    });
    workflowRisk = 'CRITICAL';
  }

  const criticalConditionPatterns = [
    /payment/i,
    /kyc/i,
    /verification/i,
    /block/i,
    /cancel/i,
    /charge/i,
    /refund/i,
  ];
  if (input.conditionFields.some((field) => criticalConditionPatterns.some((p) => p.test(field)))) {
    rules.push({
      code: 'CRITICAL_CONDITION_FIELD',
      description: 'Conditions referencing payment, KYC, or block fields elevate to CRITICAL',
      elevatedTo: 'CRITICAL',
    });
    workflowRisk = 'CRITICAL';
  }

  return { workflowRisk, rules };
}
