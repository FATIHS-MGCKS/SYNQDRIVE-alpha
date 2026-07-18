import {
  BOKRAFT_MISSING_VALIDITY,
  BOKRAFT_NO_DEFECT,
  BOKRAFT_WITH_DEFECT,
  TUV_MISSING_VALIDITY,
  TUV_NO_DEFECT,
  TUV_WITH_DEFECT,
} from './__fixtures__/document-inspection-fixtures';
import {
  assessInspectionPlan,
  INSPECTION_PLAN_OUTCOMES,
  INSPECTION_SEMANTIC_ACTIONS,
  isInspectionDocumentProfile,
} from './document-action-planner.inspection-rules';

function inspectionInput(
  confirmedData: Record<string, unknown>,
  overrides: Partial<Parameters<typeof assessInspectionPlan>[0]> = {},
) {
  return {
    effectiveDocumentType: 'TUV_REPORT',
    confirmedData,
    ...overrides,
  };
}

function semanticActions(result: ReturnType<typeof assessInspectionPlan>): string[] {
  return result.actions.map((action) => action.semanticAction);
}

describe('document-action-planner.inspection-rules', () => {
  it('recognizes TÜV and BOKraft profiles', () => {
    expect(isInspectionDocumentProfile(inspectionInput({}))).toBe(true);
    expect(
      isInspectionDocumentProfile({
        effectiveDocumentType: 'BOKRAFT_REPORT',
        confirmedData: {},
      }),
    ).toBe(true);
    expect(
      isInspectionDocumentProfile({
        effectiveDocumentType: 'SERVICE',
        confirmedData: {},
      }),
    ).toBe(false);
  });

  describe('ohne Mangel', () => {
    it('plans compliance update for complete TÜV without defects', () => {
      const plan = assessInspectionPlan(inspectionInput(TUV_NO_DEFECT));
      expect(plan.planOutcome).toBe(INSPECTION_PLAN_OUTCOMES.READY);
      expect(semanticActions(plan)).toContain(
        INSPECTION_SEMANTIC_ACTIONS.UPDATE_VEHICLE_COMPLIANCE_DATES,
      );
      expect(semanticActions(plan)).not.toContain(
        INSPECTION_SEMANTIC_ACTIONS.SUGGEST_DEFECT_REMEDIATION,
      );
    });

    it('plans compliance update for complete BOKraft without defects', () => {
      const plan = assessInspectionPlan({
        effectiveDocumentType: 'BOKRAFT_REPORT',
        confirmedData: BOKRAFT_NO_DEFECT,
      });
      expect(plan.canUpdateVehicleMasterData).toBe(true);
      expect(semanticActions(plan)).toContain(
        INSPECTION_SEMANTIC_ACTIONS.UPDATE_VEHICLE_COMPLIANCE_DATES,
      );
    });
  });

  describe('mit Mangel', () => {
    it('suggests defect remediation and reinspection without blocking archive', () => {
      const plan = assessInspectionPlan(inspectionInput(TUV_WITH_DEFECT));
      expect(plan.canUpdateVehicleMasterData).toBe(true);
      expect(semanticActions(plan)).toContain(
        INSPECTION_SEMANTIC_ACTIONS.SUGGEST_DEFECT_REMEDIATION,
      );
      expect(semanticActions(plan)).toContain(INSPECTION_SEMANTIC_ACTIONS.SUGGEST_REINSPECTION);
      expect(semanticActions(plan)).toContain(
        INSPECTION_SEMANTIC_ACTIONS.CREATE_COMPLIANCE_SERVICE_EVENT,
      );
    });

    it('suggests follow-ups for BOKraft defects', () => {
      const plan = assessInspectionPlan({
        effectiveDocumentType: 'BOKRAFT_REPORT',
        confirmedData: BOKRAFT_WITH_DEFECT,
      });
      expect(semanticActions(plan)).toContain(
        INSPECTION_SEMANTIC_ACTIONS.SUGGEST_DEFECT_REMEDIATION,
      );
      expect(plan.planOutcome).not.toBe(INSPECTION_PLAN_OUTCOMES.BLOCKED);
    });
  });

  describe('fehlende Gültigkeit', () => {
    it('enters ARCHIVE_ONLY without vehicle master data update', () => {
      const plan = assessInspectionPlan(inspectionInput(TUV_MISSING_VALIDITY));
      expect(plan.planOutcome).toBe(INSPECTION_PLAN_OUTCOMES.ARCHIVE_ONLY);
      expect(plan.canUpdateVehicleMasterData).toBe(false);
      expect(semanticActions(plan)).toContain(INSPECTION_SEMANTIC_ACTIONS.ARCHIVE_DOCUMENT);
      expect(semanticActions(plan)).not.toContain(
        INSPECTION_SEMANTIC_ACTIONS.UPDATE_VEHICLE_COMPLIANCE_DATES,
      );
    });

    it('archives BOKraft without validUntil but skips vehicle update', () => {
      const plan = assessInspectionPlan({
        effectiveDocumentType: 'BOKRAFT_REPORT',
        confirmedData: BOKRAFT_MISSING_VALIDITY,
      });
      expect(plan.planOutcome).toBe(INSPECTION_PLAN_OUTCOMES.ARCHIVE_ONLY);
      expect(semanticActions(plan)).toContain(
        INSPECTION_SEMANTIC_ACTIONS.CREATE_COMPLIANCE_SERVICE_EVENT,
      );
    });
  });
});
