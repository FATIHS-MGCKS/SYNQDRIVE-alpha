import { resolveDocumentFollowUpActionResultIds } from './document-follow-up-action-results.util';
import { buildDocumentFollowUpTaskMaterialization } from './document-follow-up-task.materializer';
import {
  DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES,
  DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES,
  type DocumentFollowUpSuggestion,
} from './document-follow-up-suggestion.types';

describe('document-follow-up-action-results.util', () => {
  it('resolves fine and invoice IDs from action plan execution', () => {
    const plausibility = {
      _pipeline: {
        actionPlanExecution: {
          planId: 'plan-1',
          planVersion: 1,
          fingerprint: 'fp',
          status: 'COMPLETED',
          actions: [
            {
              actionIndex: 0,
              semanticAction: 'CREATE_FINE_DRAFT',
              requirement: 'REQUIRED',
              idempotencyKey: 'k1',
              status: 'SUCCEEDED',
              resultEntityId: 'fine-1',
            },
            {
              actionIndex: 1,
              semanticAction: 'CREATE_INVOICE_DRAFT',
              requirement: 'REQUIRED',
              idempotencyKey: 'k2',
              status: 'SUCCEEDED',
              resultEntityId: 'inv-1',
            },
          ],
        },
      },
    };

    expect(resolveDocumentFollowUpActionResultIds(plausibility)).toEqual({
      fineId: 'fine-1',
      invoiceId: 'inv-1',
      damageId: null,
      serviceEventId: null,
      tireMeasurementId: null,
    });
  });
});

describe('document-follow-up-task.materializer', () => {
  const baseSuggestion: DocumentFollowUpSuggestion = {
    suggestionId: 'sug-pay',
    extractionId: 'ext-1',
    actionPlanId: 'plan-1',
    type: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.PAYMENT_REVIEW,
    title: 'Rechnung freigeben',
    rationale: 'Zahlung prüfen.',
    suggestedDueAt: null,
    dueDateConfirmed: false,
    targetEntity: null,
    status: DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES.SUGGESTED,
    generatedByRule: 'semantic:SUGGEST_PAYMENT_REVIEW',
    acceptedByUserId: null,
    resultingEntityId: null,
    createdAt: '2026-07-17T00:00:00.000Z',
    updatedAt: '2026-07-17T00:00:00.000Z',
  };

  it('uses invoice payment dedup key and links when invoice apply result exists', () => {
    const materialization = buildDocumentFollowUpTaskMaterialization({
      extractionId: 'ext-1',
      vehicleId: 'veh-1',
      confirmedData: {
        acceptedEntityLinks: [
          { entityType: 'vehicle', entityId: 'veh-1' },
          { entityType: 'booking', entityId: 'book-1' },
        ],
      },
      suggestion: baseSuggestion,
      userId: 'user-1',
      actionResults: {
        fineId: null,
        invoiceId: 'inv-1',
        damageId: null,
        serviceEventId: null,
        tireMeasurementId: null,
      },
    });

    expect(materialization.dedupKey).toBe('invoice:payment-check:inv-1');
    expect(materialization.links.invoiceId).toBe('inv-1');
    expect(materialization.links.bookingId).toBe('book-1');
    expect(materialization.checklist.length).toBe(0);
    expect(materialization.metadata).toEqual(
      expect.objectContaining({
        actionResultIds: expect.objectContaining({ invoiceId: 'inv-1' }),
        automation: expect.anything(),
      }),
    );
  });

  it('sets due date only when deadline was user-confirmed', () => {
    const withConfirmed = buildDocumentFollowUpTaskMaterialization({
      extractionId: 'ext-fine',
      vehicleId: 'veh-1',
      confirmedData: { dueDate: '2026-08-01' },
      suggestion: {
        ...baseSuggestion,
        type: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.REVIEW_DEADLINE,
        title: 'Bußgeldfrist prüfen',
        suggestedDueAt: '2026-08-01',
        dueDateConfirmed: true,
      },
      userId: 'user-1',
      actionResults: {
        fineId: 'fine-1',
        invoiceId: null,
        damageId: null,
        serviceEventId: null,
        tireMeasurementId: null,
      },
    });

    const withDetectedOnly = buildDocumentFollowUpTaskMaterialization({
      extractionId: 'ext-fine',
      vehicleId: 'veh-1',
      confirmedData: {},
      suggestion: {
        ...baseSuggestion,
        type: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.REVIEW_DEADLINE,
        title: 'Bußgeldfrist prüfen',
        suggestedDueAt: '2026-08-01',
        dueDateConfirmed: false,
      },
      userId: 'user-1',
      actionResults: {
        fineId: 'fine-1',
        invoiceId: null,
        damageId: null,
        serviceEventId: null,
        tireMeasurementId: null,
      },
    });

    expect(withConfirmed.dedupKey).toBe('document-extraction:fine:ext-fine');
    expect(withConfirmed.dueDate).toEqual(new Date('2026-08-01'));
    expect(withConfirmed.links.fineId).toBe('fine-1');
    expect(withDetectedOnly.dueDate).toBeNull();
  });

  it('seeds VEHICLE_INSPECTION checklist template', () => {
    const materialization = buildDocumentFollowUpTaskMaterialization({
      extractionId: 'ext-insp',
      vehicleId: 'veh-1',
      confirmedData: {},
      suggestion: {
        ...baseSuggestion,
        type: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.VEHICLE_INSPECTION,
        title: 'Fahrzeug prüfen',
      },
      userId: 'user-1',
      actionResults: {
        fineId: null,
        invoiceId: null,
        damageId: null,
        serviceEventId: null,
        tireMeasurementId: null,
      },
    });

    expect(materialization.type).toBe('VEHICLE_INSPECTION');
    expect(materialization.checklist.map((item) => item.title)).toContain('Termin buchen');
  });
});
