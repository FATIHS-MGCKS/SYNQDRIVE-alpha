import { describe, expect, it } from 'vitest';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import type { TranslationKey } from '../../i18n/translations/en';
import { mapFleetHealthPresentation } from './presentation';
import {
  FLEET_HEALTH_CONDITION,
  HEALTH_EVALUABILITY_STATE,
  type FleetHealthEvaluation,
} from './types';

function tFor(locale: 'en' | 'de') {
  const dict = locale === 'de' ? de : en;
  return (key: TranslationKey) => dict[key] ?? key;
}

function evaluation(
  overrides: Partial<FleetHealthEvaluation> = {},
): FleetHealthEvaluation {
  return {
    condition: FLEET_HEALTH_CONDITION.GOOD,
    evaluability: HEALTH_EVALUABILITY_STATE.EVALUABLE,
    generatedAt: '2026-08-25T12:00:00.000Z',
    healthEvidenceAt: '2026-08-25T11:00:00.000Z',
    anyModuleDataStale: false,
    source: 'p0.2_projection',
    ...overrides,
  };
}

describe('mapFleetHealthPresentation (P0.4)', () => {
  it('F1 — EVALUABLE + GOOD → Gut', () => {
    const result = mapFleetHealthPresentation(evaluation(), { t: tFor('de') });
    expect(result.label).toBe('Gut');
    expect(result.isEvaluable).toBe(true);
    expect(result.tone).toBe('success');
  });

  it('F2 — EVALUABLE + WARNING → canonical warning label', () => {
    const result = mapFleetHealthPresentation(
      evaluation({ condition: FLEET_HEALTH_CONDITION.WARNING }),
      { t: tFor('de') },
    );
    expect(result.label).toBe('Auffällig');
    expect(result.tone).toBe('watch');
  });

  it('F3 — EVALUABLE + CRITICAL → Kritisch', () => {
    const result = mapFleetHealthPresentation(
      evaluation({ condition: FLEET_HEALTH_CONDITION.CRITICAL }),
      { t: tFor('de') },
    );
    expect(result.label).toBe('Kritisch');
    expect(result.tone).toBe('critical');
  });

  it('F4 — PARTIALLY_EVALUABLE → Eingeschränkt bewertbar', () => {
    const result = mapFleetHealthPresentation(
      evaluation({ evaluability: HEALTH_EVALUABILITY_STATE.PARTIALLY_EVALUABLE }),
      { t: tFor('de') },
    );
    expect(result.label).toBe('Eingeschränkt bewertbar');
    expect(result.isEvaluable).toBe(false);
  });

  it('F5 — NOT_EVALUABLE → Nicht bewertbar', () => {
    const result = mapFleetHealthPresentation(
      evaluation({ evaluability: HEALTH_EVALUABILITY_STATE.NOT_EVALUABLE }),
      { t: tFor('de') },
    );
    expect(result.label).toBe('Nicht bewertbar');
    expect(result.tooltip).toContain('nicht sicher bewertet');
  });

  it('F6 — UNKNOWN → Status unbekannt', () => {
    const result = mapFleetHealthPresentation(
      evaluation({ evaluability: HEALTH_EVALUABILITY_STATE.UNKNOWN }),
      { t: tFor('de') },
    );
    expect(result.label).toBe('Status unbekannt');
  });

  it('F7 — missing evaluation DTO → Status unbekannt', () => {
    const result = mapFleetHealthPresentation(null, { t: tFor('de') });
    expect(result.label).toBe('Status unbekannt');
    expect(result.isEvaluable).toBe(false);
  });

  it('F8 — stale GOOD (NOT_EVALUABLE) must NOT render Gut', () => {
    const result = mapFleetHealthPresentation(
      evaluation({
        condition: FLEET_HEALTH_CONDITION.GOOD,
        evaluability: HEALTH_EVALUABILITY_STATE.NOT_EVALUABLE,
        anyModuleDataStale: true,
      }),
      { t: tFor('de') },
    );
    expect(result.label).not.toBe('Gut');
    expect(result.label).toBe('Nicht bewertbar');
  });

  it('F10 — unknown enum value → safe UNKNOWN', () => {
    const result = mapFleetHealthPresentation(
      evaluation({ evaluability: 'INVALID' as FleetHealthEvaluation['evaluability'] }),
      { t: tFor('en') },
    );
    expect(result.label).toBe('Status unknown');
    expect(result.evaluability).toBe(HEALTH_EVALUABILITY_STATE.UNKNOWN);
  });
});
