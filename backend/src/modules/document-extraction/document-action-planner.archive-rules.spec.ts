import { planDocumentActions } from './document-action-planner.engine';
import {
  ARCHIVE_ONLY_DOCUMENT_SUBTYPES,
  ARCHIVE_ONLY_SEMANTIC_ACTIONS,
  isArchiveOnlyDocumentProfile,
  isKnownArchiveOnlySubtype,
} from './document-action-planner.archive-rules';
import { buildPlannerTestInput } from './document-action-planner.test-fixtures';

function archiveInput(
  subtype: string,
  overrides: Parameters<typeof buildPlannerTestInput>[0] = {},
) {
  return buildPlannerTestInput({
    documentCategory: 'GENERAL',
    documentSubtype: subtype,
    effectiveDocumentType: 'OTHER',
    confirmedData: { description: `Test document for ${subtype}` },
    entityLinks: [],
    entityCandidates: [],
    ...overrides,
  });
}

function semanticActions(result: ReturnType<typeof planDocumentActions>): string[] {
  return result.actions
    .map((action) => (action.previewPayload as Record<string, unknown>)?.semanticAction)
    .filter((value): value is string => typeof value === 'string');
}

function downstreamCreateActions(result: ReturnType<typeof planDocumentActions>): string[] {
  return result.actions
    .map((action) => action.actionType)
    .filter((type) =>
      [
        'CREATE_SERVICE_EVENT',
        'CREATE_INVOICE',
        'CREATE_FINE',
        'CREATE_DAMAGE',
        'UPDATE_VEHICLE_INSPECTION',
        'RECORD_TIRE_MEASUREMENT',
        'RECORD_BRAKE_EVIDENCE',
        'RECORD_BATTERY_EVIDENCE',
      ].includes(type),
    );
}

