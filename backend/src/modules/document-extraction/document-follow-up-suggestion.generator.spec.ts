import { buildDocumentActionPlan } from './document-action-plan.builder';
import { assessFinePlan } from './document-action-planner.fine-rules';
import {
  buildFollowUpSuggestions,
  isFollowUpSuggestionAcceptable,
  mergeFollowUpSuggestionsIdempotent,
} from './document-follow-up-suggestion.generator';
import { FINE_NOTICE_FOLLOW_UP_RULES } from './document-follow-up-subtype-rules';
import {
  DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES,
  DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES,
} from './document-follow-up-suggestion.types';

describe('document-follow-up-suggestion.generator', () => {
  const fineConfirmedData = {
    title: 'Parkverstoss',
    offenseDate: '2026-06-01',
    amountCents: 5500,
    acceptedEntityLinks: [{ entityType: 'vehicle', entityId: 'veh-1' }],
  };

  it('maps fine driver assignment semantic action to prepare driver contact', () => {
    const assessment = assessFinePlan({
      effectiveDocumentType: 'FINE',
      confirmedData: fineConfirmedData,
    });
    const plan = buildDocumentActionPlan({
      extractionId: 'ext-fine-1',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      documentType: 'FINE',
      confirmedData: fineConfirmedData,
      plausibilityChecks: [],
      planContext: assessment,
    });

    const suggestions = buildFollowUpSuggestions({
      extractionId: 'ext-fine-1',
      plan,
      confirmedData: fineConfirmedData,
      registryRules: FINE_NOTICE_FOLLOW_UP_RULES,
    });

    const driverSuggestion = suggestions.find(
      (row) => row.type === DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.PREPARE_DRIVER_CONTACT,
    );
    expect(driverSuggestion).toBeDefined();
    expect(
      suggestions.some(
        (row) =>
          row.generatedByRule.includes('SUGGEST_DRIVER_ASSIGNMENT') ||
          row.generatedByRule.includes('FINE_DRIVER_ASSIGNMENT'),
      ),
    ).toBe(true);
    expect(driverSuggestion?.status).toBe(DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES.SUGGESTED);
    expect(driverSuggestion?.resultingEntityId).toBeNull();
  });

  it('uses German titles for semantic follow-up actions', () => {
    const assessment = assessFinePlan({
      effectiveDocumentType: 'FINE',
      confirmedData: { ...fineConfirmedData, dueDate: '2026-08-15' },
    });
    const plan = {
      ...buildDocumentActionPlan({
        extractionId: 'ext-fine-1',
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        documentType: 'FINE',
        confirmedData: { ...fineConfirmedData, dueDate: '2026-08-15' },
        plausibilityChecks: [],
        planContext: assessment,
      }),
      metadata: {
        deadlineSuggestions: [{ label: 'Zahlungsfrist', date: '2026-08-15' }],
      },
    };

    const suggestions = buildFollowUpSuggestions({
      extractionId: 'ext-fine-1',
      plan,
      confirmedData: { ...fineConfirmedData, dueDate: '2026-08-15' },
    });

    const deadlineSuggestion = suggestions.find(
      (row) =>
        row.type === DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.REVIEW_DEADLINE &&
        row.dueDateConfirmed === true,
    );
    expect(deadlineSuggestion?.title).toBe('Zahlungsfrist');
    expect(deadlineSuggestion?.dueDateConfirmed).toBe(true);
    expect(deadlineSuggestion?.suggestedDueAt).toBe('2026-08-15');
  });

  it('marks metadata-only deadlines as not confirmed for task due date', () => {
    const assessment = assessFinePlan({
      effectiveDocumentType: 'FINE',
      confirmedData: fineConfirmedData,
    });
    const plan = {
      ...buildDocumentActionPlan({
        extractionId: 'ext-fine-1',
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        documentType: 'FINE',
        confirmedData: fineConfirmedData,
        plausibilityChecks: [],
        planContext: assessment,
      }),
      metadata: {
        deadlineSuggestions: [{ label: 'Zahlungsfrist', date: '2026-08-15' }],
      },
    };

    const suggestions = buildFollowUpSuggestions({
      extractionId: 'ext-fine-1',
      plan,
      confirmedData: fineConfirmedData,
    });

    const metadataDeadline = suggestions.find(
      (row) => row.generatedByRule === 'metadata:deadline:0',
    );
    expect(metadataDeadline?.suggestedDueAt).toBe('2026-08-15');
    expect(metadataDeadline?.dueDateConfirmed).toBe(false);
  });

  it('is idempotent by actionPlanId and generatedByRule', () => {
    const assessment = assessFinePlan({
      effectiveDocumentType: 'FINE',
      confirmedData: fineConfirmedData,
    });
    const plan = buildDocumentActionPlan({
      extractionId: 'ext-fine-1',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      documentType: 'FINE',
      confirmedData: fineConfirmedData,
      plausibilityChecks: [],
      planContext: assessment,
    });
    const first = buildFollowUpSuggestions({
      extractionId: 'ext-fine-1',
      plan,
      confirmedData: fineConfirmedData,
    });
    const second = buildFollowUpSuggestions({
      extractionId: 'ext-fine-1',
      plan,
      confirmedData: fineConfirmedData,
    });
    expect(second.map((row) => row.suggestionId)).toEqual(first.map((row) => row.suggestionId));

    const merged = mergeFollowUpSuggestionsIdempotent(
      [
        {
          ...first[0],
          status: DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES.ACCEPTED,
          acceptedByUserId: 'user-1',
          resultingEntityId: 'task-1',
        },
      ],
      second,
    );
    expect(merged.some((row) => row.status === DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES.ACCEPTED)).toBe(
      true,
    );
  });

  it('does not allow accepting informational no-follow-up suggestions', () => {
    expect(
      isFollowUpSuggestionAcceptable({
        type: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.NO_FOLLOW_UP,
        status: DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES.SUGGESTED,
      }),
    ).toBe(false);
  });
});
