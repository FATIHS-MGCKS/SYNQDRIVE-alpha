import type { WorkflowActionErrorStrategy } from '@prisma/client';

export const WORKFLOW_ACTION_ERROR_STRATEGIES = [
  'STOP_WORKFLOW',
  'CONTINUE',
  'SKIP_ACTION',
  'REQUEST_APPROVAL',
  'EXECUTE_FALLBACK',
  'RETRY',
  'MARK_PARTIAL',
  'COMPENSATE_PREVIOUS',
] as const satisfies readonly WorkflowActionErrorStrategy[];

/** Internal actions that may be marked compensatable when explicitly configured. */
export const COMPENSATABLE_INTERNAL_ACTION_TYPES = new Set<string>([
  'task.create',
  'alert.create',
  'vehicle.status.update',
]);

/** External / provider-backed actions — never compensatable. */
export const NON_COMPENSATABLE_EXTERNAL_ACTION_TYPES = new Set<string>([
  'notification.prepare',
  'ai.suggest_action',
  'workflow.approval.request',
]);

export const DEFAULT_ERROR_STRATEGY_BY_ACTION: Partial<
  Record<string, WorkflowActionErrorStrategy>
> = {
  'task.create': 'STOP_WORKFLOW',
  'alert.create': 'CONTINUE',
  'vehicle.status.update': 'STOP_WORKFLOW',
  'notification.prepare': 'EXECUTE_FALLBACK',
  'ai.suggest_action': 'REQUEST_APPROVAL',
};

export function isActionCompensatable(
  actionType: string,
  compensatableFlag: boolean,
): boolean {
  if (!compensatableFlag) return false;
  if (NON_COMPENSATABLE_EXTERNAL_ACTION_TYPES.has(actionType)) return false;
  return COMPENSATABLE_INTERNAL_ACTION_TYPES.has(actionType);
}

export function resolveBlockingOnFailure(strategy: WorkflowActionErrorStrategy): boolean {
  switch (strategy) {
    case 'CONTINUE':
    case 'SKIP_ACTION':
    case 'MARK_PARTIAL':
    case 'EXECUTE_FALLBACK':
      return false;
    default:
      return true;
  }
}
