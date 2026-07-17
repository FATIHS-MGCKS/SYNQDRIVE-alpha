import {
  mergePipelinePlausibility,
  readPipelinePayload,
} from './document-content-cache.util';
import type { DocumentActionPlanExecution } from './document-action.types';
import type { DocumentActionPlan, DocumentActionPlanInvalidationReason } from './document-action-plan.types';

export type DocumentActionPlanPipelineState = {
  actionPlan?: DocumentActionPlan | null;
  actionPlanExecution?: DocumentActionPlanExecution | null;
};

export function readDocumentActionPlanState(plausibility: unknown): DocumentActionPlanPipelineState {
  const pipeline = readPipelinePayload(plausibility);
  return {
    actionPlan: (pipeline.actionPlan as DocumentActionPlan | undefined) ?? null,
    actionPlanExecution: (pipeline.actionPlanExecution as DocumentActionPlanExecution | undefined) ?? null,
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

export function invalidateDocumentActionPlan(
  plausibility: unknown,
  reason: DocumentActionPlanInvalidationReason,
): Record<string, unknown> {
  const { actionPlan } = readDocumentActionPlanState(plausibility);
  if (!actionPlan) {
    return mergePipelinePlausibility(plausibility, {});
  }
  return mergePipelinePlausibility(plausibility, {
    actionPlan: {
      ...actionPlan,
      status: 'INVALIDATED',
      invalidationReason: reason,
    },
  });
}
