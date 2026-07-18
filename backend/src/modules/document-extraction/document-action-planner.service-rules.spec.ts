import { OIL_CHANGE_COMPLETE, SERVICE_COMPLETE, SERVICE_MISSING_DATE } from './__fixtures__/document-service-fixtures';
import {
  assessServicePlan,
  SERVICE_PLAN_OUTCOMES,
  SERVICE_SEMANTIC_ACTIONS,
} from './document-action-planner.service-rules';

function serviceInput(confirmedData: Record<string, unknown>) {
  return {
    effectiveDocumentType: 'SERVICE',
    confirmedData,
  };
}

describe('document-action-planner.service-rules', () => {
  it('plans service event + history refresh for complete service', () => {
    const assessment = assessServicePlan(serviceInput(SERVICE_COMPLETE));
    expect(assessment.planOutcome).toBe(SERVICE_PLAN_OUTCOMES.READY);
    expect(assessment.actions.map((action) => action.semanticAction)).toEqual([
      SERVICE_SEMANTIC_ACTIONS.CREATE_SERVICE_EVENT,
      SERVICE_SEMANTIC_ACTIONS.REFRESH_VEHICLE_SERVICE_HISTORY,
      SERVICE_SEMANTIC_ACTIONS.ARCHIVE_DOCUMENT,
    ]);
  });

  it('blocks when event date is missing', () => {
    const assessment = assessServicePlan(serviceInput(SERVICE_MISSING_DATE));
    expect(assessment.planOutcome).toBe(SERVICE_PLAN_OUTCOMES.BLOCKED);
    expect(assessment.actions).toHaveLength(0);
  });

  it('supports oil change profile', () => {
    const assessment = assessServicePlan({
      effectiveDocumentType: 'OIL_CHANGE',
      confirmedData: OIL_CHANGE_COMPLETE,
    });
    expect(assessment.planOutcome).toBe(SERVICE_PLAN_OUTCOMES.READY);
  });
});
