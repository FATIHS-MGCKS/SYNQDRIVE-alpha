import { DocumentApplyResultService } from './document-apply-result.service';
import { DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES } from './document-action-plan.state-machine';
import { DOCUMENT_ACTION_EXECUTION_STATUSES, DOCUMENT_ACTION_REQUIREMENTS } from './document-action.types';

describe('DocumentApplyResultService', () => {
  const service = new DocumentApplyResultService();

  it('delegates to mapper for applied records', () => {
    const result = service.buildForRecord({
      id: 'ext-apply-1',
      vehicleId: 'veh-1',
      organizationId: 'org-1',
      status: 'APPLIED',
      plausibility: {
        _pipeline: {
          actionPlan: {
            planId: 'plan-1',
            fingerprint: 'fp-1',
            actions: [{ semanticAction: 'ARCHIVE_DOCUMENT', requirement: 'REQUIRED', sequence: 1 }],
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
                semanticAction: 'ARCHIVE_DOCUMENT',
                requirement: DOCUMENT_ACTION_REQUIREMENTS.REQUIRED,
                idempotencyKey: 'key-1',
                status: DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED,
              },
            ],
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          },
        },
      },
    });

    expect(result?.requiredActionsComplete).toBe(true);
    expect(result?.isTerminal).toBe(true);
  });

  it('returns null when no apply pipeline state exists', () => {
    expect(
      service.buildForRecord({
        id: 'ext-empty',
        vehicleId: 'veh-1',
        status: 'READY_FOR_REVIEW',
        plausibility: {},
      }),
    ).toBeNull();
  });
});
