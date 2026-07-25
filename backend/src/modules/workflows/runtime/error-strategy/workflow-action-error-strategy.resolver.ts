import type { WorkflowActionErrorStrategy } from '@prisma/client';
import type { ClassifiedActionError } from '../workflow-action-run-error.classifier';
import type { WorkflowActionRunStatus } from '../workflow-runtime-status.constants';
import { resolveStatusFromClassification } from '../workflow-action-run-error.classifier';
import {
  isActionCompensatable,
  resolveBlockingOnFailure,
} from './workflow-action-error-strategy.constants';

export interface WorkflowActionErrorPolicySnapshot {
  errorStrategy: WorkflowActionErrorStrategy;
  actionType: string;
  fallbackActionKey?: string | null;
  compensateActionKey?: string | null;
  compensatable: boolean;
  blockingOnFailure: boolean;
  fallbackDepth: number;
  maxFallbackDepth: number;
}

export interface WorkflowErrorStrategyResolution {
  targetStatus: WorkflowActionRunStatus;
  appliedStrategy: WorkflowActionErrorStrategy;
  blockingOnFailure: boolean;
  partialFailure: boolean;
  requestApproval: boolean;
  executeFallback: boolean;
  fallbackActionKey?: string;
  compensatePrevious: boolean;
  compensateActionKey?: string;
  auditReason: string;
  usedClassifierRetry: boolean;
}

export function resolveErrorStrategy(
  classification: ClassifiedActionError,
  policy: WorkflowActionErrorPolicySnapshot,
): WorkflowErrorStrategyResolution {
  const strategy = policy.errorStrategy;

  if (
    strategy === 'RETRY' &&
    !classification.blockAutoRetry &&
    classification.retryable
  ) {
    return {
      targetStatus: 'FAILED_RETRYABLE',
      appliedStrategy: 'RETRY',
      blockingOnFailure: policy.blockingOnFailure,
      partialFailure: false,
      requestApproval: false,
      executeFallback: false,
      compensatePrevious: false,
      auditReason: `Retry scheduled: ${classification.errorSummary}`,
      usedClassifierRetry: true,
    };
  }

  if (strategy === 'SKIP_ACTION') {
    return {
      targetStatus: 'SKIPPED',
      appliedStrategy: 'SKIP_ACTION',
      blockingOnFailure: false,
      partialFailure: false,
      requestApproval: false,
      executeFallback: false,
      compensatePrevious: false,
      auditReason: `Action skipped after failure: ${classification.errorSummary}`,
      usedClassifierRetry: false,
    };
  }

  if (strategy === 'REQUEST_APPROVAL') {
    return {
      targetStatus: 'WAITING_FOR_APPROVAL',
      appliedStrategy: 'REQUEST_APPROVAL',
      blockingOnFailure: true,
      partialFailure: false,
      requestApproval: true,
      executeFallback: false,
      compensatePrevious: false,
      auditReason: `Approval requested after failure: ${classification.errorSummary}`,
      usedClassifierRetry: false,
    };
  }

  if (
    strategy === 'EXECUTE_FALLBACK' &&
    policy.fallbackActionKey &&
    policy.fallbackDepth < policy.maxFallbackDepth
  ) {
    return {
      targetStatus: 'SKIPPED',
      appliedStrategy: 'EXECUTE_FALLBACK',
      blockingOnFailure: false,
      partialFailure: false,
      requestApproval: false,
      executeFallback: true,
      fallbackActionKey: policy.fallbackActionKey,
      compensatePrevious: false,
      auditReason: `Primary action failed — executing fallback ${policy.fallbackActionKey}`,
      usedClassifierRetry: false,
    };
  }

  if (strategy === 'EXECUTE_FALLBACK' && policy.fallbackDepth >= policy.maxFallbackDepth) {
    return stopWorkflowResolution(classification, 'Fallback depth limit exceeded');
  }

  if (
    strategy === 'COMPENSATE_PREVIOUS' &&
    isActionCompensatable(policy.actionType, policy.compensatable) &&
    policy.compensateActionKey
  ) {
    return {
      targetStatus: 'FAILED_PERMANENT',
      appliedStrategy: 'COMPENSATE_PREVIOUS',
      blockingOnFailure: resolveBlockingOnFailure('STOP_WORKFLOW'),
      partialFailure: false,
      requestApproval: false,
      executeFallback: false,
      compensatePrevious: true,
      compensateActionKey: policy.compensateActionKey,
      auditReason: `Compensation triggered: ${classification.errorSummary}`,
      usedClassifierRetry: false,
    };
  }

  if (strategy === 'COMPENSATE_PREVIOUS' && !isActionCompensatable(policy.actionType, policy.compensatable)) {
    return stopWorkflowResolution(
      classification,
      'Compensation not allowed for non-compensatable action',
    );
  }

  if (strategy === 'CONTINUE' || strategy === 'MARK_PARTIAL') {
    return {
      targetStatus: 'FAILED_PERMANENT',
      appliedStrategy: strategy,
      blockingOnFailure: false,
      partialFailure: strategy === 'MARK_PARTIAL',
      requestApproval: false,
      executeFallback: false,
      compensatePrevious: false,
      auditReason:
        strategy === 'MARK_PARTIAL'
          ? `Partial failure recorded: ${classification.errorSummary}`
          : `Non-blocking failure — workflow continues: ${classification.errorSummary}`,
      usedClassifierRetry: false,
    };
  }

  if (strategy === 'STOP_WORKFLOW') {
    return stopWorkflowResolution(classification);
  }

  const classifierStatus = resolveStatusFromClassification(classification);
  return {
    targetStatus: classifierStatus,
    appliedStrategy: strategy,
    blockingOnFailure: policy.blockingOnFailure,
    partialFailure: false,
    requestApproval: false,
    executeFallback: false,
    compensatePrevious: false,
    auditReason: classification.errorSummary,
    usedClassifierRetry: classifierStatus === 'FAILED_RETRYABLE',
  };
}

function stopWorkflowResolution(
  classification: ClassifiedActionError,
  prefix?: string,
): WorkflowErrorStrategyResolution {
  const reason = prefix
    ? `${prefix}: ${classification.errorSummary}`
    : `Workflow stopped: ${classification.errorSummary}`;
  return {
    targetStatus: 'FAILED_PERMANENT',
    appliedStrategy: 'STOP_WORKFLOW',
    blockingOnFailure: true,
    partialFailure: false,
    requestApproval: false,
    executeFallback: false,
    compensatePrevious: false,
    auditReason: reason,
    usedClassifierRetry: false,
  };
}
