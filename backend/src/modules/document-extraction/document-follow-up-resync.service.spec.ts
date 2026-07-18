import { FINE_COMPLETE } from './__fixtures__/document-fine-fixtures';
import { DocumentFollowUpResyncService } from './document-follow-up-resync.service';
import { DOCUMENT_ACTION_PLAN_STATUSES } from './document-action.types';

describe('DocumentFollowUpResyncService', () => {
  const actionOrchestrator = {
    supportsExecutorPath: jest.fn().mockReturnValue(true),
    buildPreviewPlan: jest.fn().mockResolvedValue({
      planId: 'plan-1',
      planOutcome: 'READY',
      status: DOCUMENT_ACTION_PLAN_STATUSES.CONFIRMED,
      actions: [],
    }),
  };
  const followUpSuggestionService = {
    syncForActionPlan: jest.fn().mockResolvedValue(undefined),
  };

  const service = new DocumentFollowUpResyncService(
    actionOrchestrator as any,
    followUpSuggestionService as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const baseRecord = {
    id: 'ext-resync-1',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    status: 'READY_FOR_REVIEW',
    documentType: 'FINE' as const,
    confirmedData: {
      _fieldReview: { savedAt: '2026-07-17T00:00:00.000Z' },
      values: FINE_COMPLETE,
    },
    plausibility: { checks: [] },
    sourceFileUrl: 'storage://fine.pdf',
  };

  it('resyncs follow-up suggestions after plan change', async () => {
    await service.resyncAfterPlanChange(baseRecord);

    expect(actionOrchestrator.buildPreviewPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        extractionId: 'ext-resync-1',
        documentType: 'FINE',
        vehicleId: 'veh-1',
      }),
    );
    expect(followUpSuggestionService.syncForActionPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        record: baseRecord,
        plan: expect.objectContaining({ planId: 'plan-1' }),
      }),
    );
  });

  it('skips when status is not READY_FOR_REVIEW', async () => {
    await service.resyncAfterPlanChange({ ...baseRecord, status: 'APPLIED' });
    expect(actionOrchestrator.buildPreviewPlan).not.toHaveBeenCalled();
  });

  it('skips when field review was not saved', async () => {
    await service.resyncAfterPlanChange({
      ...baseRecord,
      confirmedData: { acceptedEntityLinks: [] },
    });
    expect(actionOrchestrator.buildPreviewPlan).not.toHaveBeenCalled();
  });

  it('skips when vehicle is not assigned', async () => {
    await service.resyncAfterPlanChange({ ...baseRecord, vehicleId: null });
    expect(actionOrchestrator.buildPreviewPlan).not.toHaveBeenCalled();
  });

  it('skips when document type has no executor path', async () => {
    actionOrchestrator.supportsExecutorPath.mockReturnValueOnce(false);
    await service.resyncAfterPlanChange(baseRecord);
    expect(actionOrchestrator.buildPreviewPlan).not.toHaveBeenCalled();
  });
});
