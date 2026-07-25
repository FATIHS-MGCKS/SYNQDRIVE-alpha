import {
  buildDefinitionSnapshot,
  stableStringify,
  type WorkflowDefinitionSnapshot,
} from './maker-checker/workflow-maker-checker.util';
import { assessWorkflowRiskFromActionTypes } from './workflow-risk.util';

export type WorkflowRevisionChangeKind =
  | 'trigger_changed'
  | 'scope_changed'
  | 'condition_changed'
  | 'action_added'
  | 'action_removed'
  | 'action_reordered'
  | 'time_value_changed'
  | 'approval_changed'
  | 'risk_class_changed'
  | 'policy_changed'
  | 'general_changed';

export interface WorkflowRevisionChangeItem {
  kind: WorkflowRevisionChangeKind;
  field: string;
  label: string;
  before?: unknown;
  after?: unknown;
  detail?: string;
}

export interface WorkflowRevisionDiffResult {
  hasChanges: boolean;
  changes: WorkflowRevisionChangeItem[];
  baselineVersion: number;
  proposedVersion: number;
  baselineRiskClass: string;
  proposedRiskClass: string;
  actor?: string | null;
  changedAt?: string | null;
  reason?: string | null;
}

const TIME_FIELD_PATTERN = /(delay|timeout|duration|hours|minutes|days|cron|schedule|at|valid|expir)/i;

function actionSignature(action: unknown): string {
  if (!action || typeof action !== 'object') return '';
  const row = action as { type?: string; config?: unknown; requiresApproval?: boolean };
  return stableStringify({
    type: row.type ?? '',
    config: row.config ?? {},
    requiresApproval: Boolean(row.requiresApproval),
  });
}

function asActionArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function countSignatures(signatures: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const sig of signatures) {
    map.set(sig, (map.get(sig) ?? 0) + 1);
  }
  return map;
}

function multisetEqual(a: string[], b: string[]): boolean {
  const left = countSignatures(a);
  const right = countSignatures(b);
  if (left.size !== right.size) return false;
  for (const [key, count] of left) {
    if (right.get(key) !== count) return false;
  }
  return true;
}

function detectActionChanges(
  before: unknown[],
  after: unknown[],
): WorkflowRevisionChangeItem[] {
  const changes: WorkflowRevisionChangeItem[] = [];
  const beforeSigs = before.map(actionSignature);
  const afterSigs = after.map(actionSignature);

  if (stableStringify(beforeSigs) === stableStringify(afterSigs)) {
    return changes;
  }

  if (multisetEqual(beforeSigs, afterSigs) && beforeSigs.join('|') !== afterSigs.join('|')) {
    changes.push({
      kind: 'action_reordered',
      field: 'actions',
      label: 'Actions reordered',
      before: before.map((item) => (item as { type?: string }).type ?? 'unknown'),
      after: after.map((item) => (item as { type?: string }).type ?? 'unknown'),
    });
    return changes;
  }

  const beforeCounts = countSignatures(beforeSigs);
  const afterCounts = countSignatures(afterSigs);

  for (const [sig, count] of afterCounts) {
    const prev = beforeCounts.get(sig) ?? 0;
    if (count > prev) {
      const action = after.find((item) => actionSignature(item) === sig) as { type?: string };
      changes.push({
        kind: 'action_added',
        field: 'actions',
        label: 'Action added',
        after: action?.type ?? sig,
      });
    }
  }

  for (const [sig, count] of beforeCounts) {
    const next = afterCounts.get(sig) ?? 0;
    if (count > next) {
      const action = before.find((item) => actionSignature(item) === sig) as { type?: string };
      changes.push({
        kind: 'action_removed',
        field: 'actions',
        label: 'Action removed',
        before: action?.type ?? sig,
      });
    }
  }

  if (changes.length === 0) {
    changes.push({
      kind: 'general_changed',
      field: 'actions',
      label: 'Actions changed',
      before,
      after,
    });
  }

  return changes;
}

function hasTimeValueChange(before: unknown, after: unknown): boolean {
  const walk = (node: unknown, path: string): boolean => {
    if (node == null) return false;
    if (typeof node !== 'object') {
      return TIME_FIELD_PATTERN.test(path);
    }
    if (Array.isArray(node)) {
      return node.some((item, index) => walk(item, `${path}[${index}]`));
    }
    return Object.entries(node as Record<string, unknown>).some(([key, value]) =>
      walk(value, path ? `${path}.${key}` : key),
    );
  };
  if (stableStringify(before) === stableStringify(after)) return false;
  return walk(before, '') || walk(after, '');
}

function approvalFlags(actions: unknown[]): boolean[] {
  return actions.map((action) =>
    Boolean((action as { requiresApproval?: boolean }).requiresApproval),
  );
}

