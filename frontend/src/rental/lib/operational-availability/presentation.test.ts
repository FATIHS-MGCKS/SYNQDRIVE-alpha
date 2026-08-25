import { describe, expect, it } from 'vitest';
import { en } from '../../i18n/translations/en';
import { de } from '../../i18n/translations/de';
import type { TranslationKey } from '../../i18n/translations/en';
import { mapOperationalAvailabilityPresentation } from './presentation';
import { OPERATIONAL_AVAILABILITY_STATE } from './types';

function tFor(locale: 'en' | 'de') {
  const dict = locale === 'de' ? de : en;
  return (key: TranslationKey) => dict[key] ?? key;
}

describe('mapOperationalAvailabilityPresentation', () => {
  it('F1 — AVAILABLE → Verfügbar / Available', () => {
    const deResult = mapOperationalAvailabilityPresentation(
      { state: OPERATIONAL_AVAILABILITY_STATE.AVAILABLE, primaryReason: null, reasonCodes: [], recommendedAction: 'NONE', attention: 'NONE', generatedAt: '2026-08-25T12:00:00.000Z' },
      { t: tFor('de') },
    );
    const enResult = mapOperationalAvailabilityPresentation(
      { state: OPERATIONAL_AVAILABILITY_STATE.AVAILABLE, primaryReason: null, reasonCodes: [], recommendedAction: 'NONE', attention: 'NONE', generatedAt: '2026-08-25T12:00:00.000Z' },
      { t: tFor('en') },
    );
    expect(deResult.label).toBe('Verfügbar');
    expect(enResult.label).toBe('Available');
    expect(deResult.tone).toBe('success');
  });

  it('F2 — NEEDS_VERIFICATION → Prüfung erforderlich / Check required', () => {
    const deResult = mapOperationalAvailabilityPresentation(
      { state: OPERATIONAL_AVAILABILITY_STATE.NEEDS_VERIFICATION, primaryReason: 'DEVICE_CHECK_REQUIRED', reasonCodes: ['DEVICE_CHECK_REQUIRED'], recommendedAction: 'CHECK_DEVICE', attention: 'ACTION_REQUIRED', generatedAt: '2026-08-25T12:00:00.000Z' },
      { t: tFor('de') },
    );
    const enResult = mapOperationalAvailabilityPresentation(
      { state: OPERATIONAL_AVAILABILITY_STATE.NEEDS_VERIFICATION, primaryReason: 'DEVICE_CHECK_REQUIRED', reasonCodes: ['DEVICE_CHECK_REQUIRED'], recommendedAction: 'CHECK_DEVICE', attention: 'ACTION_REQUIRED', generatedAt: '2026-08-25T12:00:00.000Z' },
      { t: tFor('en') },
    );
    expect(deResult.label).toBe('Prüfung erforderlich');
    expect(enResult.label).toBe('Check required');
    expect(deResult.tone).toBe('watch');
  });

  it('F3 — UNKNOWN → Status unbekannt / Status unknown', () => {
    const deResult = mapOperationalAvailabilityPresentation(
      { state: OPERATIONAL_AVAILABILITY_STATE.UNKNOWN, primaryReason: null, reasonCodes: [], recommendedAction: 'NONE', attention: 'NONE', generatedAt: '2026-08-25T12:00:00.000Z' },
      { t: tFor('de') },
    );
    const enResult = mapOperationalAvailabilityPresentation(
      { state: OPERATIONAL_AVAILABILITY_STATE.UNKNOWN, primaryReason: null, reasonCodes: [], recommendedAction: 'NONE', attention: 'NONE', generatedAt: '2026-08-25T12:00:00.000Z' },
      { t: tFor('en') },
    );
    expect(deResult.label).toBe('Status unbekannt');
    expect(enResult.label).toBe('Status unknown');
  });

  it('F4 — UNAVAILABLE → Nicht verfügbar / Unavailable', () => {
    const deResult = mapOperationalAvailabilityPresentation(
      { state: OPERATIONAL_AVAILABILITY_STATE.UNAVAILABLE, primaryReason: 'BUSINESS_WORKFLOW_BLOCKED', reasonCodes: ['BUSINESS_WORKFLOW_BLOCKED'], recommendedAction: 'NONE', attention: 'ACTION_REQUIRED', generatedAt: '2026-08-25T12:00:00.000Z' },
      { t: tFor('de') },
    );
    const enResult = mapOperationalAvailabilityPresentation(
      { state: OPERATIONAL_AVAILABILITY_STATE.UNAVAILABLE, primaryReason: 'BUSINESS_WORKFLOW_BLOCKED', reasonCodes: ['BUSINESS_WORKFLOW_BLOCKED'], recommendedAction: 'NONE', attention: 'ACTION_REQUIRED', generatedAt: '2026-08-25T12:00:00.000Z' },
      { t: tFor('en') },
    );
    expect(deResult.label).toBe('Nicht verfügbar');
    expect(enResult.label).toBe('Unavailable');
    expect(deResult.tone).toBe('critical');
  });

  it('F5 — unknown/unrecognized value → safe UNKNOWN presentation', () => {
    const result = mapOperationalAvailabilityPresentation(
      { state: 'OFFLINE_AVAILABLE' as never, primaryReason: null, reasonCodes: [], recommendedAction: 'NONE', attention: 'NONE', generatedAt: '2026-08-25T12:00:00.000Z' },
      { t: tFor('de') },
    );
    expect(result.state).toBe(OPERATIONAL_AVAILABILITY_STATE.UNKNOWN);
    expect(result.label).toBe('Status unbekannt');
  });

  it('F6/F7 — canonical mapper is shared for desktop/mobile consumers', () => {
    const input = {
      state: OPERATIONAL_AVAILABILITY_STATE.NEEDS_VERIFICATION,
      primaryReason: 'DEVICE_CHECK_REQUIRED',
      reasonCodes: ['DEVICE_CHECK_REQUIRED'],
      recommendedAction: 'CHECK_DEVICE',
      attention: 'ACTION_REQUIRED',
      generatedAt: '2026-08-25T12:00:00.000Z',
    };
    const desktop = mapOperationalAvailabilityPresentation(input, { t: tFor('de') });
    const mobile = mapOperationalAvailabilityPresentation(input, { t: tFor('de') });
    expect(desktop).toEqual(mobile);
  });
});
