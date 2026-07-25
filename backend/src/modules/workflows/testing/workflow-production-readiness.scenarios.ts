/**
 * Canonical 42-scenario production readiness matrix for Workflow Automation.
 * Used by workflow-production-readiness.spec.ts for traceability documentation.
 */
export type WorkflowProductionScenarioLayer =
  | 'unit'
  | 'service'
  | 'repository'
  | 'integration'
  | 'queue'
  | 'database'
  | 'api'
  | 'frontend'
  | 'e2e'
  | 'security'
  | 'failure-injection';

export type WorkflowProductionScenarioStatus =
  | 'automated'
  | 'partial'
  | 'manual'
  | 'not-applicable';

export interface WorkflowProductionScenario {
  id: number;
  name: string;
  layer: WorkflowProductionScenarioLayer;
  status: WorkflowProductionScenarioStatus;
  testRef: string;
  notes?: string;
}

export const WORKFLOW_PRODUCTION_SCENARIOS: WorkflowProductionScenario[] = [
  { id: 1, name: 'Dry run without side effects', layer: 'service', status: 'automated', testRef: 'workflow-dry-run.service.spec.ts' },
  { id: 2, name: 'Tenant isolation', layer: 'security', status: 'automated', testRef: 'workflow-production-readiness.spec.ts' },
  { id: 3, name: 'Scope fail-closed', layer: 'unit', status: 'automated', testRef: 'workflow-scope.evaluator.spec.ts' },
  { id: 4, name: 'Immutable version', layer: 'service', status: 'automated', testRef: 'workflow-maker-checker.service.spec.ts' },
  { id: 5, name: 'Event outbox atomic', layer: 'repository', status: 'automated', testRef: 'task-automation-outbox.spec.ts' },
  { id: 6, name: 'Worker retry', layer: 'queue', status: 'automated', testRef: 'task-automation-outbox.spec.ts' },
  { id: 7, name: 'Dead letter', layer: 'queue', status: 'automated', testRef: 'task-automation-outbox.spec.ts' },
  { id: 8, name: 'Replay', layer: 'service', status: 'automated', testRef: 'task-automation-admin.service.spec.ts' },
  { id: 9, name: 'Matcher', layer: 'integration', status: 'automated', testRef: 'workflow-engine.production.spec.ts' },
  { id: 10, name: 'Condition tree', layer: 'unit', status: 'automated', testRef: 'workflow-condition.evaluator.spec.ts' },
  { id: 11, name: 'Data types', layer: 'unit', status: 'automated', testRef: 'workflow-condition.evaluator.spec.ts' },
  { id: 12, name: 'Timer', layer: 'service', status: 'partial', testRef: 'task-automation.service.spec.ts', notes: 'Task activatesAt/dueDate; no workflow-native delay executor' },
  { id: 13, name: 'Pickup 30 minutes overdue', layer: 'service', status: 'automated', testRef: 'workflow-production-readiness.spec.ts' },
  { id: 14, name: 'Idempotency', layer: 'integration', status: 'automated', testRef: 'workflow-engine.production.spec.ts' },
  { id: 15, name: 'Parallel workers', layer: 'queue', status: 'automated', testRef: 'task-automation-outbox.spec.ts' },
  { id: 16, name: 'Approval pause and resume', layer: 'service', status: 'automated', testRef: 'workflow-engine.production.spec.ts' },
  { id: 17, name: 'Rejection', layer: 'service', status: 'automated', testRef: 'workflow-maker-checker.service.spec.ts' },
  { id: 18, name: 'Approval expiry', layer: 'service', status: 'automated', testRef: 'workflow-maker-checker.service.spec.ts' },
  { id: 19, name: 'Action timeout', layer: 'failure-injection', status: 'partial', testRef: 'workflow-production-readiness.spec.ts', notes: 'Outbox backoff; no per-action wall-clock timeout yet' },
  { id: 20, name: 'Partial failure', layer: 'integration', status: 'automated', testRef: 'workflow-engine.production.spec.ts' },
  { id: 21, name: 'Fallback', layer: 'service', status: 'partial', testRef: 'workflow-dry-run.service.spec.ts', notes: 'Preview expectedFallback for notification.prepare' },
  { id: 22, name: 'Task action', layer: 'integration', status: 'automated', testRef: 'workflow-dry-run.service.spec.ts' },
  { id: 23, name: 'In-app notification', layer: 'service', status: 'automated', testRef: 'workflow-communication-contract.spec.ts' },
  { id: 24, name: 'Email', layer: 'service', status: 'partial', testRef: 'workflow-communication-contract.spec.ts', notes: 'Contract mock only; LIVE channel.email.send not in executor' },
  { id: 25, name: 'WhatsApp', layer: 'service', status: 'partial', testRef: 'workflow-communication-contract.spec.ts', notes: 'Policy/risk catalog; preview-only in workflow runtime' },
  { id: 26, name: 'SMS', layer: 'service', status: 'partial', testRef: 'workflow-communication-contract.spec.ts', notes: 'Contract mock only' },
  { id: 27, name: 'Voice call', layer: 'service', status: 'not-applicable', testRef: 'workflow-communication-contract.spec.ts', notes: 'Separate Voice AI stack; workflow catalog references only' },
  { id: 28, name: 'Provider webhooks', layer: 'integration', status: 'not-applicable', testRef: 'n/a', notes: 'Voice/WhatsApp webhooks tested in voice module' },
  { id: 29, name: 'Webhook replay', layer: 'service', status: 'not-applicable', testRef: 'n/a', notes: 'Voice webhook ingestion module' },
  { id: 30, name: 'Policy block', layer: 'service', status: 'automated', testRef: 'workflow-dry-run.service.spec.ts' },
  { id: 31, name: 'Quiet hours', layer: 'service', status: 'partial', testRef: 'workflow-communication-contract.spec.ts', notes: 'Policy hook stub; full quiet-hours engine pending' },
  { id: 32, name: 'Opt-out', layer: 'service', status: 'partial', testRef: 'workflow-communication-contract.spec.ts', notes: 'Recipient resolution respects opt-out flag in contract mock' },
  { id: 33, name: 'AI prompt injection', layer: 'security', status: 'automated', testRef: 'workflow-security.production.spec.ts' },
  { id: 34, name: 'PII redaction', layer: 'security', status: 'automated', testRef: 'workflow-audit.spec.ts' },
  { id: 35, name: 'RBAC', layer: 'api', status: 'automated', testRef: 'task-automation-admin.controller.spec.ts' },
  { id: 36, name: 'Maker-checker', layer: 'service', status: 'automated', testRef: 'workflow-maker-checker.service.spec.ts' },
  { id: 37, name: 'Cancellation', layer: 'integration', status: 'automated', testRef: 'workflow-engine.production.spec.ts' },
  { id: 38, name: 'Process restart', layer: 'queue', status: 'automated', testRef: 'task-automation-outbox.spec.ts' },
  { id: 39, name: 'Legacy migration', layer: 'integration', status: 'automated', testRef: 'task-automation-workflow-migration.spec.ts' },
  { id: 40, name: 'Shadow mode', layer: 'integration', status: 'automated', testRef: 'task-automation-workflow-migration.spec.ts' },
  { id: 41, name: 'Mobile UI', layer: 'frontend', status: 'automated', testRef: 'workflow-mobile-a11y.test.ts' },
  { id: 42, name: 'Accessibility', layer: 'frontend', status: 'automated', testRef: 'workflow-mobile-a11y.test.ts' },
];

export function countScenariosByStatus() {
  const counts: Record<WorkflowProductionScenarioStatus, number> = {
    automated: 0,
    partial: 0,
    manual: 0,
    'not-applicable': 0,
  };
  for (const scenario of WORKFLOW_PRODUCTION_SCENARIOS) {
    counts[scenario.status] += 1;
  }
  return counts;
}
