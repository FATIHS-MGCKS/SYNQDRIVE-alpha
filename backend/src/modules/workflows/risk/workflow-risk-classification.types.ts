import type { WorkflowActionRiskClass } from '../actions/workflow-action-registry.types';

export type WorkflowRiskClass = WorkflowActionRiskClass;

export type WorkflowRiskEntityKind = 'action' | 'trigger' | 'condition' | 'workflow';

export type WorkflowRiskSemanticCategory =
  | 'internal_notification'
  | 'task_creation'
  | 'internal_flag_change'
  | 'customer_email'
  | 'customer_whatsapp'
  | 'customer_sms'
  | 'ai_generated_message'
  | 'ai_voice_call'
  | 'vehicle_status_change'
  | 'booking_modification'
  | 'booking_cancellation'
  | 'customer_block'
  | 'payment'
  | 'document_release'
  | 'kyc_decision'
  | 'technical_security_alert'
  | 'operational'
  | 'approval_gate';

export interface WorkflowRiskRegistryEntry {
  id: string;
  kind: WorkflowRiskEntityKind;
  key: string;
  label: string;
  baseRiskClass: WorkflowRiskClass;
  semanticCategories: readonly WorkflowRiskSemanticCategory[];
  registryVersion: string;
  capabilityGate?: 'ENABLED' | 'DISABLED' | 'DEPRECATED';
  generallyAvailable?: boolean;
  description: string;
}

export interface WorkflowRiskPolicyBinding {
  riskClass: WorkflowRiskClass;
  requiredPermission: string;
  approvalRule: 'NONE' | 'OPTIONAL' | 'REQUIRED' | 'GATE_ONLY';
  makerCheckerRequired: boolean;
  dryRunRequiredBeforeActivate: boolean;
  auditLevel: 'MINIMAL' | 'STANDARD' | 'DETAILED' | 'FORENSIC';
  rolloutFlag: string | null;
  maxReachPerRun: number | null;
  mandatoryWarnings: readonly string[];
  testRequirements: readonly string[];
}

export interface WorkflowRiskCombinationRuleHit {
  code: string;
  description: string;
  elevatedTo: WorkflowRiskClass;
}

export interface WorkflowRiskActionAssessment {
  actionType: string;
  index: number;
  baseRiskClass: WorkflowRiskClass;
  effectiveRiskClass: WorkflowRiskClass;
  semanticCategories: readonly WorkflowRiskSemanticCategory[];
  policyBinding: WorkflowRiskPolicyBinding;
  capabilityGate: 'ENABLED' | 'DISABLED' | 'DEPRECATED' | 'UNKNOWN';
  safetyBlocked: boolean;
  safetyBlockReason?: string;
}

export interface WorkflowRiskAssessment {
  registryVersion: string;
  assessedAt: string;
  workflowRiskClass: WorkflowRiskClass;
  triggerRiskClass: WorkflowRiskClass;
  conditionRiskClass: WorkflowRiskClass;
  maxActionRiskClass: WorkflowRiskClass;
  combinationRules: WorkflowRiskCombinationRuleHit[];
  actions: WorkflowRiskActionAssessment[];
  policyBinding: WorkflowRiskPolicyBinding;
  mandatoryWarnings: string[];
  safetyBlocked: boolean;
  safetyBlockReasons: string[];
  blockedFromActivation: boolean;
  activationBlockReasons: string[];
}

export interface WorkflowRiskAssessmentInput {
  trigger: { type: string; config?: Record<string, unknown> };
  conditions?: Array<{ field?: string; path?: string; operator: string; value?: unknown }>;
  actions: Array<{ type: string; config?: Record<string, unknown> }>;
  organizationId?: string;
  eventType?: string;
  safetyOverrides?: Array<{ actionType: string; blocked: boolean; reason?: string }>;
}
