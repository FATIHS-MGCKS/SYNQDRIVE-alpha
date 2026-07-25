const SECRET_KEY_PATTERN =
  /(api[_-]?key|secret|token|password|authorization|bearer|private[_-]?key|webhook[_-]?secret|credential)/i;

const PII_KEY_PATTERN =
  /^(email|e[-_]?mail|phone|mobile|name|firstName|lastName|fullName|address|street|customerName|recipientEmail|recipientPhone|iban|dateOfBirth|licenseNumber)$/i;

import type { WorkflowActionSnapshotEntry } from './workflow-action-run-execution.types';

export function stripSecretsFromValue(value: unknown, path = ''): unknown {
  if (Array.isArray(value)) {
    return value.map((item, i) => stripSecretsFromValue(item, `${path}[${i}]`));
  }
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = path ? `${path}.${key}` : key;
      if (SECRET_KEY_PATTERN.test(key)) {
        continue;
      }
      if (PII_KEY_PATTERN.test(key)) {
        output[key] = minimizePiiValue(child);
        continue;
      }
      output[key] = stripSecretsFromValue(child, childPath);
    }
    return output;
  }
  return value;
}

function minimizePiiValue(value: unknown): string {
  if (typeof value === 'string' && value.length > 4) {
    return `[ref:${value.length}]`;
  }
  return '[ref]';
}

export function buildInputSnapshot(
  actionRun: {
    actionKey: string;
    actionIndex: number;
    actionType: string;
    workflowActionId: string | null;
    requiresApproval: boolean;
    blockingOnFailure: boolean;
    errorStrategy?: string;
    fallbackActionKey?: string | null;
    compensateActionKey?: string | null;
    compensatable?: boolean;
    input: unknown;
  },
): Record<string, unknown> {
  const config =
    actionRun.input && typeof actionRun.input === 'object' && !Array.isArray(actionRun.input)
      ? (actionRun.input as Record<string, unknown>)
      : {};
  return stripSecretsFromValue({
    actionKey: actionRun.actionKey,
    actionIndex: actionRun.actionIndex,
    actionType: actionRun.actionType,
    workflowActionId: actionRun.workflowActionId,
    requiresApproval: actionRun.requiresApproval,
    blockingOnFailure: actionRun.blockingOnFailure,
    errorStrategy: actionRun.errorStrategy ?? 'STOP_WORKFLOW',
    fallbackActionKey: actionRun.fallbackActionKey ?? null,
    compensateActionKey: actionRun.compensateActionKey ?? null,
    compensatable: actionRun.compensatable ?? false,
    config,
    capturedAt: new Date().toISOString(),
  }) as Record<string, unknown>;
}

export function buildResultSummary(
  output: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!output) return undefined;
  const summary: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(output)) {
    if (SECRET_KEY_PATTERN.test(key)) continue;
    if (PII_KEY_PATTERN.test(key)) {
      summary[key] = minimizePiiValue(value);
      continue;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      summary[key] = value;
    } else if (value && typeof value === 'object') {
      summary[key] = stripSecretsFromValue(value);
    }
  }
  return Object.keys(summary).length > 0 ? summary : undefined;
}

export function extractProviderReference(
  output: Record<string, unknown> | undefined,
): string | undefined {
  if (!output) return undefined;
  const candidates = ['taskId', 'alertTaskId', 'notificationId', 'externalReference', 'providerRef'];
  for (const key of candidates) {
    const value = output[key];
    if (typeof value === 'string' && value.length > 0 && value.length <= 200) {
      return value;
    }
  }
  return undefined;
}

export function resolveActionFromRunSnapshot(
  run: { definitionSnapshot: unknown },
  actionRun: {
    actionKey: string;
    actionIndex: number;
    actionType: string;
    workflowActionId: string | null;
    requiresApproval: boolean;
    blockingOnFailure: boolean;
    input: unknown;
  },
): WorkflowActionSnapshotEntry {
  const snapshot = run.definitionSnapshot;
  if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)) {
    const actions = (snapshot as { actions?: unknown[] }).actions;
    if (Array.isArray(actions)) {
      const match = actions.find(
        (a) =>
          a &&
          typeof a === 'object' &&
          ((a as { actionIndex?: number }).actionIndex === actionRun.actionIndex ||
            (a as { actionKey?: string }).actionKey === actionRun.actionKey),
      );
      if (match && typeof match === 'object') {
        const entry = match as Record<string, unknown>;
        const config =
          actionRun.input && typeof actionRun.input === 'object' && !Array.isArray(actionRun.input)
            ? (actionRun.input as Record<string, unknown>)
            : {};
        return {
          actionKey: String(entry.actionKey ?? actionRun.actionKey),
          actionIndex: Number(entry.actionIndex ?? actionRun.actionIndex),
          actionType: String(entry.actionType ?? actionRun.actionType),
          workflowActionId: actionRun.workflowActionId,
          requiresApproval: Boolean(entry.requiresApproval ?? actionRun.requiresApproval),
          blockingOnFailure: Boolean(entry.blockingOnFailure ?? actionRun.blockingOnFailure),
          errorStrategy: String(entry.errorStrategy ?? (actionRun as { errorStrategy?: string }).errorStrategy ?? 'STOP_WORKFLOW'),
          fallbackActionKey: (entry.fallbackActionKey as string | null | undefined) ?? (actionRun as { fallbackActionKey?: string | null }).fallbackActionKey ?? null,
          compensateActionKey: (entry.compensateActionKey as string | null | undefined) ?? (actionRun as { compensateActionKey?: string | null }).compensateActionKey ?? null,
          compensatable: Boolean(entry.compensatable ?? (actionRun as { compensatable?: boolean }).compensatable ?? false),
          config: stripSecretsFromValue(config) as Record<string, unknown>,
        };
      }
    }
  }

  const config =
    actionRun.input && typeof actionRun.input === 'object' && !Array.isArray(actionRun.input)
      ? (actionRun.input as Record<string, unknown>)
      : {};
  return {
    actionKey: actionRun.actionKey,
    actionIndex: actionRun.actionIndex,
    actionType: actionRun.actionType,
    workflowActionId: actionRun.workflowActionId,
    requiresApproval: actionRun.requiresApproval,
    blockingOnFailure: actionRun.blockingOnFailure,
    errorStrategy: (actionRun as { errorStrategy?: string }).errorStrategy ?? 'STOP_WORKFLOW',
    fallbackActionKey: (actionRun as { fallbackActionKey?: string | null }).fallbackActionKey ?? null,
    compensateActionKey: (actionRun as { compensateActionKey?: string | null }).compensateActionKey ?? null,
    compensatable: (actionRun as { compensatable?: boolean }).compensatable ?? false,
    config: stripSecretsFromValue(config) as Record<string, unknown>,
  };
}

export function containsSecretKeys(value: unknown, path = ''): string | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = path ? `${path}.${key}` : key;
      if (SECRET_KEY_PATTERN.test(key)) return childPath;
      const nested = containsSecretKeys(child, childPath);
      if (nested) return nested;
    }
  }
  return null;
}
