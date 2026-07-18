import { INSURANCE_LETTER } from '../__fixtures__/document-archive-fixtures';
import { LinkEntityDocumentActionExecutor } from './link-entity-document-action.executor';
import {
  DOCUMENT_ACTION_EXECUTION_STATUSES,
  DOCUMENT_ACTION_REQUIREMENTS,
} from '../document-action.types';
import type { DocumentActionPlan } from '../document-action-plan.types';
import { DocumentActionBusinessError } from '../document-action.errors';

function buildContext(
  confirmedData: Record<string, unknown>,
  metadata?: Record<string, unknown>,
) {
  const plan: DocumentActionPlan = {
    planId: 'plan-1',
    planVersion: 1,
    fingerprint: 'fp-1',
    status: 'CONFIRMED',
    extractionId: 'ext-1',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    documentType: 'OTHER',
    planOutcome: 'ARCHIVE_ONLY',
    actions: [
      {
        semanticAction: 'SUGGEST_ENTITY_LINK',
        requirement: DOCUMENT_ACTION_REQUIREMENTS.OPTIONAL,
        sequence: 2,
      },
    ],
    confirmedAt: new Date().toISOString(),
    metadata,
  };

  return {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    extractionId: 'ext-1',
    documentType: 'OTHER',
    confirmedData,
    sourceFileUrl: null,
    plan,
    action: plan.actions[0],
    actionIndex: 1,
    idempotencyKey: 'ext-1:v1:fp-1:a2:SUGGEST_ENTITY_LINK',
  };
}

describe('LinkEntityDocumentActionExecutor', () => {
  const executor = new LinkEntityDocumentActionExecutor();

  it('returns suggestion-only result when no accepted links are provided', async () => {
    const result = await executor.execute(buildContext(INSURANCE_LETTER));

    expect(result.status).toBe(DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED);
    expect(result.output?.suggestionOnly).toBe(true);
    expect(Array.isArray(result.output?.suggestions)).toBe(true);
    expect((result.output?.suggestions as unknown[]).length).toBeGreaterThan(0);
  });

  it('persists accepted entity links when provided', async () => {
    const result = await executor.execute(
      buildContext({
        ...INSURANCE_LETTER,
        acceptedEntityLinks: [
          {
            entityType: 'damage',
            entityId: 'damage-1',
            label: 'Heckschaden BK-2026-0099',
          },
        ],
      }),
    );

    expect(result.status).toBe(DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED);
    expect(result.output?.suggestionOnly).toBe(false);
    expect(result.resultEntityId).toBe('damage-1');
    expect(result.output?.links).toEqual([
      {
        entityType: 'damage',
        entityId: 'damage-1',
        label: 'Heckschaden BK-2026-0099',
      },
    ]);
  });

  it('rejects unsupported accepted links', async () => {
    await expect(
      executor.execute(
        buildContext({
          ...INSURANCE_LETTER,
          acceptedEntityLinks: [{ entityType: 'invoice', entityId: 'inv-unknown', label: 'X' }],
        }),
      ),
    ).rejects.toBeInstanceOf(DocumentActionBusinessError);
  });

  it('skips when there are no suggestions', async () => {
    const result = await executor.execute(
      buildContext(
        {
          archiveSubtype: 'UNKNOWN',
          summary: 'Minimal ohne Entities',
        },
        { entityLinkSuggestions: [] },
      ),
    );

    expect(result.status).toBe(DOCUMENT_ACTION_EXECUTION_STATUSES.SKIPPED);
  });
});
