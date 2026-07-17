import {
  DOCUMENT_ACTION_EXECUTION_STATUSES,
  DOCUMENT_ACTION_REQUIREMENTS,
  type DocumentActionPlanExecution,
} from './document-action.types';
import {
  assertApplyLifecycleTransition,
  createActionPlanApplyLifecycle,
  isActionPlanEditable,
  isSuccessfulApplyLifecycle,
  mapApplyLifecycleToExtractionStatus,
  resolveApplyLifecycleOutcome,
  transitionApplyLifecycle,
} from './document-action-plan.state-machine';

describe('document-action-plan.state-machine', () => {
  it('allows the canonical lifecycle path', () => {
    let lifecycle = createActionPlanApplyLifecycle();
    expect(lifecycle.status).toBe('READY_FOR_ACTION_PREVIEW');

    lifecycle = transitionApplyLifecycle(lifecycle, 'READY_TO_APPLY');
    lifecycle = transitionApplyLifecycle(lifecycle, 'APPLYING');
    lifecycle = transitionApplyLifecycle(lifecycle, 'APPLIED', { applyOutcome: 'FULL_SUCCESS' });

    expect(lifecycle.status).toBe('APPLIED');
    expect(isSuccessfulApplyLifecycle(lifecycle.status)).toBe(true);
  });

  it('rejects invalid transitions', () => {
    expect(() => assertApplyLifecycleTransition('APPLIED', 'APPLYING')).toThrow(
      /Invalid apply lifecycle transition/,
    );
  });

  it('locks the plan while APPLYING', () => {
    expect(isActionPlanEditable(createActionPlanApplyLifecycle('READY_TO_APPLY'))).toBe(true);
    expect(isActionPlanEditable(createActionPlanApplyLifecycle('APPLYING'))).toBe(false);
  });

  it('resolves APPLIED when all required actions succeed', () => {
    const execution: DocumentActionPlanExecution = {
      planId: 'plan-1',
      planVersion: 1,
      fingerprint: 'fp',
      status: 'COMPLETED',
      actions: [
        {
          actionIndex: 0,
          semanticAction: 'ARCHIVE_DOCUMENT',
          requirement: DOCUMENT_ACTION_REQUIREMENTS.REQUIRED,
          idempotencyKey: 'k1',
          status: DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED,
        },
        {
          actionIndex: 1,
          semanticAction: 'SUGGEST_ENTITY_LINK',
          requirement: DOCUMENT_ACTION_REQUIREMENTS.OPTIONAL,
          idempotencyKey: 'k2',
          status: DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED,
        },
      ],
    };

    expect(resolveApplyLifecycleOutcome(execution)).toMatchObject({
      lifecycleStatus: 'APPLIED',
      applyOutcome: 'FULL_SUCCESS',
      failedActionIndices: [],
    });
  });

  it('resolves APPLIED_WITH_WARNINGS for failed suggestion-only optional actions', () => {
    const execution: DocumentActionPlanExecution = {
      planId: 'plan-1',
      planVersion: 1,
      fingerprint: 'fp',
      status: 'COMPLETED',
      actions: [
        {
          actionIndex: 0,
          semanticAction: 'ARCHIVE_DOCUMENT',
          requirement: DOCUMENT_ACTION_REQUIREMENTS.REQUIRED,
          idempotencyKey: 'k1',
          status: DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED,
        },
        {
          actionIndex: 1,
          semanticAction: 'SUGGEST_ENTITY_LINK',
          requirement: DOCUMENT_ACTION_REQUIREMENTS.OPTIONAL,
          idempotencyKey: 'k2',
          status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
        },
      ],
    };

    expect(resolveApplyLifecycleOutcome(execution)).toMatchObject({
      lifecycleStatus: 'APPLIED_WITH_WARNINGS',
      applyOutcome: 'SUGGESTION_FAILURE',
      warningActionIndices: [1],
    });
    expect(mapApplyLifecycleToExtractionStatus('APPLIED_WITH_WARNINGS')).toBe('APPLIED');
  });

  it('resolves PARTIALLY_APPLIED for failed non-suggestion optional actions', () => {
    const execution: DocumentActionPlanExecution = {
      planId: 'plan-1',
      planVersion: 1,
      fingerprint: 'fp',
      status: 'COMPLETED',
      actions: [
        {
          actionIndex: 0,
          semanticAction: 'ARCHIVE_DOCUMENT',
          requirement: DOCUMENT_ACTION_REQUIREMENTS.REQUIRED,
          idempotencyKey: 'k1',
          status: DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED,
        },
        {
          actionIndex: 1,
          semanticAction: 'REFRESH_VEHICLE_SERVICE_HISTORY',
          requirement: DOCUMENT_ACTION_REQUIREMENTS.OPTIONAL,
          idempotencyKey: 'k2',
          status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
        },
      ],
    };

    expect(resolveApplyLifecycleOutcome(execution)).toMatchObject({
      lifecycleStatus: 'PARTIALLY_APPLIED',
      applyOutcome: 'OPTIONAL_ACTION_FAILURE',
      failedActionIndices: [1],
    });
    expect(mapApplyLifecycleToExtractionStatus('PARTIALLY_APPLIED')).toBe('PARTIALLY_APPLIED');
  });

  it('resolves APPLY_FAILED when a required action fails', () => {
    const execution: DocumentActionPlanExecution = {
      planId: 'plan-1',
      planVersion: 1,
      fingerprint: 'fp',
      status: 'FAILED',
      actions: [
        {
          actionIndex: 0,
          semanticAction: 'ARCHIVE_DOCUMENT',
          requirement: DOCUMENT_ACTION_REQUIREMENTS.REQUIRED,
          idempotencyKey: 'k1',
          status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
        },
      ],
    };

    expect(resolveApplyLifecycleOutcome(execution)).toMatchObject({
      lifecycleStatus: 'APPLY_FAILED',
      applyOutcome: 'REQUIRED_FAILURE',
      failedActionIndices: [0],
    });
    expect(mapApplyLifecycleToExtractionStatus('APPLY_FAILED')).toBe('CONFIRMED');
  });
});
