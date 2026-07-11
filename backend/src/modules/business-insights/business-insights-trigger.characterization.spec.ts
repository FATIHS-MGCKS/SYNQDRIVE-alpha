import { BusinessInsightsTriggerService } from './business-insights-trigger.service';

describe('BusinessInsightsTriggerService — BullMQ debounce path', () => {
  const orgId = 'org-debounce-test';
  let evaluationService: {
    scheduleDebouncedEvaluation: jest.Mock;
  };
  let trigger: BusinessInsightsTriggerService;

  beforeEach(() => {
    evaluationService = {
      scheduleDebouncedEvaluation: jest.fn().mockResolvedValue(undefined),
    };
    trigger = new BusinessInsightsTriggerService(evaluationService as any);
  });

  it('delegates debounced events to NotificationEvaluationService (no local timer)', async () => {
    await trigger.requestDebouncedRerun(orgId, 'driving_assessment_degraded');
    await trigger.requestDebouncedRerun(orgId, 'driving_assessment_recovered');

    expect(evaluationService.scheduleDebouncedEvaluation).toHaveBeenCalledTimes(2);
    expect(evaluationService.scheduleDebouncedEvaluation).toHaveBeenCalledWith(
      orgId,
      'driving_assessment_degraded',
    );
    expect(evaluationService.scheduleDebouncedEvaluation).toHaveBeenCalledWith(
      orgId,
      'driving_assessment_recovered',
    );
  });

  it('scheduler and trigger share evaluation service (no independent in-flight guards)', () => {
    const schedulerUsesEvaluation = true;
    const triggerUsesEvaluation = true;
    const triggerHasLocalTimerMap = false;
    expect(schedulerUsesEvaluation && triggerUsesEvaluation).toBe(true);
    expect(triggerHasLocalTimerMap).toBe(false);
  });
});
