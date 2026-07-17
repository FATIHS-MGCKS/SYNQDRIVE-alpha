import {
  mergePipelinePlausibility,
  readPipelinePayload,
} from './document-content-cache.util';
import { supersedeFollowUpSuggestions } from './document-follow-up-suggestion.store';
import type { DocumentActionPlanExecution } from './document-action.types';
import type { DocumentActionPlan, DocumentActionPlanInvalidationReason } from './document-action-plan.types';
import {
  createActionPlanApplyLifecycle,
  isActionPlanEditable,
  type DocumentActionPlanApplyLifecycle,
  type DocumentActionPlanApplyLifecycleStatus,
} from './document-action-plan.state-machine';
import { DocumentActionPlanError, DOCUMENT_ACTION_ERROR_CODES } from './document-action.errors';

export type DocumentActionPlanPipelineState = {
  actionPlan?: DocumentActionPlan | null;
  actionPlanExecution?: DocumentActionPlanExecution | null;
  actionPlanApplyLifecycle?: DocumentActionPlanApplyLifecycle | null;
};

export function readDocumentActionPlanState(plausibility: unknown): DocumentActionPlanPipelineState {
  const pipeline = readPipelinePayload(plausibility);
  return {
    actionPlan: (pipeline.actionPlan as DocumentActionPlan | undefined) ?? null,
    actionPlanExecution: (pipeline.actionPlanExecution as DocumentActionPlanExecution | undefined) ?? null,
    actionPlanApplyLifecycle:
      (pipeline.actionPlanApplyLifecycle as DocumentActionPlanApplyLifecycle | undefined) ?? null,
  };
}

export function storeDocumentActionPlan(
  plausibility: unknown,
  plan: DocumentActionPlan,
): Record<string, unknown> {
  return mergePipelinePlausibility(plausibility, { actionPlan: plan });
}

export function storeDocumentActionPlanExecution(
  plausibility: unknown,
  execution: DocumentActionPlanExecution,
): Record<string, unknown> {
  return mergePipelinePlausibility(plausibility, { actionPlanExecution: execution });
}

export function storeDocumentActionPlanApplyLifecycle(
  plausibility: unknown,
  lifecycle: DocumentActionPlanApplyLifecycle,
): Record<string, unknown> {
  return mergePipelinePlausibility(plausibility, { actionPlanApplyLifecycle: lifecycle });
}

export function assertActionPlanEditable(plausibility: unknown): void {
  const { actionPlanApplyLifecycle } = readDocumentActionPlanState(plausibility);
  if (!isActionPlanEditable(actionPlanApplyLifecycle)) {
    throw new DocumentActionPlanError(
      DOCUMENT_ACTION_ERROR_CODES.PLAN_LOCKED,
      'Action plan cannot be edited while apply is in progress',
      { lifecycleStatus: actionPlanApplyLifecycle?.status ?? null },
    );
  }
}

export function ensureActionPlanApplyLifecycle(
  plausibility: unknown,
  status: DocumentActionPlanApplyLifecycleStatus = 'READY_FOR_ACTION_PREVIEW',
): DocumentActionPlanApplyLifecycle {
  const { actionPlanApplyLifecycle } = readDocumentActionPlanState(plausibility);
  return actionPlanApplyLifecycle ?? createActionPlanApplyLifecycle(status);
}

export function invalidateDocumentActionPlan(
  plausibility: unknown,
  reason: DocumentActionPlanInvalidationReason,
): Record<string, unknown> {
  assertActionPlanEditable(plausibility);
  const { actionPlan } = readDocumentActionPlanState(plausibility);
  const superseded = supersedeFollowUpSuggestions(plausibility);
  if (!actionPlan) {
    return mergePipelinePlausibility(superseded, {});
  }
  return mergePipelinePlausibility(superseded, {
    actionPlan: {
      ...actionPlan,
      status: 'INVALIDATED',
      invalidationReason: reason,
    },
  });
}
