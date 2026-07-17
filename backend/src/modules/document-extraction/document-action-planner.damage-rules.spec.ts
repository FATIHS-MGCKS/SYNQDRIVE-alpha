import {
  ACCIDENT_COMPLETE,
  ACCIDENT_DRAFT_ONLY,
  APPRAISAL_GUTACHTEN,
  DAMAGE_COMPLETE,
  DAMAGE_INCOMPLETE,
  DAMAGE_UNKNOWN_TYPE,
} from './__fixtures__/document-damage-fixtures';
import {
  assessDamagePlan,
  buildDamagePlannerSummary,
  DAMAGE_PLAN_OUTCOMES,
  DAMAGE_SEMANTIC_ACTIONS,
  isDamageDocumentProfile,
} from './document-action-planner.damage-rules';

const EXISTING_DAMAGE = {
  id: 'damage-existing-1',
  damageType: 'DENT',
  severity: 'MAJOR',
  description: 'Heckschaden',
  locationLabel: 'rear_bumper, tailgate',
  createdAt: new Date('2026-01-06T00:00:00.000Z'),
};

function damageInput(
  confirmedData: Record<string, unknown>,
  overrides: Partial<Parameters<typeof assessDamagePlan>[0]> = {},
) {
  return {
    effectiveDocumentType: 'DAMAGE',
    confirmedData,
    ...overrides,
  };
}

function semanticActions(result: ReturnType<typeof assessDamagePlan>): string[] {
  return result.actions.map((action) => action.semanticAction);
}

describe('document-action-planner.damage-rules', () => {
  it('recognizes DAMAGE and ACCIDENT profiles', () => {
    expect(isDamageDocumentProfile(damageInput({}))).toBe(true);
    expect(
      isDamageDocumentProfile({
        effectiveDocumentType: 'ACCIDENT',
        confirmedData: {},
      }),
    ).toBe(true);
    expect(
      isDamageDocumentProfile({
        effectiveDocumentType: 'SERVICE',
        confirmedData: {},
      }),
    ).toBe(false);
  });

  describe('damage report', () => {
    it('is READY for complete confirmed damage report', () => {
      const plan = assessDamagePlan(damageInput(DAMAGE_COMPLETE));
      expect(plan.planOutcome).toBe(DAMAGE_PLAN_OUTCOMES.READY);
      expect(semanticActions(plan)).toContain(DAMAGE_SEMANTIC_ACTIONS.CREATE_DAMAGE_RECORD);
      expect(semanticActions(plan)).toContain(DAMAGE_SEMANTIC_ACTIONS.CREATE_DAMAGE_DRAFT);
    });

    it('enters DRAFT_ONLY when type/severity remain unknown', () => {
      const plan = assessDamagePlan(damageInput(DAMAGE_UNKNOWN_TYPE));
      expect(plan.planOutcome).toBe(DAMAGE_PLAN_OUTCOMES.DRAFT_ONLY);
      expect(semanticActions(plan)).not.toContain(DAMAGE_SEMANTIC_ACTIONS.CREATE_DAMAGE_RECORD);
      expect(plan.missingRequirements.some((req) => req.code === 'DAMAGE_TYPE_NOT_CONFIRMED')).toBe(
        true,
      );
    });

    it('blocks when damage area is not traceable', () => {
      const plan = assessDamagePlan(
        damageInput({ damageDescription: 'Unklarer Schaden ohne Bereich' }),
      );
      expect(plan.planOutcome).toBe(DAMAGE_PLAN_OUTCOMES.BLOCKED);
    });
  });

  describe('accident report', () => {
    it('stays DRAFT_ONLY until accident apply is explicitly confirmed', () => {
      const plan = assessDamagePlan({
        effectiveDocumentType: 'ACCIDENT',
        confirmedData: ACCIDENT_DRAFT_ONLY,
      });
      expect(plan.planOutcome).toBe(DAMAGE_PLAN_OUTCOMES.DRAFT_ONLY);
      expect(semanticActions(plan)).not.toContain(DAMAGE_SEMANTIC_ACTIONS.CREATE_DAMAGE_RECORD);
      expect(semanticActions(plan)).toContain(DAMAGE_SEMANTIC_ACTIONS.SUGGEST_VEHICLE_INSPECTION);
    });

    it('is READY after explicit accident confirmation', () => {
      const plan = assessDamagePlan({
        effectiveDocumentType: 'ACCIDENT',
        confirmedData: ACCIDENT_COMPLETE,
      });
      expect(plan.planOutcome).toBe(DAMAGE_PLAN_OUTCOMES.READY);
      expect(semanticActions(plan)).toContain(DAMAGE_SEMANTIC_ACTIONS.CREATE_DAMAGE_RECORD);
      expect(semanticActions(plan)).toContain(
        DAMAGE_SEMANTIC_ACTIONS.SUGGEST_INSURANCE_NOTIFICATION,
      );
    });
  });

  describe('appraisal / gutachten', () => {
    it('links existing damage candidate and blocks duplicate create', () => {
      const plan = assessDamagePlan(
        damageInput(APPRAISAL_GUTACHTEN, { existingDamages: [EXISTING_DAMAGE] }),
      );
      expect(plan.linkCandidateId).toBe('damage-existing-1');
      expect(semanticActions(plan)).toContain(DAMAGE_SEMANTIC_ACTIONS.LINK_EXISTING_DAMAGE);
      expect(semanticActions(plan)).not.toContain(DAMAGE_SEMANTIC_ACTIONS.CREATE_DAMAGE_RECORD);
      expect(plan.planOutcome).toBe(DAMAGE_PLAN_OUTCOMES.DRAFT_ONLY);
    });
  });

  describe('duplicate protection', () => {
    it('blocks when a matching damage case already exists', () => {
      const plan = assessDamagePlan(
        damageInput(ACCIDENT_COMPLETE, { duplicateDamageId: EXISTING_DAMAGE.id }),
      );
      expect(plan.planOutcome).toBe(DAMAGE_PLAN_OUTCOMES.BLOCKED);
      expect(buildDamagePlannerSummary(plan)).toContain('blocked');
    });
  });

  describe('incomplete payload', () => {
    it('surfaces missing requirements for incomplete damage', () => {
      const plan = assessDamagePlan(damageInput(DAMAGE_INCOMPLETE));
      expect(plan.missingRequirements.length).toBeGreaterThan(0);
      expect(plan.planOutcome).not.toBe(DAMAGE_PLAN_OUTCOMES.READY);
    });
  });
});
