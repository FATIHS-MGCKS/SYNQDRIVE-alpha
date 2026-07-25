import type { WorkflowExecutionPlanDto, WorkflowRevisionDiffResultDto } from '../../../lib/api';

export interface WorkflowSimulationState {
  plan: WorkflowExecutionPlanDto | null;
  loading: boolean;
  error: string | null;
  requestId: string | null;
  sequence: number;
  activeSequence: number;
}

export interface WorkflowRevisionDiffState {
  diff: WorkflowRevisionDiffResultDto | null;
  loading: boolean;
  error: string | null;
}

export type WorkflowRunHistoryFlags = {
  partialFailure: boolean;
  policySuppressed: boolean;
  hasApproval: boolean;
  hasRetry: boolean;
};
