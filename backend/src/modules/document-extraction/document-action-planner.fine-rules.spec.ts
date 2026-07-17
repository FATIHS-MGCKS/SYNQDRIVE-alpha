import {
  FINE_COMPLETE,
  FINE_MISSING_EVENT_DATE,
} from './__fixtures__/document-fine-fixtures';
import {
  assessFinePlan,
  FINE_PLAN_OUTCOMES,
  FINE_SEMANTIC_ACTIONS,
  isFineDocumentProfile,
} from './document-action-planner.fine-rules';

describe('document-action-planner.fine-rules', () => {
  it('recognizes fine document profile', () => {
    expect(isFineDocumentProfile({ effectiveDocumentType: 'FINE', confirmedData: {} })).toBe(true);
    expect(isFineDocumentProfile({ effectiveDocumentType: 'INVOICE', confirmedData: {} })).toBe(false);
  });

  it('plans CREATE_FINE_DRAFT for complete fine documents', () => {
    const plan = assessFinePlan({
      effectiveDocumentType: 'FINE',
      confirmedData: FINE_COMPLETE,
    });

    expect(plan.planOutcome).toBe(FINE_PLAN_OUTCOMES.READY);
    expect(plan.actions.map((row) => row.semanticAction)).toContain(
      FINE_SEMANTIC_ACTIONS.CREATE_FINE_DRAFT,
    );
  });

  it('blocks plan when required metadata is missing', () => {
    const plan = assessFinePlan({
      effectiveDocumentType: 'FINE',
      confirmedData: FINE_MISSING_EVENT_DATE,
    });

    expect(plan.planOutcome).toBe(FINE_PLAN_OUTCOMES.BLOCKED);
    expect(plan.missingRequirements.length).toBeGreaterThan(0);
  });
});
