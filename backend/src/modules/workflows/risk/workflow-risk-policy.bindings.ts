import type { WorkflowRiskClass, WorkflowRiskPolicyBinding } from './workflow-risk-classification.types';

export const WORKFLOW_RISK_POLICY_BINDINGS: Record<WorkflowRiskClass, WorkflowRiskPolicyBinding> = {
  LOW: {
    riskClass: 'LOW',
    requiredPermission: 'WORKFLOW_EXECUTE',
    approvalRule: 'NONE',
    makerCheckerRequired: false,
    dryRunRequiredBeforeActivate: false,
    auditLevel: 'MINIMAL',
    rolloutFlag: null,
    maxReachPerRun: null,
    mandatoryWarnings: [],
    testRequirements: ['definition_validation'],
  },
  MEDIUM: {
    riskClass: 'MEDIUM',
    requiredPermission: 'WORKFLOW_EXECUTE',
    approvalRule: 'OPTIONAL',
    makerCheckerRequired: false,
    dryRunRequiredBeforeActivate: true,
    auditLevel: 'STANDARD',
    rolloutFlag: null,
    maxReachPerRun: 50,
    mandatoryWarnings: ['Review customer-facing content before activation'],
    testRequirements: ['definition_validation', 'dry_run_preview'],
  },
  HIGH: {
    riskClass: 'HIGH',
    requiredPermission: 'WORKFLOW_CUSTOMER_CONTACT',
    approvalRule: 'REQUIRED',
    makerCheckerRequired: false,
    dryRunRequiredBeforeActivate: true,
    auditLevel: 'DETAILED',
    rolloutFlag: 'WORKFLOW_HIGH_RISK_ACTIONS',
    maxReachPerRun: 10,
    mandatoryWarnings: [
      'Customer contact action — consent and communication policy apply',
      'Approval required before each production run when policy demands it',
    ],
    testRequirements: ['definition_validation', 'dry_run_preview', 'approval_path'],
  },
  CRITICAL: {
    riskClass: 'CRITICAL',
    requiredPermission: 'WORKFLOW_CRITICAL_EXECUTE',
    approvalRule: 'REQUIRED',
    makerCheckerRequired: true,
    dryRunRequiredBeforeActivate: true,
    auditLevel: 'FORENSIC',
    rolloutFlag: 'WORKFLOW_CRITICAL_ACTIONS',
    maxReachPerRun: 1,
    mandatoryWarnings: [
      'Critical workflow — dual control (maker-checker) required',
      'Not generally available without explicit org enablement',
      'Forensic audit trail mandatory',
    ],
    testRequirements: [
      'definition_validation',
      'dry_run_preview',
      'approval_path',
      'maker_checker',
      'safety_override_check',
    ],
  },
};

export function getWorkflowRiskPolicyBinding(riskClass: WorkflowRiskClass): WorkflowRiskPolicyBinding {
  return WORKFLOW_RISK_POLICY_BINDINGS[riskClass];
}
