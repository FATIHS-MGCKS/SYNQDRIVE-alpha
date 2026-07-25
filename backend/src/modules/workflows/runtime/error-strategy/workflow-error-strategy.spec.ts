import { resolveErrorStrategy } from './workflow-action-error-strategy.resolver';
import { classifyActionError } from '../workflow-action-run-error.classifier';
import { deriveWorkflowRunStatusFromActions } from '../workflow-run-status.derivation';
import {
  isActionCompensatable,
  NON_COMPENSATABLE_EXTERNAL_ACTION_TYPES,
} from './workflow-action-error-strategy.constants';
import { WorkflowActionCompensationService } from './workflow-action-compensation.service';
import { WorkflowErrorStrategyExplainService } from './workflow-error-strategy-explain.service';

describe('WorkflowErrorStrategies', () => {
  describe('resolveErrorStrategy', () => {
    const basePolicy = {
      errorStrategy: 'STOP_WORKFLOW' as const,
      actionType: 'task.create',
      fallbackActionKey: null,
      compensateActionKey: null,
      compensatable: false,
      blockingOnFailure: true,
      fallbackDepth: 0,
      maxFallbackDepth: 3,
    };

    it('STOP_WORKFLOW marks permanent blocking failure', () => {
      const classification = classifyActionError(new Error('invalid payload'), {
        attemptCount: 1,
        maxAttempts: 5,
      });
      const result = resolveErrorStrategy(classification, basePolicy);
      expect(result.appliedStrategy).toBe('STOP_WORKFLOW');
      expect(result.targetStatus).toBe('FAILED_PERMANENT');
      expect(result.blockingOnFailure).toBe(true);
    });

    it('CONTINUE allows non-blocking permanent failure', () => {
      const classification = classifyActionError(new Error('invalid payload'), {
        attemptCount: 1,
        maxAttempts: 5,
      });
      const result = resolveErrorStrategy(classification, {
        ...basePolicy,
        errorStrategy: 'CONTINUE',
        blockingOnFailure: false,
      });
      expect(result.appliedStrategy).toBe('CONTINUE');
      expect(result.blockingOnFailure).toBe(false);
    });

    it('SKIP_ACTION skips instead of failing permanently', () => {
      const classification = classifyActionError(new Error('not found'), {
        attemptCount: 1,
        maxAttempts: 5,
      });
      const result = resolveErrorStrategy(classification, {
        ...basePolicy,
        errorStrategy: 'SKIP_ACTION',
      });
      expect(result.targetStatus).toBe('SKIPPED');
    });

    it('EXECUTE_FALLBACK schedules fallback action', () => {
      const classification = classifyActionError(new Error('provider down'), {
        attemptCount: 1,
        maxAttempts: 5,
      });
      const result = resolveErrorStrategy(classification, {
        ...basePolicy,
        errorStrategy: 'EXECUTE_FALLBACK',
        fallbackActionKey: 'sms-fallback',
      });
      expect(result.executeFallback).toBe(true);
      expect(result.fallbackActionKey).toBe('sms-fallback');
    });

    it('prevents fallback infinite loop at max depth', () => {
      const classification = classifyActionError(new Error('provider down'), {
        attemptCount: 1,
        maxAttempts: 5,
      });
      const result = resolveErrorStrategy(classification, {
        ...basePolicy,
        errorStrategy: 'EXECUTE_FALLBACK',
        fallbackActionKey: 'sms-fallback',
        fallbackDepth: 3,
        maxFallbackDepth: 3,
      });
      expect(result.appliedStrategy).toBe('STOP_WORKFLOW');
      expect(result.executeFallback).toBe(false);
    });

    it('RETRY when attempts remain', () => {
      const classification = classifyActionError(new Error('timeout'), {
        attemptCount: 1,
        maxAttempts: 5,
        timedOut: true,
      });
      const result = resolveErrorStrategy(classification, {
        ...basePolicy,
        errorStrategy: 'RETRY',
      });
      expect(result.targetStatus).toBe('FAILED_RETRYABLE');
    });

    it('RETRY exhausted becomes permanent via classifier path', () => {
      const classification = classifyActionError(new Error('timeout'), {
        attemptCount: 5,
        maxAttempts: 5,
        timedOut: true,
      });
      const result = resolveErrorStrategy(classification, {
        ...basePolicy,
        errorStrategy: 'RETRY',
      });
      expect(result.targetStatus).toBe('FAILED_PERMANENT');
    });

    it('MARK_PARTIAL records partial failure', () => {
      const classification = classifyActionError(new Error('partial'), {
        attemptCount: 1,
        maxAttempts: 5,
      });
      const result = resolveErrorStrategy(classification, {
        ...basePolicy,
        errorStrategy: 'MARK_PARTIAL',
        blockingOnFailure: false,
      });
      expect(result.partialFailure).toBe(true);
    });

    it('COMPENSATE_PREVIOUS only for compensatable internal actions', () => {
      const classification = classifyActionError(new Error('rollback needed'), {
        attemptCount: 1,
        maxAttempts: 5,
      });
      const result = resolveErrorStrategy(classification, {
        ...basePolicy,
        errorStrategy: 'COMPENSATE_PREVIOUS',
        actionType: 'task.create',
        compensatable: true,
        compensateActionKey: 'undo-task',
      });
      expect(result.compensatePrevious).toBe(true);
    });

    it('rejects compensation for external actions', () => {
      const classification = classifyActionError(new Error('rollback needed'), {
        attemptCount: 1,
        maxAttempts: 5,
      });
      const result = resolveErrorStrategy(classification, {
        ...basePolicy,
        errorStrategy: 'COMPENSATE_PREVIOUS',
        actionType: 'notification.prepare',
        compensatable: true,
        compensateActionKey: 'undo-notification',
      });
      expect(result.appliedStrategy).toBe('STOP_WORKFLOW');
      expect(result.compensatePrevious).toBe(false);
    });
  });

  describe('deriveWorkflowRunStatusFromActions', () => {
    it('returns PARTIALLY_COMPLETED for mixed success and partial failure', () => {
      expect(
        deriveWorkflowRunStatusFromActions([
          { status: 'SUCCEEDED', blockingOnFailure: false, partialFailure: false, isFallbackRun: false },
          { status: 'FAILED_PERMANENT', blockingOnFailure: false, partialFailure: true, isFallbackRun: false },
        ]),
      ).toBe('PARTIALLY_COMPLETED');
    });

    it('returns COMPLETED_WITH_FALLBACK when fallback succeeds after primary failure', () => {
      expect(
        deriveWorkflowRunStatusFromActions([
          { status: 'SKIPPED', blockingOnFailure: false, partialFailure: false, isFallbackRun: false },
          { status: 'SUCCEEDED', blockingOnFailure: false, partialFailure: false, isFallbackRun: true },
          { status: 'SUCCEEDED', blockingOnFailure: false, partialFailure: false, isFallbackRun: false },
        ]),
      ).toBe('COMPLETED_WITH_FALLBACK');
    });

    it('returns FAILED when required blocking action permanently fails', () => {
      expect(
        deriveWorkflowRunStatusFromActions([
          { status: 'SUCCEEDED', blockingOnFailure: true, partialFailure: false, isFallbackRun: false },
          { status: 'FAILED_PERMANENT', blockingOnFailure: true, partialFailure: false, isFallbackRun: false },
        ]),
      ).toBe('FAILED');
    });

    it('does not return COMPLETED when blocking failure exists', () => {
      expect(
        deriveWorkflowRunStatusFromActions([
          { status: 'FAILED_PERMANENT', blockingOnFailure: true, partialFailure: false, isFallbackRun: false },
        ]),
      ).not.toBe('COMPLETED');
    });
  });

  describe('WorkflowActionCompensationService', () => {
    it('rejects non-compensatable external action types', async () => {
      const prisma = { workflowActionRun: { findMany: jest.fn() } };
      const service = new WorkflowActionCompensationService(prisma as never);
      await expect(
        service.compensatePrevious({
          organizationId: 'org',
          workflowRunId: 'run',
          failedActionRunId: 'a1',
          compensateActionKey: 'undo',
          actionType: 'notification.prepare',
          compensatable: true,
        }),
      ).rejects.toThrow(/not compensatable/);
    });
  });

  describe('WorkflowErrorStrategyExplainService', () => {
    it('explains error strategies for dry run', () => {
      const service = new WorkflowErrorStrategyExplainService();
      const plan = service.explainFromDefinition([
        {
          actionKey: 'whatsapp',
          actionType: 'notification.prepare',
          errorStrategy: 'EXECUTE_FALLBACK',
          fallbackActionKey: 'sms-fallback',
        },
        {
          actionKey: 'sms-fallback',
          actionType: 'notification.prepare',
          errorStrategy: 'STOP_WORKFLOW',
        },
      ]);
      expect(plan[0].errorStrategy).toBe('EXECUTE_FALLBACK');
      expect(plan[0].notes.some((n) => n.includes('External/provider action'))).toBe(true);
      expect(plan[1].fallbackActionKey).toBeNull();
    });

    it('flags invalid compensation on external actions', () => {
      const service = new WorkflowErrorStrategyExplainService();
      const plan = service.explainFromDefinition([
        {
          actionKey: 'notify',
          actionType: 'notification.prepare',
          errorStrategy: 'COMPENSATE_PREVIOUS',
          compensatable: true,
        },
      ]);
      expect(plan[0].compensationAllowed).toBe(false);
      expect(NON_COMPENSATABLE_EXTERNAL_ACTION_TYPES.has('notification.prepare')).toBe(true);
      expect(isActionCompensatable('notification.prepare', true)).toBe(false);
    });
  });
});
