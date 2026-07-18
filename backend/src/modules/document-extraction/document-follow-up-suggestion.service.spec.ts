import { BadRequestException } from '@nestjs/common';
import { DocumentFollowUpSuggestionService } from './document-follow-up-suggestion.service';
import {
  DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES,
  DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES,
} from './document-follow-up-suggestion.types';

describe('DocumentFollowUpSuggestionService', () => {
  const baseSuggestion = {
    suggestionId: 'sug-1',
    extractionId: 'ext-1',
    actionPlanId: 'plan-1',
    type: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.PREPARE_CUSTOMER_CONTACT,
    title: 'Kundenkontakt vorbereiten',
    rationale: 'Kein Kunde verknüpft.',
    suggestedDueAt: null,
    dueDateConfirmed: false,
    targetEntity: { entityType: 'customer', entityId: null, label: 'Kunde zuordnen' },
    status: DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES.SUGGESTED,
    generatedByRule: 'registry:MISSING_CUSTOMER',
    acceptedByUserId: null,
    resultingEntityId: null,
    createdAt: '2026-07-17T00:00:00.000Z',
    updatedAt: '2026-07-17T00:00:00.000Z',
  };

  function makeService() {
    const prisma = {
      vehicleDocumentExtraction: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const tasksService = {
      upsertByDedup: jest.fn().mockResolvedValue({ id: 'task-1' }),
    };
    const schemaRegistry = {
      resolveSchema: jest.fn().mockReturnValue({ followUpSuggestionRules: [] }),
    };
    const outboxEnqueue = {
      enqueueFailure: jest.fn().mockResolvedValue('outbox-1'),
    };
    const outboxContext = { fromOutbox: false };
    const service = new DocumentFollowUpSuggestionService(
      prisma as any,
      tasksService as any,
      schemaRegistry as any,
      outboxEnqueue as any,
      outboxContext as any,
    );
    return { service, prisma, tasksService, outboxEnqueue };
  }

  it('accepts suggestion by creating a prepared-only task with checklist template', async () => {
    const { service, tasksService, prisma } = makeService();
    const record = {
      id: 'ext-1',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      documentType: 'FINE',
      effectiveDocumentType: 'FINE',
      detectedDocumentSubtype: null,
      confirmedData: { entityLinks: { accepted: [] } },
      plausibility: { _pipeline: { followUpSuggestions: [baseSuggestion] } },
    };

    const result = await service.acceptSuggestion({
      record,
      suggestionId: 'sug-1',
      userId: 'user-1',
    });

    expect(tasksService.upsertByDedup).toHaveBeenCalledWith(
      'org-1',
      'document-follow-up:ext-1:sug-1',
      expect.objectContaining({
        source: 'DOCUMENT_FOLLOW_UP',
        sourceType: 'DOCUMENT',
        type: 'CUSTOMER_FOLLOWUP',
        documentId: 'ext-1',
        vehicleId: 'veh-1',
        checklist: expect.arrayContaining([
          expect.objectContaining({ title: 'Kundenkontakt herstellen' }),
        ]),
        metadata: expect.objectContaining({
          preparedOnly: true,
          noAutomaticContact: true,
          actionResultIds: expect.any(Object),
        }),
      }),
    );
    expect(result.status).toBe(DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES.ACCEPTED);
    expect(result.resultingEntityId).toBe('task-1');
    expect(prisma.vehicleDocumentExtraction.update).toHaveBeenCalled();
  });

  it('deduplicates payment review tasks via invoice payment-check key', async () => {
    const { service, tasksService } = makeService();
    const paymentSuggestion = {
      ...baseSuggestion,
      suggestionId: 'sug-pay',
      type: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.PAYMENT_REVIEW,
      title: 'Rechnung freigeben',
      generatedByRule: 'semantic:SUGGEST_PAYMENT_REVIEW',
    };
    const record = {
      id: 'ext-inv',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      documentType: 'INVOICE',
      effectiveDocumentType: 'INVOICE',
      detectedDocumentSubtype: null,
      confirmedData: {
        acceptedEntityLinks: [{ entityType: 'vendor', entityId: 'ven-1' }],
      },
      plausibility: {
        _pipeline: {
          followUpSuggestions: [paymentSuggestion],
          actionPlanExecution: {
            planId: 'plan-1',
            planVersion: 1,
            fingerprint: 'fp',
            status: 'COMPLETED',
            actions: [
              {
                actionIndex: 0,
                semanticAction: 'CREATE_INVOICE_DRAFT',
                requirement: 'REQUIRED',
                idempotencyKey: 'k1',
                status: 'SUCCEEDED',
                resultEntityId: 'inv-42',
              },
            ],
          },
        },
      },
    };

    await service.acceptSuggestion({
      record,
      suggestionId: 'sug-pay',
      userId: 'user-1',
    });

    expect(tasksService.upsertByDedup).toHaveBeenCalledWith(
      'org-1',
      'invoice:payment-check:inv-42',
      expect.objectContaining({
        invoiceId: 'inv-42',
        vendorId: 'ven-1',
        metadata: expect.objectContaining({
          actionResultIds: expect.objectContaining({ invoiceId: 'inv-42' }),
        }),
      }),
    );
  });

  it('rejects accepting informational suggestions', async () => {
    const { service } = makeService();
    const record = {
      id: 'ext-1',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      documentType: 'OTHER',
      effectiveDocumentType: 'OTHER',
      detectedDocumentSubtype: null,
      confirmedData: {},
      plausibility: {
        _pipeline: {
          followUpSuggestions: [
            {
              ...baseSuggestion,
              type: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.NO_FOLLOW_UP,
            },
          ],
        },
      },
    };

    await expect(
      service.acceptSuggestion({ record, suggestionId: 'sug-1', userId: 'user-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('dismisses an open suggestion without creating a task', async () => {
    const { service, tasksService, prisma } = makeService();
    const record = {
      id: 'ext-1',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      documentType: 'FINE',
      effectiveDocumentType: 'FINE',
      detectedDocumentSubtype: null,
      confirmedData: {},
      plausibility: { _pipeline: { followUpSuggestions: [baseSuggestion] } },
    };

    const result = await service.dismissSuggestion({
      record,
      suggestionId: 'sug-1',
      userId: 'user-1',
    });

    expect(tasksService.upsertByDedup).not.toHaveBeenCalled();
    expect(result.status).toBe(DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES.DISMISSED);
    expect(prisma.vehicleDocumentExtraction.update).toHaveBeenCalled();
  });

  it('enqueues outbox entry when task materialization fails', async () => {
    const { service, tasksService, outboxEnqueue } = makeService();
    tasksService.upsertByDedup.mockRejectedValue(new Error('db down'));
    const record = {
      id: 'ext-1',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      documentType: 'FINE',
      effectiveDocumentType: 'FINE',
      detectedDocumentSubtype: null,
      confirmedData: {},
      plausibility: { _pipeline: { followUpSuggestions: [baseSuggestion] } },
    };

    await expect(
      service.acceptSuggestion({ record, suggestionId: 'sug-1', userId: 'user-1' }),
    ).rejects.toThrow('db down');
    expect(outboxEnqueue.enqueueFailure).toHaveBeenCalled();
  });
});
