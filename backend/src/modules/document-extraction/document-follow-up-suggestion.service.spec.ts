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
    const service = new DocumentFollowUpSuggestionService(
      prisma as any,
      tasksService as any,
      schemaRegistry as any,
    );
    return { service, prisma, tasksService };
  }

  it('accepts suggestion by creating a prepared-only task without sending contact', async () => {
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
        metadata: expect.objectContaining({
          preparedOnly: true,
          noAutomaticContact: true,
        }),
      }),
    );
    expect(result.status).toBe(DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES.ACCEPTED);
    expect(result.resultingEntityId).toBe('task-1');
    expect(prisma.vehicleDocumentExtraction.update).toHaveBeenCalled();
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
});
