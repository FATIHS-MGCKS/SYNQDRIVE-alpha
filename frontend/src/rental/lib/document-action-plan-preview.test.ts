import { describe, expect, it } from 'vitest';
import {
  isActionPlanConfirmReady,
  toggleDisabledOptionalAction,
} from './document-action-plan-preview';
import type { PublicDocumentActionPlanPreview } from './document-extraction.types';

const preview: PublicDocumentActionPlanPreview = {
  planId: 'plan-1',
  fingerprint: 'fp-1',
  planVersion: 1,
  planOutcome: 'READY',
  planStatus: 'PREVIEW',
  summary: 'Ready',
  blocked: false,
  canConfirm: true,
  confirmBlockedReason: null,
  disabledOptionalActions: [],
  actions: [
    {
      semanticAction: 'CREATE_FINE_DRAFT',
      labelKey: 'documentAction.CREATE_FINE_DRAFT',
      title: 'Bußgeldentwurf anlegen',
      targetModule: 'fines',
      targetModuleLabel: 'Bußgelder',
      targetEntityType: 'fine',
      targetEntityLabel: null,
      requirement: 'REQUIRED',
      status: 'READY',
      sequence: 1,
      writableFields: [{ key: 'reportNumber', label: 'Aktenzeichen', value: 'AZ-1' }],
      missingPrerequisites: [],
      conflicts: [],
      toggleable: false,
      enabled: true,
    },
  ],
};

describe('document-action-plan-preview', () => {
  it('toggles disabled optional actions', () => {
    expect(toggleDisabledOptionalAction([], 'LINK_BOOKING', false)).toEqual(['LINK_BOOKING']);
    expect(toggleDisabledOptionalAction(['LINK_BOOKING'], 'LINK_BOOKING', true)).toEqual([]);
  });

  it('requires loaded non-blocked preview before confirm', () => {
    expect(isActionPlanConfirmReady(null, true)).toBe(false);
    expect(isActionPlanConfirmReady(preview, false)).toBe(true);
    expect(isActionPlanConfirmReady({ ...preview, canConfirm: false }, false)).toBe(false);
  });
});
