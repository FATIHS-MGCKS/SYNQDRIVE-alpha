import { planDocumentActions } from './document-action-planner.engine';
import {
  assessFineDraftRequirements,
  FINE_DOCUMENT_MODES,
  FINE_SEMANTIC_ACTIONS,
  hasOffenseDate,
  hasOffenseTime,
  resolveFineDocumentMode,
} from './document-action-planner.fine-rules';
import { buildPlannerTestInput } from './document-action-planner.test-fixtures';

function fineInput(
  confirmedData: Record<string, unknown>,
  overrides: Parameters<typeof buildPlannerTestInput>[0] = {},
) {
  return buildPlannerTestInput({
    effectiveDocumentType: 'FINE',
    documentCategory: 'FINANCE',
    documentSubtype: 'PARKING_FINE',
    entityLinks: [
      { role: 'PRIMARY_VEHICLE', entityType: 'VEHICLE', entityId: 'veh-1' },
    ],
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

const completeFineData = {
  eventDate: '2026-03-15',
  eventTime: '14:35',
  totalCents: 3500,
  issuingAuthority: 'Stadt Frankfurt',
  reportNumber: 'AZ-2026-7788',
  offenseType: 'Parkverstoß',
  dueDate: '2026-04-15',
};

describe('document-action-planner.fine-rules', () => {
  describe('complete fine notice', () => {
    it('creates fine draft with confirmed vehicle and no default offense injection', () => {
      const result = planDocumentActions(
        fineInput({
          ...completeFineData,
          offenseType: undefined,
        }),
      );

      expect(result.planDraft.isBlocked).toBe(false);
      expect(result.planDraft.snapshot.planningMode).toBe('FINE');
      expect(semanticActions(result)).toContain(FINE_SEMANTIC_ACTIONS.CREATE_FINE_DRAFT);
      const draft = result.actions.find((action) => action.actionType === 'CREATE_FINE');
      expect(draft?.inputPayload).toMatchObject({
        semanticAction: FINE_SEMANTIC_ACTIONS.CREATE_FINE_DRAFT,
        offenseType: null,
        totalCents: 3500,
      });
      expect(result.followUpCandidateTypes).not.toContain('NOTIFY_DRIVER');
      expect(result.followUpCandidateTypes).not.toContain('REQUEST_CUSTOMER_INFO');
    });

    it('suggests deadline task when due date is present', () => {
      const result = planDocumentActions(fineInput(completeFineData));
      expect(semanticActions(result)).toContain(FINE_SEMANTIC_ACTIONS.SUGGEST_DEADLINE_TASK);
    });
  });

  describe('incomplete fine notice', () => {
    it('blocks fine draft when event date is missing', () => {
      const result = planDocumentActions(
        fineInput({
          totalCents: 2500,
          issuingAuthority: 'Ordnungsamt',
          reportNumber: 'X-1',
        }),
      );

      expect(result.planDraft.isBlocked).toBe(true);
      expect(semanticActions(result)).not.toContain(FINE_SEMANTIC_ACTIONS.CREATE_FINE_DRAFT);
      expect(result.missingRequirements.some((m) => m.code === 'MISSING_FINE_DRAFT_FIELDS')).toBe(
        true,
      );
    });

    it('blocks fine draft for zero amount', () => {
      const result = planDocumentActions(
        fineInput({
          ...completeFineData,
          totalCents: 0,
        }),
      );

      expect(result.planDraft.isBlocked).toBe(true);
      expect(result.missingRequirements.some((m) => m.code === 'FINE_AMOUNT_NON_POSITIVE')).toBe(
        true,
      );
    });

    it('blocks fine draft without confirmed vehicle link', () => {
      const result = planDocumentActions(
        fineInput(completeFineData, {
          entityLinks: [],
        }),
      );

      expect(result.missingRequirements.some((m) => m.code === 'MISSING_CONFIRMED_VEHICLE_LINK')).toBe(
        true,
      );
      expect(semanticActions(result)).not.toContain(FINE_SEMANTIC_ACTIONS.CREATE_FINE_DRAFT);
    });

    it('blocks fine draft without authority or reference', () => {
      const assessment = assessFineDraftRequirements(
        fineInput({
          offenseDateTime: '2026-03-01T10:00:00',
          amountCents: 1000,
        }),
      );
      expect(assessment.canCreateFineDraft).toBe(false);
      expect(assessment.missingRequirements.some((m) => m.fieldKeys?.includes('issuingAuthority'))).toBe(
        true,
      );
      expect(assessment.missingRequirements.some((m) => m.fieldKeys?.includes('referenceNumber'))).toBe(
        true,
      );
    });
  });

  describe('attribution rules', () => {
    it('blocks booking and driver link suggestions without offense time', () => {
      const input = fineInput(
        {
          ...completeFineData,
          eventTime: undefined,
          eventDate: '2026-03-15',
        },
        {
          entityCandidates: [
            { entityType: 'BOOKING', entityId: 'book-1', confidence: 0.9, status: 'PROPOSED' },
            { entityType: 'DRIVER', entityId: 'driver-1', confidence: 0.88, status: 'PROPOSED' },
          ],
        },
      );

      expect(hasOffenseTime(input.confirmedData)).toBe(false);
      const result = planDocumentActions(input);

      expect(semanticActions(result)).not.toContain(FINE_SEMANTIC_ACTIONS.LINK_BOOKING);
      expect(semanticActions(result)).not.toContain(FINE_SEMANTIC_ACTIONS.LINK_DRIVER);
    });

    it('does not auto-assign driver when multiple driver candidates exist', () => {
      const result = planDocumentActions(
        fineInput(completeFineData, {
          entityCandidates: [
            { entityType: 'DRIVER', entityId: 'driver-1', confidence: 0.91, status: 'PROPOSED' },
            { entityType: 'DRIVER', entityId: 'driver-2', confidence: 0.89, status: 'PROPOSED' },
          ],
        }),
      );

      expect(semanticActions(result)).not.toContain(FINE_SEMANTIC_ACTIONS.LINK_DRIVER);
    });

    it('does not treat customer link as driver link', () => {
      const result = planDocumentActions(
        fineInput(completeFineData, {
          entityLinks: [
            { role: 'PRIMARY_VEHICLE', entityType: 'VEHICLE', entityId: 'veh-1' },
            { role: 'CUSTOMER', entityType: 'CUSTOMER', entityId: 'cust-1' },
          ],
          entityCandidates: [
            { entityType: 'CUSTOMER', entityId: 'cust-1', confidence: 0.95, status: 'PROPOSED' },
            { entityType: 'DRIVER', entityId: 'driver-9', confidence: 0.8, status: 'PROPOSED' },
          ],
        }),
      );

      expect(semanticActions(result)).not.toContain(FINE_SEMANTIC_ACTIONS.LINK_CUSTOMER);
      expect(semanticActions(result)).toContain(FINE_SEMANTIC_ACTIONS.LINK_DRIVER);
    });

    it('suggests customer contact only as optional suggestion', () => {
      const result = planDocumentActions(
        fineInput(completeFineData, {
          entityCandidates: [
            { entityType: 'CUSTOMER', entityId: 'cust-2', confidence: 0.75, status: 'PROPOSED' },
          ],
        }),
      );

      const contact = result.actions.find(
        (action) =>
          (action.previewPayload as Record<string, unknown>)?.semanticAction ===
          FINE_SEMANTIC_ACTIONS.SUGGEST_CUSTOMER_CONTACT,
      );
      expect(contact?.requirement).toBe('OPTIONAL');
      expect((contact?.inputPayload as Record<string, unknown>).noAutomaticContact).toBe(true);
    });
  });

  describe('hearing form (Anhörungsbogen)', () => {
    it('does not create fine draft and requires driver review', () => {
      const result = planDocumentActions(
        fineInput(completeFineData, {
          documentSubtype: 'HEARING_FORM',
        }),
      );

      expect(result.planDraft.snapshot.fineDocumentMode).toBe(FINE_DOCUMENT_MODES.HEARING_FORM);
      expect(semanticActions(result)).not.toContain(FINE_SEMANTIC_ACTIONS.CREATE_FINE_DRAFT);
      expect(semanticActions(result)).toContain(FINE_SEMANTIC_ACTIONS.SUGGEST_DRIVER_REVIEW);
    });
  });

  describe('driver inquiry (Fahrerermittlung)', () => {
    it('suggests driver review without fine draft', () => {
      const result = planDocumentActions(
        fineInput(
          {
            eventDate: '2026-03-01',
            description: 'Wer ist gefahren?',
          },
          {
            documentSubtype: 'DRIVER_INQUIRY',
            entityLinks: [{ role: 'PRIMARY_VEHICLE', entityType: 'VEHICLE', entityId: 'veh-1' }],
          },
        ),
      );

      expect(result.planDraft.snapshot.fineDocumentMode).toBe(FINE_DOCUMENT_MODES.DRIVER_INQUIRY);
      expect(semanticActions(result)).not.toContain(FINE_SEMANTIC_ACTIONS.CREATE_FINE_DRAFT);
      expect(semanticActions(result)).toContain(FINE_SEMANTIC_ACTIONS.SUGGEST_DRIVER_REVIEW);
    });
  });

  describe('helpers', () => {
    it('detects offense time from eventTime and eventDateTime', () => {
      expect(hasOffenseTime({ eventTime: '08:15' })).toBe(true);
      expect(hasOffenseTime({ eventDateTime: '2026-03-01T16:45:00' })).toBe(true);
      expect(hasOffenseTime({ eventDate: '2026-03-01' })).toBe(false);
    });
  });
});
