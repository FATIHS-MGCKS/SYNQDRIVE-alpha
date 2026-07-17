import {
  DOCUMENT_ACTION_EXECUTION_STATUSES,
  DOCUMENT_ACTION_REQUIREMENTS,
  type DocumentActionExecutionRecord,
  type DocumentActionPlanExecution,
} from './document-action.types';

/** Apply lifecycle for confirmed action plans (stored in plausibility._pipeline). */
export const DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES = {
  READY_FOR_ACTION_PREVIEW: 'READY_FOR_ACTION_PREVIEW',
  READY_TO_APPLY: 'READY_TO_APPLY',
  APPLYING: 'APPLYING',
  APPLIED: 'APPLIED',
  PARTIALLY_APPLIED: 'PARTIALLY_APPLIED',
  APPLIED_WITH_WARNINGS: 'APPLIED_WITH_WARNINGS',
  APPLY_FAILED: 'APPLY_FAILED',
} as const;

export type DocumentActionPlanApplyLifecycleStatus =
  (typeof DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES)[keyof typeof DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES];

export type DocumentActionPlanApplyLifecycle = {
  status: DocumentActionPlanApplyLifecycleStatus;
  updatedAt: string;
  applyOutcome?: 'FULL_SUCCESS' | 'OPTIONAL_ACTION_FAILURE' | 'SUGGESTION_FAILURE' | 'REQUIRED_FAILURE';
  failedActionIndices?: number[];
  warningActionIndices?: number[];
};

const TERMINAL_LIFECYCLE_STATUSES = new Set<DocumentActionPlanApplyLifecycleStatus>([
  DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLIED,
  DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.PARTIALLY_APPLIED,
  DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLIED_WITH_WARNINGS,
  DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLY_FAILED,
]);

const VALID_LIFECYCLE_TRANSITIONS: Record<
  DocumentActionPlanApplyLifecycleStatus,
  ReadonlySet<DocumentActionPlanApplyLifecycleStatus>
> = {
  [DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.READY_FOR_ACTION_PREVIEW]: new Set([
    DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.READY_TO_APPLY,
  ]),
  [DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.READY_TO_APPLY]: new Set([
    DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLYING,
  ]),
  [DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLYING]: new Set([
    DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLIED,
    DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.PARTIALLY_APPLIED,
    DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLIED_WITH_WARNINGS,
    DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLY_FAILED,
  ]),
  [DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLY_FAILED]: new Set([
    DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLYING,
  ]),
  [DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.PARTIALLY_APPLIED]: new Set([
    DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLYING,
  ]),
  [DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLIED_WITH_WARNINGS]: new Set([
    DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLYING,
  ]),
  [DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLIED]: new Set(),
};

/** Optional actions that are suggestion-only — failures yield APPLIED_WITH_WARNINGS. */
const SUGGESTION_OPTIONAL_ACTIONS = new Set([
  'SUGGEST_ENTITY_LINK',
  'SUGGEST_DEADLINE_REMINDER',
]);

export function createActionPlanApplyLifecycle(
  status: DocumentActionPlanApplyLifecycleStatus = DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.READY_FOR_ACTION_PREVIEW,
): DocumentActionPlanApplyLifecycle {
  return {
    status,
    updatedAt: new Date().toISOString(),
  };
}

export function isTerminalApplyLifecycleStatus(
  status: DocumentActionPlanApplyLifecycleStatus,
): boolean {
  return TERMINAL_LIFECYCLE_STATUSES.has(status);
}

export function isActionPlanEditable(
  lifecycle: DocumentActionPlanApplyLifecycle | null | undefined,
): boolean {
  if (!lifecycle) return true;
  return lifecycle.status !== DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLYING;
}

export function assertApplyLifecycleTransition(
  current: DocumentActionPlanApplyLifecycleStatus | null | undefined,
  next: DocumentActionPlanApplyLifecycleStatus,
): void {
  if (!current) {
    if (next !== DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.READY_FOR_ACTION_PREVIEW) {
      throw new Error(
        `Initial apply lifecycle must be ${DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.READY_FOR_ACTION_PREVIEW}, got ${next}`,
      );
    }
    return;
  }

  const allowed = VALID_LIFECYCLE_TRANSITIONS[current];
  if (!allowed?.has(next)) {
    throw new Error(`Invalid apply lifecycle transition: ${current} → ${next}`);
  }
}

