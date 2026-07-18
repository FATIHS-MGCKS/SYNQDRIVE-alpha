import {
  isOptionalActionDisabled,
  mergeActionPlanPreferences,
  readActionPlanPreferences,
} from './document-action-plan-preferences.util';

describe('document-action-plan-preferences.util', () => {
  it('reads disabled optional actions from confirmedData', () => {
    const prefs = readActionPlanPreferences({
      reportNumber: 'AZ-1',
      actionPlanPreferences: {
        disabledOptionalActions: ['SUGGEST_ENTITY_LINK', 'SUGGEST_ENTITY_LINK'],
      },
    });

    expect(prefs.disabledOptionalActions).toEqual(['SUGGEST_ENTITY_LINK']);
  });

  it('merges preferences without dropping reviewed fields', () => {
    const merged = mergeActionPlanPreferences(
      { reportNumber: 'AZ-1' },
      { disabledOptionalActions: ['LINK_BOOKING'] },
    );

    expect(merged.reportNumber).toBe('AZ-1');
    expect(merged.actionPlanPreferences).toEqual({
      disabledOptionalActions: ['LINK_BOOKING'],
    });
  });

  it('detects disabled optional actions only', () => {
    expect(
      isOptionalActionDisabled('SUGGEST_ENTITY_LINK', 'OPTIONAL', {
        disabledOptionalActions: ['SUGGEST_ENTITY_LINK'],
      }),
    ).toBe(true);
    expect(
      isOptionalActionDisabled('CREATE_FINE_DRAFT', 'REQUIRED', {
        disabledOptionalActions: ['CREATE_FINE_DRAFT'],
      }),
    ).toBe(false);
  });
});
