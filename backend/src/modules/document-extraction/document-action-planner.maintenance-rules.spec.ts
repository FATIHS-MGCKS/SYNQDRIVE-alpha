import { planDocumentActions } from './document-action-planner.engine';
import {
  assessMaintenanceDraftRequirements,
  hasConfirmedDefectStatus,
  MAINTENANCE_SEMANTIC_ACTIONS,
} from './document-action-planner.maintenance-rules';
import { buildPlannerTestInput } from './document-action-planner.test-fixtures';

function maintenanceInput(
  effectiveDocumentType: 'SERVICE' | 'OIL_CHANGE' | 'TUV_REPORT' | 'BOKRAFT_REPORT' | 'DAMAGE' | 'ACCIDENT' | 'VEHICLE_CONDITION',
  confirmedData: Record<string, unknown>,
  overrides: Parameters<typeof buildPlannerTestInput>[0] = {},
) {
  return buildPlannerTestInput({
    effectiveDocumentType,
    entityLinks: [{ role: 'PRIMARY_VEHICLE', entityType: 'VEHICLE', entityId: 'veh-1' }],
    entityCandidates: [],
    confirmedData,
    ...overrides,
  });
}

function semanticActions(result: ReturnType<typeof planDocumentActions>): string[] {
  return result.actions
    .map((action) => (action.previewPayload as Record<string, unknown>)?.semanticAction)
    .filter((value): value is string => typeof value === 'string');
}