export function buildWorkflowRevisionDiff(input: {
  baseline: WorkflowDefinitionSnapshot;
  proposed: WorkflowDefinitionSnapshot;
  actor?: string | null;
  changedAt?: Date | string | null;
  reason?: string | null;
}): WorkflowRevisionDiffResult {
  const changes: WorkflowRevisionChangeItem[] = [];
  const baselineActions = asActionArray(input.baseline.actions);
  const proposedActions = asActionArray(input.proposed.actions);

  if (stableStringify(input.baseline.trigger) !== stableStringify(input.proposed.trigger)) {
    changes.push({
      kind: 'trigger_changed',
      field: 'trigger',
      label: 'Trigger changed',
      before: input.baseline.trigger,
      after: input.proposed.trigger,
    });
    if (hasTimeValueChange(input.baseline.trigger, input.proposed.trigger)) {
      changes.push({
        kind: 'time_value_changed',
        field: 'trigger',
        label: 'Trigger timing changed',
        before: input.baseline.trigger,
        after: input.proposed.trigger,
      });
    }
  }

  if (stableStringify(input.baseline.scope) !== stableStringify(input.proposed.scope)) {
    changes.push({
      kind: 'scope_changed',
      field: 'scope',
      label: 'Scope changed',
      before: input.baseline.scope,
      after: input.proposed.scope,
    });
    changes.push({
      kind: 'policy_changed',
      field: 'scope',
      label: 'Scope policy changed',
      before: input.baseline.scope,
      after: input.proposed.scope,
    });
  }

  if (stableStringify(input.baseline.conditions) !== stableStringify(input.proposed.conditions)) {
    changes.push({
      kind: 'condition_changed',
      field: 'conditions',
      label: 'Conditions changed',
      before: input.baseline.conditions,
      after: input.proposed.conditions,
    });
    if (hasTimeValueChange(input.baseline.conditions, input.proposed.conditions)) {
      changes.push({
        kind: 'time_value_changed',
        field: 'conditions',
        label: 'Condition time values changed',
        before: input.baseline.conditions,
        after: input.proposed.conditions,
      });
    }
  }

  changes.push(...detectActionChanges(baselineActions, proposedActions));

  const beforeApprovals = approvalFlags(baselineActions);
  const afterApprovals = approvalFlags(proposedActions);
  if (stableStringify(beforeApprovals) !== stableStringify(afterApprovals)) {
    changes.push({
      kind: 'approval_changed',
      field: 'actions',
      label: 'Approval requirements changed',
      before: beforeApprovals,
      after: afterApprovals,
    });
    changes.push({
      kind: 'policy_changed',
      field: 'actions',
      label: 'Approval policy changed',
      before: beforeApprovals,
      after: afterApprovals,
    });
  }

  const baselineRiskClass = assessWorkflowRiskFromActionTypes(
    baselineActions as Array<{ type?: string }>,
  );
  const proposedRiskClass = assessWorkflowRiskFromActionTypes(
    proposedActions as Array<{ type?: string }>,
  );
  if (baselineRiskClass !== proposedRiskClass) {
    changes.push({
      kind: 'risk_class_changed',
      field: 'riskClass',
      label: 'Risk class changed',
      before: baselineRiskClass,
      after: proposedRiskClass,
    });
  }

  if (
    input.baseline.name !== input.proposed.name
    || input.baseline.description !== input.proposed.description
    || input.baseline.category !== input.proposed.category
    || input.baseline.status !== input.proposed.status
  ) {
    changes.push({
      kind: 'general_changed',
      field: 'metadata',
      label: 'General metadata changed',
      before: {
        name: input.baseline.name,
        description: input.baseline.description,
        category: input.baseline.category,
        status: input.baseline.status,
      },
      after: {
        name: input.proposed.name,
        description: input.proposed.description,
        category: input.proposed.category,
        status: input.proposed.status,
      },
    });
  }

  return {
    hasChanges: changes.length > 0,
    changes,
    baselineVersion: input.baseline.version,
    proposedVersion: input.proposed.version,
    baselineRiskClass,
    proposedRiskClass,
    actor: input.actor ?? null,
    changedAt: input.changedAt
      ? new Date(input.changedAt).toISOString()
      : null,
    reason: input.reason ?? null,
  };
}

export function buildWorkflowRevisionDiffFromRows(input: {
  baselineRow: Parameters<typeof buildDefinitionSnapshot>[0];
  proposedRow: Parameters<typeof buildDefinitionSnapshot>[0];
  actor?: string | null;
  changedAt?: Date | string | null;
  reason?: string | null;
}): WorkflowRevisionDiffResult {
  return buildWorkflowRevisionDiff({
    baseline: buildDefinitionSnapshot(input.baselineRow),
    proposed: buildDefinitionSnapshot({
      ...input.proposedRow,
      version: input.proposedRow.version ?? input.baselineRow.version,
    }),
    actor: input.actor,
    changedAt: input.changedAt,
    reason: input.reason,
  });
}
