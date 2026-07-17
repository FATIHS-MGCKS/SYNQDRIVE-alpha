import {
  FINE_COMPLETE,
  FINE_MISSING_EVENT_DATE,
} from './__fixtures__/document-fine-fixtures';
import {
  buildActionPlanPreviewSummary,
  buildActionPreviewCards,
} from './document-action-plan-preview.builder';
import { buildDocumentActionPlan } from './document-action-plan.builder';
import { DOCUMENT_ACTION_PREVIEW_STATUSES } from './document-action-plan-preview.types';

describe('document-action-plan-preview.builder', () => {
  it('builds readable cards for a complete fine plan', () => {
    const plan = buildDocumentActionPlan({
      extractionId: 'ext-fine-1',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      documentType: 'FINE',
      confirmedData: FINE_COMPLETE,
      plausibilityChecks: [],
    });

    const cards = buildActionPreviewCards({
      plan,
      confirmedData: FINE_COMPLETE,
      preferences: { disabledOptionalActions: [] },
      vehicleLabel: 'VW Golf · B-AB 123',
    });

    const draft = cards.find((card) => card.semanticAction === 'CREATE_FINE_DRAFT');
    expect(draft).toBeDefined();
    expect(draft?.title).toBe('Bußgeldentwurf anlegen');
    expect(draft?.targetModuleLabel).toBe('Bußgelder');
    expect(draft?.requirement).toBe('REQUIRED');
    expect(draft?.status).toBe(DOCUMENT_ACTION_PREVIEW_STATUSES.READY);
    expect(draft?.writableFields.some((field) => field.key === 'reportNumber')).toBe(true);
  });

  it('marks required actions as blocked when plan outcome is blocked', () => {
    const plan = buildDocumentActionPlan({
      extractionId: 'ext-fine-2',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      documentType: 'FINE',
      confirmedData: FINE_MISSING_EVENT_DATE,
      plausibilityChecks: [],
    });

    const cards = buildActionPreviewCards({
      plan,
      confirmedData: FINE_MISSING_EVENT_DATE,
      preferences: { disabledOptionalActions: [] },
    });

    expect(plan.planOutcome).toBe('BLOCKED');
    expect((plan.metadata?.missingRequirements as unknown[])?.length ?? 0).toBeGreaterThan(0);
    expect(cards.every((card) => card.status === DOCUMENT_ACTION_PREVIEW_STATUSES.BLOCKED || card.requirement !== 'REQUIRED')).toBe(
      true,
    );
    expect(buildActionPlanPreviewSummary(plan, true)).toContain('blockiert');
  });

  it('disables optional actions when user preference is set', () => {
    const plan = buildDocumentActionPlan({
      extractionId: 'ext-fine-3',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      documentType: 'FINE',
      confirmedData: {
        ...FINE_COMPLETE,
        acceptedEntityLinks: [
          { entityType: 'booking', entityId: 'b1', label: 'Buchung #12', status: 'ACCEPTED' },
        ],
      },
      plausibilityChecks: [],
    });

    const cards = buildActionPreviewCards({
      plan,
      confirmedData: {
        ...FINE_COMPLETE,
        acceptedEntityLinks: [
          { entityType: 'booking', entityId: 'b1', label: 'Buchung #12', status: 'ACCEPTED' },
        ],
      },
      preferences: { disabledOptionalActions: ['SUGGEST_ENTITY_LINK'] },
    });

    const link = cards.find((card) => card.semanticAction === 'SUGGEST_ENTITY_LINK');
    expect(link?.toggleable).toBe(true);
    expect(link?.enabled).toBe(false);
    expect(link?.status).toBe(DOCUMENT_ACTION_PREVIEW_STATUSES.DISABLED);
  });
});
