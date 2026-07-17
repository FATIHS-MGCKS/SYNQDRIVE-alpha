import { ARCHIVE_EMPTY, ARCHIVE_SUBTYPE_FIXTURES } from './__fixtures__/document-archive-fixtures';
import {
  ARCHIVE_PLAN_OUTCOMES,
  ARCHIVE_SEMANTIC_ACTIONS,
  assessArchivePlan,
  buildArchivePlannerSummary,
  isArchiveDocumentProfile,
  isArchiveSubtypeSupported,
} from './document-action-planner.archive-rules';

function semanticActions(plan: ReturnType<typeof assessArchivePlan>): string[] {
  return plan.actions.map((action) => action.semanticAction);
}

describe('document-action-planner.archive-rules', () => {
  describe.each(Object.entries(ARCHIVE_SUBTYPE_FIXTURES))(
    'subtype %s',
    (subtype, fixture) => {
      it('plans archive-only without domain apply', () => {
        const plan = assessArchivePlan({
          effectiveDocumentType: 'OTHER',
          confirmedData: fixture,
        });
        expect(plan.archiveSubtype).toBe(subtype);
        expect(plan.planOutcome).toBe(ARCHIVE_PLAN_OUTCOMES.ARCHIVE_ONLY);
        expect(semanticActions(plan)).toContain(ARCHIVE_SEMANTIC_ACTIONS.ARCHIVE_DOCUMENT);
        expect(semanticActions(plan)).not.toContain('CREATE_DAMAGE_RECORD');
        expect(semanticActions(plan)).not.toContain('APPLY_TIRE_MEASUREMENT');
      });

      it('never schedules automatic outreach', () => {
        const plan = assessArchivePlan({
          effectiveDocumentType: 'OTHER',
          confirmedData: fixture,
        });
        expect(semanticActions(plan)).toContain(ARCHIVE_SEMANTIC_ACTIONS.NO_AUTOMATIC_OUTREACH);
        expect(semanticActions(plan)).not.toContain('CONTACT_SENDER');
        expect(semanticActions(plan)).not.toContain('SEND_EMAIL');
      });
    },
  );

  it('recognizes OTHER and VEHICLE_CONDITION profiles', () => {
    expect(
      isArchiveDocumentProfile({
        effectiveDocumentType: 'OTHER',
        confirmedData: {},
      }),
    ).toBe(true);
    expect(
      isArchiveDocumentProfile({
        effectiveDocumentType: 'VEHICLE_CONDITION',
        confirmedData: {},
      }),
    ).toBe(true);
    expect(
      isArchiveDocumentProfile({
        effectiveDocumentType: 'INVOICE',
        confirmedData: {},
      }),
    ).toBe(false);
  });

  it('suggests entity links and deadlines optionally', () => {
    const plan = assessArchivePlan({
      effectiveDocumentType: 'OTHER',
      confirmedData: ARCHIVE_SUBTYPE_FIXTURES.INSURANCE_LETTER,
    });
    expect(semanticActions(plan)).toContain(ARCHIVE_SEMANTIC_ACTIONS.SUGGEST_ENTITY_LINK);
    expect(semanticActions(plan)).toContain(ARCHIVE_SEMANTIC_ACTIONS.SUGGEST_DEADLINE_REMINDER);
    expect(plan.deadlineSuggestions.every((row) => row.suggestionOnly)).toBe(true);
  });

  it('blocks plan when archive metadata is missing', () => {
    const plan = assessArchivePlan({
      effectiveDocumentType: 'OTHER',
      confirmedData: ARCHIVE_EMPTY,
    });
    expect(plan.planOutcome).toBe(ARCHIVE_PLAN_OUTCOMES.BLOCKED);
    expect(semanticActions(plan)).not.toContain(ARCHIVE_SEMANTIC_ACTIONS.ARCHIVE_DOCUMENT);
    expect(buildArchivePlannerSummary(plan)).toMatch(/blocked/i);
  });

  it('validates supported archive subtypes', () => {
    expect(isArchiveSubtypeSupported('AUTHORITY_LETTER')).toBe(true);
    expect(isArchiveSubtypeSupported('NOT_A_REAL_SUBTYPE')).toBe(false);
  });
});
