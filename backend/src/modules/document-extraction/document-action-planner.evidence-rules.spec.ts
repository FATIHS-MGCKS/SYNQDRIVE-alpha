import { planDocumentActions } from './document-action-planner.engine';
import {
  assessEvidenceDraftRequirements,
  EVIDENCE_PLAN_OUTCOMES,
  EVIDENCE_SEMANTIC_ACTIONS,
  validateBatteryMeasurements,
  validateBrakeMeasurements,
  validateTireMeasurements,
} from './document-action-planner.evidence-rules';
import { buildPlannerTestInput } from './document-action-planner.test-fixtures';

function evidenceInput(
  effectiveDocumentType: 'TIRE' | 'BRAKE' | 'BATTERY' | 'SERVICE',
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

describe('document-action-planner.evidence-rules', () => {
  describe('measurement validation', () => {
    it('accepts valid tire tread depths in mm', () => {
      const issues = validateTireMeasurements({
        treadDepthMm: { fl: 5.2, fr: 5.1, rl: 4.8, rr: 4.7 },
      });
      expect(issues).toHaveLength(0);
    });

    it('blocks negative and out-of-range tire tread values', () => {
      expect(validateTireMeasurements({ treadDepthMm: { fl: -1 } })[0]?.severity).toBe('BLOCKER');
      expect(
        validateTireMeasurements({ treadDepthMm: { fr: 25 } })[0]?.code,
      ).toContain('OUT_OF_RANGE');
    });

    it('flags implausibly high tread as warning', () => {
      const issues = validateTireMeasurements({ treadDepthMm: { fl: 15 } });
      expect(issues[0]?.severity).toBe('WARNING');
    });

    it('validates brake pad/disc mm ranges', () => {
      expect(validateBrakeMeasurements({ frontPadMm: -1 })[0]?.severity).toBe('BLOCKER');
      expect(validateBrakeMeasurements({ frontDiscMm: 60 })[0]?.severity).toBe('BLOCKER');
      expect(validateBrakeMeasurements({ frontPadMm: 8 })).toHaveLength(0);
    });

    it('validates battery voltage and SOH ranges', () => {
      expect(validateBatteryMeasurements({ scope: 'lv', voltageV: 4 })[0]?.severity).toBe('WARNING');
      expect(validateBatteryMeasurements({ sohPercent: 150 })[0]?.severity).toBe('BLOCKER');
    });
  });

  describe('tire evidence', () => {
    it('creates tire measurement from confirmed tread depths', () => {
      const result = planDocumentActions(
        evidenceInput('TIRE', {
          eventDate: '2026-01-01',
          treadDepthMm: { fl: 5.2, fr: 5.1, rl: 4.8, rr: 4.7 },
        }),
      );

      expect(result.planDraft.snapshot.planningMode).toBe('EVIDENCE');
      expect(semanticActions(result)).toContain(EVIDENCE_SEMANTIC_ACTIONS.CREATE_TIRE_MEASUREMENT);
      const action = result.actions.find((row) => row.actionType === 'RECORD_TIRE_MEASUREMENT');
      expect(action?.inputPayload).toMatchObject({
        unit: 'mm',
        noHealthScoreOverwrite: true,
        supplementalEvidenceOnly: true,
        provenance: 'CONFIRMED_DOCUMENT',
      });
    });

    it('blocks tire evidence without tread depth', () => {
      const result = planDocumentActions(
        evidenceInput('TIRE', {
          eventDate: '2026-01-01',
          odometerKm: 10000,
        }),
      );

      expect(result.planDraft.isBlocked).toBe(true);
      expect(semanticActions(result)).not.toContain(EVIDENCE_SEMANTIC_ACTIONS.CREATE_TIRE_MEASUREMENT);
    });

    it('suggests remeasurement for implausible tread without creating evidence', () => {
      const assessment = assessEvidenceDraftRequirements(
        evidenceInput('TIRE', {
          eventDate: '2026-01-01',
          treadDepthMm: { fl: 15, fr: 5, rl: 5, rr: 5 },
        }),
      );
      expect(assessment.planOutcome).toBe(EVIDENCE_PLAN_OUTCOMES.REQUIRES_REMEASUREMENT);

      const result = planDocumentActions(
        evidenceInput('TIRE', {
          eventDate: '2026-01-01',
          treadDepthMm: { fl: 15, fr: 5, rl: 5, rr: 5 },
        }),
      );
      expect(semanticActions(result)).not.toContain(EVIDENCE_SEMANTIC_ACTIONS.CREATE_TIRE_MEASUREMENT);
      expect(semanticActions(result)).toContain(EVIDENCE_SEMANTIC_ACTIONS.SUGGEST_REMEASUREMENT);
    });
  });

  describe('brake evidence', () => {
    it('creates brake evidence from confirmed measurements', () => {
      const result = planDocumentActions(
        evidenceInput('BRAKE', {
          eventDate: '2026-04-01',
          frontPadMm: 8,
          rearPadMm: 7,
          serviceKind: 'inspection_only',
        }),
      );

      expect(semanticActions(result)).toContain(EVIDENCE_SEMANTIC_ACTIONS.CREATE_BRAKE_EVIDENCE);
      expect((result.actions[0].inputPayload as Record<string, unknown>).workshopFindingProvenance).toBe(
        false,
      );
    });

    it('blocks brake evidence without confirmed measurements', () => {
      const result = planDocumentActions(
        evidenceInput('BRAKE', {
          eventDate: '2026-04-01',
          description: 'Bremsen ok',
        }),
      );

      expect(result.planDraft.isBlocked).toBe(true);
      expect(semanticActions(result)).not.toContain(EVIDENCE_SEMANTIC_ACTIONS.CREATE_BRAKE_EVIDENCE);
    });
  });

  describe('battery evidence', () => {
    it('creates battery evidence with separate provenance markers', () => {
      const result = planDocumentActions(
        evidenceInput('BATTERY', {
          eventDate: '2026-05-01',
          scope: 'lv',
          voltageV: 12.4,
          sohPercent: 92,
        }),
      );

      expect(semanticActions(result)).toContain(EVIDENCE_SEMANTIC_ACTIONS.CREATE_BATTERY_EVIDENCE);
      expect(result.actions[0].inputPayload).toMatchObject({
        extractionProvenance: 'DOCUMENT_INTAKE_CONFIRMED',
        noHealthScoreOverwrite: true,
      });
    });
  });

  describe('workshop measurement report', () => {
    it('creates service event and domain evidence for workshop report subtype', () => {
      const result = planDocumentActions(
        evidenceInput(
          'SERVICE',
          {
            eventDate: '2026-06-01',
            workshopName: 'Werkstatt Süd',
            description: 'Bremsen + Reifen gemessen',
            frontPadMm: 7.5,
            treadDepthMm: { fl: 4.2, fr: 4.1, rl: 3.9, rr: 4.0 },
          },
          { documentSubtype: 'WORKSHOP_MEASUREMENT' },
        ),
      );

      expect(result.planDraft.snapshot.evidenceDocumentMode).toBe('WORKSHOP_MEASUREMENT');
      expect(semanticActions(result)).toContain(EVIDENCE_SEMANTIC_ACTIONS.CREATE_SERVICE_EVENT);
      expect(semanticActions(result)).toContain(EVIDENCE_SEMANTIC_ACTIONS.CREATE_BRAKE_EVIDENCE);
      expect(semanticActions(result)).toContain(EVIDENCE_SEMANTIC_ACTIONS.CREATE_TIRE_MEASUREMENT);
      const payload = result.actions[0].inputPayload as Record<string, unknown>;
      expect(payload.workshopFindingProvenance).toBe(true);
    });
  });

  describe('readiness policy', () => {
    it('blocks evidence actions when readiness policy blocks apply', () => {
      const result = planDocumentActions(
        evidenceInput(
          'TIRE',
          {
            eventDate: '2026-01-01',
            treadDepthMm: { fl: 5, fr: 5, rl: 5, rr: 5 },
          },
          {
            applySafetyDecision: {
              readinessPolicyBlocked: true,
            },
          },
        ),
      );

      expect(result.planDraft.isBlocked).toBe(true);
      expect(semanticActions(result)).not.toContain(EVIDENCE_SEMANTIC_ACTIONS.CREATE_TIRE_MEASUREMENT);
    });
  });
});