describe('document-action-planner.archive-rules', () => {
  describe('profile detection', () => {
    it('recognizes known archive-only subtypes', () => {
      for (const subtype of Object.values(ARCHIVE_ONLY_DOCUMENT_SUBTYPES)) {
        expect(isKnownArchiveOnlySubtype(subtype)).toBe(true);
      }
    });

    it('does not treat invoice type as archive-only without archive subtype', () => {
      const input = buildPlannerTestInput({
        effectiveDocumentType: 'INVOICE',
        documentCategory: 'FINANCE',
        documentSubtype: 'STANDARD',
      });
      expect(isArchiveOnlyDocumentProfile(input)).toBe(false);
    });

    it('routes payment proof on INVOICE to finance planner instead of archive-only', () => {
      const input = buildPlannerTestInput({
        effectiveDocumentType: 'INVOICE',
        documentCategory: 'FINANCE',
        documentSubtype: ARCHIVE_ONLY_DOCUMENT_SUBTYPES.PAYMENT_PROOF,
      });
      expect(isArchiveOnlyDocumentProfile(input)).toBe(false);
    });
  });

  describe.each([
    ['GENERAL_LETTER', ARCHIVE_ONLY_DOCUMENT_SUBTYPES.GENERAL_LETTER],
    ['CUSTOMER_CORRESPONDENCE', ARCHIVE_ONLY_DOCUMENT_SUBTYPES.CUSTOMER_CORRESPONDENCE],
    ['DRIVER_DOCUMENT', ARCHIVE_ONLY_DOCUMENT_SUBTYPES.DRIVER_DOCUMENT],
    ['INSURANCE_NOTICE', ARCHIVE_ONLY_DOCUMENT_SUBTYPES.INSURANCE_NOTICE],
    ['PAYMENT_PROOF', ARCHIVE_ONLY_DOCUMENT_SUBTYPES.PAYMENT_PROOF],
    ['GENERAL_PROOF', ARCHIVE_ONLY_DOCUMENT_SUBTYPES.GENERAL_PROOF],
    ['UNKNOWN_DOCUMENT_TYPE', ARCHIVE_ONLY_DOCUMENT_SUBTYPES.UNKNOWN_DOCUMENT_TYPE],
  ] as const)('category %s', (_label, subtype) => {
    it('plans archive document as valid success without downstream writes', () => {
      const result = planDocumentActions(archiveInput(subtype));

      expect(result.planDraft.isBlocked).toBe(false);
      expect(result.planDraft.snapshot.planningMode).toBe('ARCHIVE_ONLY');
      expect(result.planDraft.snapshot.noDownstreamApply).toBe(true);
      expect(downstreamCreateActions(result)).toHaveLength(0);
      expect(semanticActions(result)).toContain(ARCHIVE_ONLY_SEMANTIC_ACTIONS.ARCHIVE_DOCUMENT);
    });

    it('does not schedule automatic contact follow-ups', () => {
      const result = planDocumentActions(archiveInput(subtype));
      expect(result.followUpCandidateTypes).not.toContain('NOTIFY_DRIVER');
      expect(result.followUpCandidateTypes).not.toContain('REQUEST_CUSTOMER_INFO');
    });
  });

  it('suggests owner review for unknown document type', () => {
    const result = planDocumentActions(
      archiveInput(ARCHIVE_ONLY_DOCUMENT_SUBTYPES.UNKNOWN_DOCUMENT_TYPE, {
        effectiveDocumentType: null,
        documentCategory: 'GENERAL',
      }),
    );

    expect(semanticActions(result)).toContain(ARCHIVE_ONLY_SEMANTIC_ACTIONS.SUGGEST_OWNER_REVIEW);
    expect(result.followUpCandidateTypes).toContain('MANUAL_REVIEW');
    expect(result.followUpCandidateTypes).toContain('CREATE_TASK');
  });

  it('suggests link actions only for unconfirmed candidates', () => {
    const result = planDocumentActions(
      archiveInput(ARCHIVE_ONLY_DOCUMENT_SUBTYPES.CUSTOMER_CORRESPONDENCE, {
        entityCandidates: [
          {
            entityType: 'CUSTOMER',
            entityId: 'cust-1',
            confidence: 0.91,
            status: 'PROPOSED',
          },
          {
            entityType: 'VEHICLE',
            entityId: 'veh-9',
            confidence: 0.88,
            status: 'PROPOSED',
          },
        ],
      }),
    );

    expect(semanticActions(result)).toEqual(
      expect.arrayContaining([
        ARCHIVE_ONLY_SEMANTIC_ACTIONS.ARCHIVE_DOCUMENT,
        ARCHIVE_ONLY_SEMANTIC_ACTIONS.LINK_CUSTOMER,
        ARCHIVE_ONLY_SEMANTIC_ACTIONS.LINK_VEHICLE,
      ]),
    );

    const linkActions = result.actions.filter(
      (action) =>
        (action.previewPayload as Record<string, unknown>)?.semanticAction
          ?.toString()
          .startsWith('LINK_'),
    );
    expect(linkActions.every((action) => action.targetEntityId == null)).toBe(true);
    expect(
      linkActions.every(
        (action) => (action.inputPayload as Record<string, unknown>).requiresConfirmation === true,
      ),
    ).toBe(true);
  });

  it('does not suggest link actions when entity is already confirmed', () => {
    const result = planDocumentActions(
      archiveInput(ARCHIVE_ONLY_DOCUMENT_SUBTYPES.DRIVER_DOCUMENT, {
        entityLinks: [
          { role: 'PRIMARY_DRIVER', entityType: 'DRIVER', entityId: 'driver-1' },
        ],
        entityCandidates: [
          {
            entityType: 'DRIVER',
            entityId: 'driver-1',
            confidence: 0.95,
            status: 'PROPOSED',
          },
        ],
      }),
    );

    expect(semanticActions(result)).not.toContain(ARCHIVE_ONLY_SEMANTIC_ACTIONS.LINK_DRIVER);
  });

  it('remains unblocked when plausibility is BLOCKER on archive-only profile', () => {
    const result = planDocumentActions(
      archiveInput(ARCHIVE_ONLY_DOCUMENT_SUBTYPES.GENERAL_LETTER, {
        plausibility: {
          overallStatus: 'BLOCKER',
          checks: [
            {
              code: 'PLATE_MISMATCH',
              status: 'BLOCKER',
              message: 'Plate mismatch',
              source: 'DOCUMENT',
            },
          ],
          recommendedHumanReviewNotes: [],
        },
      }),
    );

    expect(result.planDraft.isBlocked).toBe(false);
    expect(result.blockingReasons).toHaveLength(0);
    expect(semanticActions(result)).toContain(ARCHIVE_ONLY_SEMANTIC_ACTIONS.ARCHIVE_DOCUMENT);
  });

  it('keeps unclear type visible in snapshot', () => {
    const result = planDocumentActions(
      archiveInput(ARCHIVE_ONLY_DOCUMENT_SUBTYPES.UNKNOWN_DOCUMENT_TYPE, {
        effectiveDocumentType: null,
      }),
    );

    expect(result.planDraft.snapshot.archiveOnlyProfile).toBe(
      ARCHIVE_ONLY_DOCUMENT_SUBTYPES.UNKNOWN_DOCUMENT_TYPE,
    );
    expect(result.planDraft.effectiveDocumentType).toBeNull();
  });
});
