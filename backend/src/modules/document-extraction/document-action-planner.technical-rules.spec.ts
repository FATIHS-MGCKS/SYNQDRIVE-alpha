import {
  assessTechnicalPlan,
  buildTechnicalPlannerSummary,
  isTechnicalDocumentProfile,
  TECHNICAL_DOCUMENT_TYPES,
  TECHNICAL_PLAN_OUTCOMES,
  TECHNICAL_SEMANTIC_ACTIONS,
} from './document-action-planner.technical-rules';
import {
  BATTERY_HV_SOH,
  BATTERY_LV_COMPLETE,
  BATTERY_LV_SOH_INFERRED,
  BATTERY_MISSING_DATE,
  BATTERY_MISSING_SCOPE,
} from './__fixtures__/document-battery-fixtures';
import {
  BRAKE_COMPLETE,
  BRAKE_FRONT_ONLY,
  BRAKE_MISSING_DATE,
} from './__fixtures__/document-brake-fixtures';
import {
  TIRE_COMPLETE,
  TIRE_MISSING_DATE,
  TIRE_PARTIAL_POSITIONS,
} from './__fixtures__/document-tire-fixtures';

function technicalInput(
  documentType: string,
  confirmedData: Record<string, unknown>,
) {
  return { effectiveDocumentType: documentType, confirmedData };
}

function semanticActions(result: ReturnType<typeof assessTechnicalPlan>): string[] {
  return result.actions.map((action) => action.semanticAction);
}

describe('document-action-planner.technical-rules', () => {
  it('recognizes TIRE, BRAKE, and BATTERY profiles', () => {
    expect(isTechnicalDocumentProfile(technicalInput('TIRE', {}))).toBe(true);
    expect(isTechnicalDocumentProfile(technicalInput('BRAKE', {}))).toBe(true);
    expect(isTechnicalDocumentProfile(technicalInput('BATTERY', {}))).toBe(true);
    expect(isTechnicalDocumentProfile(technicalInput('SERVICE', {}))).toBe(false);
  });

  it('plans READY tire measurement apply for complete report', () => {
    const plan = assessTechnicalPlan(technicalInput('TIRE', TIRE_COMPLETE));
    expect(plan.documentType).toBe(TECHNICAL_DOCUMENT_TYPES.TIRE);
    expect(plan.planOutcome).toBe(TECHNICAL_PLAN_OUTCOMES.READY);
    expect(semanticActions(plan)).toContain(TECHNICAL_SEMANTIC_ACTIONS.APPLY_TIRE_MEASUREMENT);
  });

  it('plans ARCHIVE_ONLY when tire measurement date is missing', () => {
    const plan = assessTechnicalPlan(technicalInput('TIRE', TIRE_MISSING_DATE));
    expect(plan.planOutcome).toBe(TECHNICAL_PLAN_OUTCOMES.ARCHIVE_ONLY);
    expect(plan.missingRequirements.some((req) => req.code === 'TIRE_MEASUREMENT_DATE_REQUIRED')).toBe(
      true,
    );
  });

  it('plans READY brake apply only for stated axles', () => {
    const plan = assessTechnicalPlan(technicalInput('BRAKE', BRAKE_FRONT_ONLY));
    expect(plan.documentType).toBe(TECHNICAL_DOCUMENT_TYPES.BRAKE);
    expect(plan.planOutcome).toBe(TECHNICAL_PLAN_OUTCOMES.READY);
    expect(semanticActions(plan)).toContain(TECHNICAL_SEMANTIC_ACTIONS.APPLY_BRAKE_MEASUREMENT);
  });

  it('plans ARCHIVE_ONLY when brake measurement date is missing', () => {
    const plan = assessTechnicalPlan(technicalInput('BRAKE', BRAKE_MISSING_DATE));
    expect(plan.planOutcome).toBe(TECHNICAL_PLAN_OUTCOMES.ARCHIVE_ONLY);
  });

  it('plans READY battery apply for confirmed HV SOH source', () => {
    const plan = assessTechnicalPlan(technicalInput('BATTERY', BATTERY_HV_SOH));
    expect(plan.documentType).toBe(TECHNICAL_DOCUMENT_TYPES.BATTERY);
    expect(plan.planOutcome).toBe(TECHNICAL_PLAN_OUTCOMES.READY);
    expect(semanticActions(plan)).toContain(TECHNICAL_SEMANTIC_ACTIONS.APPLY_BATTERY_MEASUREMENT);
  });

  it('blocks LV SOH inference and missing scope', () => {
    const lvPlan = assessTechnicalPlan(technicalInput('BATTERY', BATTERY_LV_SOH_INFERRED));
    expect(lvPlan.planOutcome).toBe(TECHNICAL_PLAN_OUTCOMES.BLOCKED);
    expect(lvPlan.missingRequirements.some((req) => req.code === 'BATTERY_LV_SOH_BLOCKED')).toBe(
      true,
    );

    const scopePlan = assessTechnicalPlan(technicalInput('BATTERY', BATTERY_MISSING_SCOPE));
    expect(scopePlan.planOutcome).toBe(TECHNICAL_PLAN_OUTCOMES.BLOCKED);
  });

  it('builds planner summaries', () => {
    expect(buildTechnicalPlannerSummary(assessTechnicalPlan(technicalInput('TIRE', TIRE_COMPLETE)))).toMatch(
      /ready/i,
    );
    expect(
      buildTechnicalPlannerSummary(assessTechnicalPlan(technicalInput('BRAKE', BRAKE_COMPLETE))),
    ).toMatch(/ready/i);
    expect(
      buildTechnicalPlannerSummary(
        assessTechnicalPlan(technicalInput('BATTERY', BATTERY_LV_COMPLETE)),
      ),
    ).toMatch(/ready/i);
    expect(
      buildTechnicalPlannerSummary(
        assessTechnicalPlan(technicalInput('BATTERY', BATTERY_MISSING_DATE)),
      ),
    ).toMatch(/archive-only/i);
    expect(
      buildTechnicalPlannerSummary(
        assessTechnicalPlan(technicalInput('TIRE', TIRE_PARTIAL_POSITIONS)),
      ),
    ).toMatch(/ready/i);
  });
});
