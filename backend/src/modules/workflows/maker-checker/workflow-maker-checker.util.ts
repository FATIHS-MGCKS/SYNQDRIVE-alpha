import { createHash } from 'crypto';

export interface WorkflowDefinitionSnapshot {
  name: string;
  description?: string | null;
  category: string;
  trigger: unknown;
  conditions: unknown;
  actions: unknown;
  scope: unknown;
  status: string;
  version: number;
}

export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export function computeWorkflowDefinitionHash(snapshot: WorkflowDefinitionSnapshot): string {
  const payload = stableStringify({
    name: snapshot.name,
    description: snapshot.description ?? null,
    category: snapshot.category,
    trigger: snapshot.trigger,
    conditions: snapshot.conditions,
    actions: snapshot.actions,
    scope: snapshot.scope,
    status: snapshot.status,
    version: snapshot.version,
  });
  return createHash('sha256').update(payload).digest('hex');
}

export function buildDefinitionSnapshot(row: {
  name: string;
  description?: string | null;
  category: string;
  trigger: unknown;
  conditions: unknown;
  actions: unknown;
  scope: unknown;
  status: string;
  version: number;
}): WorkflowDefinitionSnapshot {
  return {
    name: row.name,
    description: row.description,
    category: row.category,
    trigger: row.trigger,
    conditions: row.conditions,
    actions: row.actions,
    scope: row.scope,
    status: row.status,
    version: row.version,
  };
}

export function diffDefinitionSnapshots(
  baseline: WorkflowDefinitionSnapshot,
  proposed: WorkflowDefinitionSnapshot,
): Record<string, { before: unknown; after: unknown }> {
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  const keys: (keyof WorkflowDefinitionSnapshot)[] = [
    'name',
    'description',
    'category',
    'trigger',
    'conditions',
    'actions',
    'scope',
    'status',
    'version',
  ];
  for (const key of keys) {
    const before = baseline[key];
    const after = proposed[key];
    if (stableStringify(before) !== stableStringify(after)) {
      diff[key] = { before, after };
    }
  }
  return diff;
}
