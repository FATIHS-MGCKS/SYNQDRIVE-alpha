import type { OrgWorkflow } from '@prisma/client';
import type { LegacyTaskSnapshot, WorkflowShadowComparisonResult } from './workflow-shadow.types';
import type { WorkflowExecutionPlan } from '../workflow-execution-plan.types';

function isoOrNull(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  return null;
}

function workflowTaskPreview(plan: WorkflowExecutionPlan): Record<string, unknown> | null {
  const action = plan.plannedActions.find((a) => a.actionType === 'task.create');
  return (action?.preview as Record<string, unknown> | undefined) ?? null;
}

function workflowWouldTrigger(plan: WorkflowExecutionPlan): boolean {
  return (
    plan.scope.passed
    && plan.conditions.passed
    && plan.plannedActions.length > 0
    && plan.policyBlockers.length === 0
  );
}

export function compareLegacyTaskWithShadowPlan(
  legacy: LegacyTaskSnapshot | null,
  plan: WorkflowExecutionPlan,
): WorkflowShadowComparisonResult {
  const preview = workflowTaskPreview(plan);
  const wouldTrigger = workflowWouldTrigger(plan);
  const legacyDidExecute = Boolean(legacy?.taskId);

  const comparison: Record<string, { legacy?: unknown; workflow?: unknown }> = {};
  const deviationReasons: string[] = [];

  if (wouldTrigger !== legacyDidExecute) {
    deviationReasons.push(
      wouldTrigger && !legacyDidExecute
        ? 'workflow_would_trigger_but_legacy_did_not'
        : 'legacy_executed_but_workflow_would_not_trigger',
    );
  }

  if (legacy && preview) {
    const pairs: Array<[string, unknown, unknown]> = [
      ['taskType', legacy.type, preview.taskType ?? preview.type],
      ['priority', legacy.priority, preview.priority],
      ['title', legacy.title, preview.title],
      ['dedupKey', legacy.dedupKey, preview.dedupKey],
      ['activatesAt', legacy.activatesAt, preview.activatesAt],
      ['dueDate', legacy.dueDate, preview.dueDate],
    ];

    for (const [field, legacyVal, workflowVal] of pairs) {
      const l = legacyVal ?? null;
      const w = workflowVal ?? null;
      if (String(l ?? '') !== String(w ?? '')) {
        comparison[field] = { legacy: l, workflow: w };
        deviationReasons.push(`${field}_mismatch`);
      }
    }
  }

  const legacyActivates = legacy?.activatesAt ? Date.parse(legacy.activatesAt) : null;
  const workflowActivatesRaw = preview?.activatesAt;
  const workflowActivates =
    typeof workflowActivatesRaw === 'string' ? Date.parse(workflowActivatesRaw) : null;
  const triggerAtDeltaMs =
    legacyActivates != null && workflowActivates != null && !Number.isNaN(workflowActivates)
      ? workflowActivates - legacyActivates
      : null;

  const legacyDue = legacy?.dueDate ? Date.parse(legacy.dueDate) : null;
  const workflowDueRaw = preview?.dueDate;
  const workflowDue = typeof workflowDueRaw === 'string' ? Date.parse(workflowDueRaw) : null;
  const dueAtDeltaMs =
    legacyDue != null && workflowDue != null && !Number.isNaN(workflowDue)
      ? workflowDue - legacyDue
      : null;

  if (triggerAtDeltaMs != null && Math.abs(triggerAtDeltaMs) > 60_000) {
    if (!deviationReasons.includes('activatesAt_mismatch')) {
      deviationReasons.push('trigger_timing_delta_exceeds_1m');
    }
  }

  const workflowRecipients = plan.plannedActions
    .flatMap((a) => a.resolvedRecipients ?? [])
    .map((r) => r.masked)
    .join(',');
  if (legacy?.recipientSummary && workflowRecipients && legacy.recipientSummary !== workflowRecipients) {
    comparison.recipients = { legacy: legacy.recipientSummary, workflow: workflowRecipients };
    deviationReasons.push('recipient_mismatch');
  }

  return {
    workflowWouldTrigger: wouldTrigger,
    legacyDidExecute,
    hasDeviation: deviationReasons.length > 0,
    deviationReasons: [...new Set(deviationReasons)],
    comparison,
    triggerAtDeltaMs,
    dueAtDeltaMs,
  };
}

export function legacySnapshotFromTask(task: {
  id: string;
  dedupKey?: string | null;
  type?: string;
  priority?: string;
  title?: string;
  activatesAt?: Date | null;
  dueDate?: Date | null;
  metadata?: unknown;
}): LegacyTaskSnapshot {
  const metadata =
    task.metadata && typeof task.metadata === 'object' && !Array.isArray(task.metadata)
      ? (task.metadata as Record<string, unknown>)
      : {};
  return {
    taskId: task.id,
    dedupKey: task.dedupKey ?? '',
    catalogKey:
      typeof metadata.automationCatalogKey === 'string' ? metadata.automationCatalogKey : undefined,
    ruleId: typeof metadata.automationRuleId === 'string' ? metadata.automationRuleId : undefined,
    type: task.type,
    priority: task.priority,
    title: task.title,
    activatesAt: isoOrNull(task.activatesAt),
    dueDate: isoOrNull(task.dueDate),
  };
}

export function shouldRunWorkflowLive(workflow: OrgWorkflow): boolean {
  return workflow.status === 'ACTIVE' && workflow.enabled && !workflow.shadowEnabled;
}

export function shouldRunWorkflowShadow(workflow: OrgWorkflow, orgShadowEnabled: boolean): boolean {
  if (!orgShadowEnabled) return false;
  if (workflow.shadowEnabled) return workflow.status === 'ACTIVE';
  if (workflow.systemMetadata) return workflow.status === 'ACTIVE';
  return false;
}
