import { buildPublicDocumentApplyResult } from './document-apply-result.mapper';
import { DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES } from './document-action-plan.state-machine';
import { DOCUMENT_ACTION_EXECUTION_STATUSES, DOCUMENT_ACTION_REQUIREMENTS } from './document-action.types';
import { translateDocumentActionErrorCode } from './document-apply-result.messages';

describe('document-apply-result.mapper', () => {
  it('maps successful apply execution with entity links', () => {
    const result = buildPublicDocumentApplyResult({
      id: 'ext-1',
      vehicleId: 'veh-1',
      status: 'APPLIED',
      plausibility: {
        _pipeline: {
          actionPlan: {
            planId: 'plan-1',
            fingerprint: 'fp-1',
            actions: [
              { semanticAction: 'CREATE_FINE_DRAFT', requirement: 'REQUIRED', sequence: 1 },
            ],
          },
          actionPlanApplyLifecycle: {
            status: DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLIED,
            updatedAt: new Date().toISOString(),
          },
          actionPlanExecution: {
            planId: 'plan-1',
            fingerprint: 'fp-1',
            status: 'COMPLETED',
            actions: [
              {
                actionIndex: 0,
                semanticAction: 'CREATE_FINE_DRAFT',
                requirement: DOCUMENT_ACTION_REQUIREMENTS.REQUIRED,
                idempotencyKey: 'key-1',
                status: DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED,
                resultEntityType: 'fine',
                resultEntityId: 'fine-1',
              },
            ],
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          },
        },
      },
    });

    expect(result?.requiredActionsComplete).toBe(true);
    expect(result?.actions[0]?.entityLink?.entityId).toBe('fine-1');
    expect(result?.isTerminal).toBe(true);
  });

  it('marks partially applied with retry option', () => {
    const result = buildPublicDocumentApplyResult({
      id: 'ext-2',
      vehicleId: 'veh-1',
      status: 'PARTIALLY_APPLIED',
      plausibility: {
        _pipeline: {
          actionPlan: {
            planId: 'plan-2',
            fingerprint: 'fp-2',
            actions: [
              { semanticAction: 'CREATE_INVOICE_DRAFT', requirement: 'REQUIRED', sequence: 1 },
              { semanticAction: 'SUGGEST_ENTITY_LINK', requirement: 'OPTIONAL', sequence: 2 },
            ],
          },
          actionPlanApplyLifecycle: {
            status: DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.PARTIALLY_APPLIED,
            updatedAt: new Date().toISOString(),
          },
          actionPlanExecution: {
            planId: 'plan-2',
            fingerprint: 'fp-2',
            status: 'PARTIALLY_COMPLETED',
            actions: [
              {
                actionIndex: 0,
                semanticAction: 'CREATE_INVOICE_DRAFT',
                requirement: DOCUMENT_ACTION_REQUIREMENTS.REQUIRED,
                idempotencyKey: 'key-1',
                status: DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED,
                resultEntityId: 'inv-1',
              },
              {
                actionIndex: 1,
                semanticAction: 'SUGGEST_ENTITY_LINK',
                requirement: DOCUMENT_ACTION_REQUIREMENTS.OPTIONAL,
                idempotencyKey: 'key-2',
                status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
                errorCode: 'TECHNICAL_FAILURE',
                errorMessage: 'raw error',
              },
            ],
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          },
        },
      },
    });

    expect(result?.partiallyApplied).toBe(true);
    expect(result?.canRetryFailedActions).toBe(true);
    expect(result?.actions[1]?.errorMessage).toBe(
      translateDocumentActionErrorCode('TECHNICAL_FAILURE', 'raw error'),
    );
  });

  it('explains non-cancellable applying state', () => {
    const result = buildPublicDocumentApplyResult({
      id: 'ext-3',
      vehicleId: 'veh-1',
      status: 'CONFIRMED',
      plausibility: {
        _pipeline: {
          actionPlanApplyLifecycle: {
            status: DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLYING,
            updatedAt: new Date().toISOString(),
          },
          actionPlan: {
            planId: 'plan-3',
            fingerprint: 'fp-3',
            actions: [
              { semanticAction: 'ARCHIVE_DOCUMENT', requirement: 'REQUIRED', sequence: 1 },
            ],
          },
        },
      },
    });

    expect(result?.applyingInProgress).toBe(true);
    expect(result?.nonCancellable).toBe(true);
    expect(result?.summary).toContain('läuft');
  });
});