describe('document-action-planner.maintenance-rules', () => {
  describe('SERVICE / OIL_CHANGE', () => {
    it('creates service event for complete service document', () => {
      const result = planDocumentActions(
        maintenanceInput('SERVICE', {
          eventDate: '2026-01-15',
          workshopName: 'Werkstatt Nord',
          description: 'Inspektion',
        }),
      );

      expect(result.planDraft.snapshot.planningMode).toBe('MAINTENANCE');
      expect(semanticActions(result)).toContain(MAINTENANCE_SEMANTIC_ACTIONS.CREATE_SERVICE_EVENT);
      expect(result.actions[0].inputPayload).toMatchObject({
        eventDate: '2026-01-15',
        note: 'Planner never substitutes the current date for missing document dates.',
      });
    });

    it('blocks service event without event date', () => {
      const result = planDocumentActions(
        maintenanceInput('SERVICE', {
          description: 'Ohne Datum',
        }),
      );

      expect(result.planDraft.isBlocked).toBe(true);
      expect(semanticActions(result)).not.toContain(MAINTENANCE_SEMANTIC_ACTIONS.CREATE_SERVICE_EVENT);
    });
  });

  describe('TUV / BOKRAFT', () => {
    it('updates TUV compliance using confirmed validUntil', () => {
      const result = planDocumentActions(
        maintenanceInput('TUV_REPORT', {
          eventDate: '2026-02-01',
          validUntil: '2028-02-01',
          reportNumber: 'TUV-99',
          result: 'ohne Mängel',
        }),
      );

      expect(semanticActions(result)).toContain(MAINTENANCE_SEMANTIC_ACTIONS.CREATE_SERVICE_EVENT);
      expect(semanticActions(result)).toContain(MAINTENANCE_SEMANTIC_ACTIONS.UPDATE_TUV_COMPLIANCE);
      const compliance = result.actions.find(
        (action) =>
          (action.previewPayload as Record<string, unknown>)?.semanticAction ===
          MAINTENANCE_SEMANTIC_ACTIONS.UPDATE_TUV_COMPLIANCE,
      );
      expect(compliance?.inputPayload).toMatchObject({
        validUntil: '2028-02-01',
        defectStatus: 'NO_DEFECTS_CONFIRMED',
      });
    });

    it('suggests repair and inspection when defects are confirmed', () => {
      const input = maintenanceInput('TUV_REPORT', {
        eventDate: '2026-02-01',
        validUntil: '2028-02-01',
        defects: 'Bremsleuchte defekt',
      });
      expect(hasConfirmedDefectStatus(input)).toBe(true);

      const result = planDocumentActions(input);
      expect(semanticActions(result)).toContain(MAINTENANCE_SEMANTIC_ACTIONS.SUGGEST_REPAIR_TASK);
      expect(semanticActions(result)).toContain(
        MAINTENANCE_SEMANTIC_ACTIONS.SUGGEST_VEHICLE_INSPECTION,
      );
    });

    it('blocks TUV plan without validUntil', () => {
      const result = planDocumentActions(
        maintenanceInput('TUV_REPORT', {
          eventDate: '2026-02-01',
        }),
      );

      expect(result.planDraft.isBlocked).toBe(true);
      expect(semanticActions(result)).not.toContain(MAINTENANCE_SEMANTIC_ACTIONS.UPDATE_TUV_COMPLIANCE);
    });

    it('updates BOKRAFT compliance separately', () => {
      const result = planDocumentActions(
        maintenanceInput('BOKRAFT_REPORT', {
          eventDate: '2026-07-01',
          validUntil: '2027-07-01',
        }),
      );

      expect(semanticActions(result)).toContain(
        MAINTENANCE_SEMANTIC_ACTIONS.UPDATE_BOKRAFT_COMPLIANCE,
      );
    });
  });

  describe('DAMAGE / ACCIDENT', () => {
    it('creates damage draft without inventing severity or damage type', () => {
      const result = planDocumentActions(
        maintenanceInput('DAMAGE', {
          description: 'Kratzer Stoßstange',
        }),
      );

      expect(semanticActions(result)).toContain(MAINTENANCE_SEMANTIC_ACTIONS.CREATE_DAMAGE_DRAFT);
      const draft = result.actions.find((action) => action.actionType === 'CREATE_DAMAGE');
      expect(draft?.inputPayload).toMatchObject({
        severity: null,
        damageType: null,
      });
    });

    it('passes through confirmed severity without defaulting damage type', () => {
      const assessment = assessMaintenanceDraftRequirements(
        maintenanceInput('DAMAGE', {
          description: 'Delle',
          severity: 'MODERATE',
        }),
      );
      expect(assessment.canCreateDamageDraft).toBe(true);

      const result = planDocumentActions(
        maintenanceInput('DAMAGE', {
          description: 'Delle',
          severity: 'MODERATE',
        }),
      );
      const draft = result.actions.find((action) => action.actionType === 'CREATE_DAMAGE');
      expect(draft?.inputPayload).toMatchObject({
        severity: 'MODERATE',
        damageType: null,
      });
    });

    it('does not auto-create damage draft for accident documents', () => {
      const result = planDocumentActions(
        maintenanceInput('ACCIDENT', {
          eventDate: '2026-01-05',
          description: 'Auffahrunfall',
          severity: 'MODERATE',
        }),
      );

      expect(semanticActions(result)).not.toContain(MAINTENANCE_SEMANTIC_ACTIONS.CREATE_DAMAGE_DRAFT);
      expect(semanticActions(result)).toContain(MAINTENANCE_SEMANTIC_ACTIONS.SUGGEST_INSURANCE_REVIEW);
      expect(semanticActions(result)).toContain(MAINTENANCE_SEMANTIC_ACTIONS.SUGGEST_REPAIR_TASK);
    });
  });

  describe('VEHICLE_CONDITION', () => {
    it('creates inspection draft for complete condition report', () => {
      const result = planDocumentActions(
        maintenanceInput('VEHICLE_CONDITION', {
          eventDate: '2026-03-01',
          description: 'Übergabeprotokoll',
        }),
      );

      expect(semanticActions(result)).toContain(MAINTENANCE_SEMANTIC_ACTIONS.CREATE_INSPECTION_DRAFT);
    });

    it('blocks inspection draft without description', () => {
      const result = planDocumentActions(
        maintenanceInput('VEHICLE_CONDITION', {
          eventDate: '2026-03-01',
        }),
      );

      expect(result.planDraft.isBlocked).toBe(true);
      expect(semanticActions(result)).not.toContain(
        MAINTENANCE_SEMANTIC_ACTIONS.CREATE_INSPECTION_DRAFT,
      );
    });
  });

  describe('readiness policy', () => {
    it('blocks executable actions when readiness policy blocks apply', () => {
      const result = planDocumentActions(
        maintenanceInput(
          'SERVICE',
          { eventDate: '2026-01-15' },
          {
            applySafetyDecision: {
              readinessPolicyBlocked: true,
              readinessPolicyMessage: 'Vehicle not ready for apply',
            },
          },
        ),
      );

      expect(result.planDraft.isBlocked).toBe(true);
      expect(result.blockingReasons.some((reason) => reason.code === 'READINESS_POLICY_BLOCKED')).toBe(
        true,
      );
      expect(semanticActions(result)).not.toContain(MAINTENANCE_SEMANTIC_ACTIONS.CREATE_SERVICE_EVENT);
    });
  });
});