export function transitionApplyLifecycle(
  current: DocumentActionPlanApplyLifecycle | null | undefined,
  next: DocumentActionPlanApplyLifecycleStatus,
  patch?: Partial<
    Pick<DocumentActionPlanApplyLifecycle, 'applyOutcome' | 'failedActionIndices' | 'warningActionIndices'>
  >,
): DocumentActionPlanApplyLifecycle {
  assertApplyLifecycleTransition(current?.status, next);
  return {
    status: next,
    updatedAt: new Date().toISOString(),
    applyOutcome: patch?.applyOutcome,
    failedActionIndices: patch?.failedActionIndices,
    warningActionIndices: patch?.warningActionIndices,
  };
}

export function listRetryableFailedActionIndices(
  actions: DocumentActionExecutionRecord[],
): number[] {
  return actions
    .filter((row) => row.status === DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED)
    .map((row) => row.actionIndex);
}

export function listSucceededActionIndices(
  actions: DocumentActionExecutionRecord[],
): number[] {
  return actions
    .filter((row) => row.status === DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED)
    .map((row) => row.actionIndex);
}

export function resolveApplyLifecycleOutcome(
  execution: DocumentActionPlanExecution,
): {
  lifecycleStatus: DocumentActionPlanApplyLifecycleStatus;
  applyOutcome: DocumentActionPlanApplyLifecycle['applyOutcome'];
  failedActionIndices: number[];
  warningActionIndices: number[];
} {
  const requiredActions = execution.actions.filter(
    (row) => row.requirement === DOCUMENT_ACTION_REQUIREMENTS.REQUIRED,
  );
  const optionalActions = execution.actions.filter(
    (row) => row.requirement === DOCUMENT_ACTION_REQUIREMENTS.OPTIONAL,
  );

  const requiredFailed = requiredActions.filter(
    (row) => row.status === DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
  );
  if (requiredFailed.length > 0) {
    return {
      lifecycleStatus: DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLY_FAILED,
      applyOutcome: 'REQUIRED_FAILURE',
      failedActionIndices: requiredFailed.map((row) => row.actionIndex),
      warningActionIndices: [],
    };
  }

  const optionalFailed = optionalActions.filter(
    (row) => row.status === DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
  );
  if (optionalFailed.length === 0) {
    return {
      lifecycleStatus: DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLIED,
      applyOutcome: 'FULL_SUCCESS',
      failedActionIndices: [],
      warningActionIndices: [],
    };
  }

  const failedIndices = optionalFailed.map((row) => row.actionIndex);
  const onlySuggestionFailures = optionalFailed.every((row) =>
    SUGGESTION_OPTIONAL_ACTIONS.has(row.semanticAction),
  );

  if (onlySuggestionFailures) {
    return {
      lifecycleStatus: DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLIED_WITH_WARNINGS,
      applyOutcome: 'SUGGESTION_FAILURE',
      failedActionIndices: failedIndices,
      warningActionIndices: failedIndices,
    };
  }

  return {
    lifecycleStatus: DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.PARTIALLY_APPLIED,
    applyOutcome: 'OPTIONAL_ACTION_FAILURE',
    failedActionIndices: failedIndices,
    warningActionIndices: [],
  };
}

export function mapApplyLifecycleToExtractionStatus(
  lifecycleStatus: DocumentActionPlanApplyLifecycleStatus,
): 'APPLIED' | 'PARTIALLY_APPLIED' | 'CONFIRMED' {
  switch (lifecycleStatus) {
    case DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLIED:
    case DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLIED_WITH_WARNINGS:
      return 'APPLIED';
    case DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.PARTIALLY_APPLIED:
      return 'PARTIALLY_APPLIED';
    default:
      return 'CONFIRMED';
  }
}

export function isSuccessfulApplyLifecycle(
  lifecycleStatus: DocumentActionPlanApplyLifecycleStatus,
): boolean {
  return (
    lifecycleStatus === DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLIED ||
    lifecycleStatus === DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.PARTIALLY_APPLIED ||
    lifecycleStatus === DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLIED_WITH_WARNINGS
  );
}

/** Recovery-only unwind for stale APPLYING rows (does not use normal transition table). */
export function unwindStaleApplyingLifecycle(
  lifecycle: DocumentActionPlanApplyLifecycle,
  reason: string,
): DocumentActionPlanApplyLifecycle {
  return {
    ...lifecycle,
    status: DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLY_FAILED,
    updatedAt: new Date().toISOString(),
    applyOutcome: 'REQUIRED_FAILURE',
    failedActionIndices: lifecycle.failedActionIndices ?? [],
    warningActionIndices: lifecycle.warningActionIndices,
  };
}
