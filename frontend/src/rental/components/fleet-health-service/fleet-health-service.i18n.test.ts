import { describe, expect, it } from 'vitest';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import type { TranslationKey } from '../../i18n/translations/en';

const FLEET_HEALTH_SERVICE_KEYS: TranslationKey[] = [
  'fleetHealthService.tab.overview',
  'fleetHealthService.tab.vehicles',
  'fleetHealthService.tab.work',
  'fleetHealthService.tab.history',
  'fleetHealthService.work.tasks',
  'fleetHealthService.work.schedule',
  'fleetHealthService.tab.schedule',
  'fleetHealthService.kpi.blocked',
  'fleetHealthService.kpi.review',
  'fleetHealthService.kpi.limited',
  'fleetHealthService.kpi.healthy',
  'fleetHealthService.kpi.hint.blocked',
  'fleetHealthService.kpi.hint.review',
  'fleetHealthService.kpi.hint.limited',
  'fleetHealthService.kpi.hint.healthy',
  'fleetHealthService.panel.tasks.title',
  'fleetHealthService.panel.schedule.title',
  'fleetHealthService.panel.history.title',
  'fleetHealthService.overview.priorityTitle',
  'fleetHealthService.overview.findingsHeading',
  'fleetHealthService.overview.casesHeading',
  'fleetHealthService.overview.workshopAppointment',
  'fleetHealthService.overview.expectedCompletion',
  'fleetHealthService.overview.dueDate',
  'fleetHealthService.prioritizedList.emptyTitle',
  'fleetHealthService.error.serviceCases',
];

describe('fleet health service i18n', () => {
  it('defines every fleetHealthService key in DE and EN', () => {
    for (const key of FLEET_HEALTH_SERVICE_KEYS) {
      expect(de[key], `missing de key ${key}`).toBeTruthy();
      expect(en[key], `missing en key ${key}`).toBeTruthy();
    }
  });

  it('uses canonical German terminology', () => {
    expect(de['fleetHealthService.kpi.healthy']).toBe('Technisch unauffällig');
    expect(de['fleetHealthService.kpi.review']).toBe('Technisch prüfen');
    expect(de['fleetHealthService.kpi.blocked']).toBe('Technisch blockiert');
    expect(de['fleetHealthService.kpi.limited']).toBe('Nicht bewertbar');
    expect(de['fleetHealthService.overview.priorityTitle']).toBe('Priorisierte Übersicht');
    expect(de['fleetHealthService.tab.schedule']).toBe('Fälligkeiten');
    expect(de['fleetHealthService.overview.findingsHeading']).toBe('Zustandsbefunde');
    expect(de['fleetHealthService.overview.casesHeading']).toBe('Servicefälle');
    expect(de['fleetHealthService.overview.workshopAppointment']).toBe('Werkstatttermin');
    expect(de['fleetHealthService.overview.expectedCompletion']).toBe('Erwartete Fertigstellung');
    expect(de['fleetHealthService.overview.dueDate']).toBe('Fälligkeit');
  });

  it('avoids deprecated user-facing terms in DE copy', () => {
    const deValues = FLEET_HEALTH_SERVICE_KEYS.map((key) => de[key] ?? '');
    for (const value of deValues) {
      expect(value.toLowerCase()).not.toContain('triage');
      expect(value).not.toMatch(/\bGesund\b/);
      expect(value).not.toMatch(/\bFindings\b/);
    }
  });
});
