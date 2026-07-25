import {
  WorkflowRuntimeActionRunStatus,
  WorkflowRuntimeRunStatus,
  WorkflowRuntimeStatusActorType,
} from '@prisma/client';
import type { WorkflowActionRunStatus, WorkflowRunStatus } from './workflow-runtime-status.constants';

export interface WorkflowRuntimeActor {
  type: WorkflowRuntimeStatusActorType;
  id?: string | null;
  source: string;
}

export interface WorkflowRunStatusTransitionInput {
  toStatus: WorkflowRunStatus;
  expectedLockVersion: number;
  actor: WorkflowRuntimeActor;
  reason?: string | null;
  waitingUntil?: Date | null;
  approvalId?: string | null;
  errorMessage?: string | null;
}

export interface WorkflowActionRunStatusTransitionInput {
  toStatus: WorkflowActionRunStatus;
  expectedLockVersion: number;
  actor: WorkflowRuntimeActor;
  reason?: string | null;
  waitingUntil?: Date | null;
  approvalId?: string | null;
  nextAttemptAt?: Date | null;
  errorMessage?: string | null;
}

export type WorkflowRunRecord = {
  id: string;
  organizationId: string;
  status: WorkflowRuntimeRunStatus;
  lockVersion: number;
  waitingUntil: Date | null;
  approvalId: string | null;
  finishedAt: Date | null;
};

export type WorkflowActionRunRecord = {
  id: string;
  organizationId: string;
  workflowRunId: string;
  status: WorkflowRuntimeActionRunStatus;
  lockVersion: number;
  waitingUntil: Date | null;
  approvalId: string | null;
  finishedAt: Date | null;
  attemptCount: number;
  nextAttemptAt: Date | null;
};
