/**
 * Explicit workflow execution mode — required on all runtime entry points.
 * Internal helpers default to DRY_RUN when mode is omitted (safe-by-default).
 */
export enum WorkflowExecutionMode {
  DRY_RUN = 'DRY_RUN',
  SHADOW = 'SHADOW',
  LIVE = 'LIVE',
}

export function assertLiveExecution(mode: WorkflowExecutionMode, context: string): void {
  if (mode !== WorkflowExecutionMode.LIVE) {
    throw new Error(
      `${context}: side effects are only permitted in LIVE execution mode (got ${mode})`,
    );
  }
}

export function resolveExecutionMode(
  mode: WorkflowExecutionMode | undefined,
  /** When true, missing mode defaults to DRY_RUN (preview/plan paths). */
  safeDefault = true,
): WorkflowExecutionMode {
  if (mode !== undefined) return mode;
  return safeDefault ? WorkflowExecutionMode.DRY_RUN : WorkflowExecutionMode.LIVE;
}
