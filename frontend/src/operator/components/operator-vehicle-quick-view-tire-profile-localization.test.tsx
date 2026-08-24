// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { act, createElement, type ComponentProps, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import type { TireHealthSummaryResponse } from '../../lib/api';
import {
  operatorVehicleQuickViewTireProfileMeasureActionLabel,
  operatorVehicleQuickViewTireProfileModeLabel,
  operatorVehicleQuickViewTireProfileSectionTitle,
  operatorVehicleQuickViewTireProfileStatusLabel,
} from '../lib/operator-vehicle-quick-view-i18n';
import { OperatorVehicleQuickViewTireProfile } from './OperatorVehicleQuickViewTireProfile';

const P234_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorVehicleQuickViewTireProfile.tsx',
  'operator/lib/operator-vehicle-quick-view-i18n.ts',
];

function isP234EnforceCleanPath(relPath: string): boolean {
  return P234_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p234ScopedFindings() {
  return inventory.findings.filter((finding) => isP234EnforceCleanPath(finding.file));
}

function tireFixture(
  overrides: Partial<TireHealthSummaryResponse> = {},
): TireHealthSummaryResponse {
  return {
    overallPercent: 72,
    overallRemainingKm: 12000,
    healthStatus: 'WARNING',
    confidenceScore: 0.8,
    confidenceLabel: 'High',
    worstTirePosition: 'FL',
    worstTirePercent: 72,
    activeSetupName: 'Summer set',
    activeSetupId: 'setup-1',
    tireSeason: 'SUMMER',
    installedAt: '2025-01-01T00:00:00.000Z',
    totalKmOnSet: 10000,
    wearRateMmPer1000km: 0.2,
    alerts: [],
    hasActiveSet: true,
    hasSetups: true,
    hasMeasurements: true,
    overallStatus: 'WARNING',
    displayMode: 'MEASURED',
    displayTreadMm: 4.2,
    lowestTreadPosition: 'FL',
    lastMeasurementAt: '2026-08-24T10:00:00.000Z',
    estimatedRemainingKm: 12000,
    evidencePresentation: {
      uiStatus: 'WARNING',
      uiStatusLabelDe: 'Warnung',
      uiStatusLabelEn: 'Warning',
      remainingKm: {
        displayDe: 'ca. 12.000 km',
        displayEn: 'about 12,000 km',
      },
      lowestTread: {
        displayLabelDe: '4,2 mm',
        displayLabelEn: '4.2 mm',
        isDefaultAssumption: false,
      },
    } as TireHealthSummaryResponse['evidencePresentation'],
    ...overrides,
  };
}

function renderWithLocale(locale: 'de' | 'en', ui: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  window.localStorage.setItem('synqdrive.locale', locale);
  act(() => {
    root.render(createElement(LanguageProvider, null, ui));
  });
  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function renderTireProfile(
  locale: 'de' | 'en',
  props: Partial<ComponentProps<typeof OperatorVehicleQuickViewTireProfile>> = {},
) {
  return renderWithLocale(
    locale,
    createElement(OperatorVehicleQuickViewTireProfile, {
      tireSummary: tireFixture(),
      tireLoading: false,
      onMeasure: vi.fn(),
      ...props,
    }),
  );
}

function LocaleSwitchHarness(
  props: Partial<ComponentProps<typeof OperatorVehicleQuickViewTireProfile>>,
) {
  const { locale, setLocale } = useLanguage();
  return createElement(
    'div',
    null,
    createElement(
      'button',
      { type: 'button', onClick: () => setLocale(locale === 'de' ? 'en' : 'de') },
      'toggle-locale',
    ),
    createElement(OperatorVehicleQuickViewTireProfile, {
      tireSummary: tireFixture({ displayMode: 'ESTIMATED' }),
      tireLoading: false,
      onMeasure: vi.fn(),
      ...props,
    }),
  );
}

function sectionTitle(container: HTMLElement): string {
  return container.querySelector('h3')?.textContent?.trim() ?? '';
}

function infoTiles(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll('.rounded-xl.border.border-border\\/50.bg-muted\\/20'));
}

function tileValue(row: HTMLElement): string {
  return row.querySelector('.font-medium')?.textContent?.trim() ?? '';
}

describe('operator Vehicle Quick View Tire Profile localization (P2.2.34)', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  describe('enforce-clean inventory', () => {
    it('reports zero P234 scoped findings', () => {
      expect(p234ScopedFindings()).toHaveLength(0);
    });
  });

  describe('EN presentation', () => {
    it('renders section title, empty state, and measure action in English', () => {
      const view = renderTireProfile('en', { tireSummary: null });
      cleanup = view.cleanup;
      expect(sectionTitle(view.container)).toBe(
        en['operator.vehicleQuickView.tire.sectionTitle'],
      );
      expect(view.container.textContent).toContain(en['operator.vehicleQuickView.tire.empty']);
      expect(view.container.textContent).toContain(
        en['operator.vehicleQuickView.tire.measureAction'],
      );
    });

    it('renders localized tile labels and mode label', () => {
      const view = renderTireProfile('en');
      cleanup = view.cleanup;
      expect(view.container.textContent).toContain(
        en['operator.vehicleQuickView.tire.label.lastMeasurement'],
      );
      expect(view.container.textContent).toContain(
        en['operator.vehicleQuickView.tire.label.mode'],
      );
      expect(tileValue(infoTiles(view.container)[4])).toBe(
        en['operator.vehicleQuickView.tire.displayMode.MEASURED'],
      );
    });

    it('localizes status via evidence presentation labels', () => {
      const view = renderTireProfile('en');
      cleanup = view.cleanup;
      expect(operatorVehicleQuickViewTireProfileStatusLabel('en', tireFixture())).toBe('Warning');
      expect(tileValue(infoTiles(view.container)[2])).toBe('Warning');
    });
  });

  describe('DE presentation', () => {
    it('renders section title, empty state, and measure action in German', () => {
      const view = renderTireProfile('de', { tireSummary: null });
      cleanup = view.cleanup;
      expect(sectionTitle(view.container)).toBe(
        de['operator.vehicleQuickView.tire.sectionTitle'],
      );
      expect(view.container.textContent).toContain(de['operator.vehicleQuickView.tire.empty']);
      expect(view.container.textContent).toContain(
        de['operator.vehicleQuickView.tire.measureAction'],
      );
    });

    it('renders localized mode label in German', () => {
      const view = renderTireProfile('de', {
        tireSummary: tireFixture({ displayMode: 'ESTIMATED', measurementState: undefined }),
      });
      cleanup = view.cleanup;
      expect(tileValue(infoTiles(view.container)[4])).toBe(
        de['operator.vehicleQuickView.tire.displayMode.ESTIMATED'],
      );
    });
  });

  describe('machine value and dynamic data freeze', () => {
    it('preserves lowest tread position code in tread label across locales', () => {
      const summary = tireFixture({
        displayTreadMm: 3.1,
        lowestTreadPosition: 'FL',
        displayMode: 'MEASURED',
        evidencePresentation: undefined,
      });
      const enView = renderTireProfile('en', { tireSummary: summary });
      const deView = renderTireProfile('de', { tireSummary: summary });
      cleanup = () => {
        enView.cleanup();
        deView.cleanup();
      };
      expect(tileValue(infoTiles(enView.container)[1])).toContain('FL');
      expect(tileValue(infoTiles(deView.container)[1])).toContain('FL');
    });

    it('keeps machine displayMode while mapping presentation label only', () => {
      const summary = tireFixture({ displayMode: 'MEASURED' });
      expect(summary.displayMode).toBe('MEASURED');
      expect(operatorVehicleQuickViewTireProfileModeLabel('en', summary)).toBe('Measured');
      expect(operatorVehicleQuickViewTireProfileModeLabel('de', summary)).toBe('Gemessen');
    });
  });

  describe('callback preservation', () => {
    it('invokes onMeasure unchanged when action is clicked', () => {
      const onMeasure = vi.fn();
      const view = renderTireProfile('en', { onMeasure });
      cleanup = view.cleanup;
      const button = view.container.querySelector('button.text-xs.font-semibold') as HTMLButtonElement;
      act(() => button.click());
      expect(onMeasure).toHaveBeenCalledTimes(1);
      expect(onMeasure).toHaveBeenCalledWith();
    });
  });

  describe('same-mount locale switch', () => {
    it('updates labels without remounting tire profile', () => {
      const view = renderWithLocale('de', createElement(LocaleSwitchHarness));
      cleanup = view.cleanup;
      expect(view.container.textContent).toContain(
        de['operator.vehicleQuickView.tire.sectionTitle'],
      );
      expect(view.container.textContent).toContain(
        de['operator.vehicleQuickView.tire.displayMode.ESTIMATED'],
      );

      const toggle = view.container.querySelector('button') as HTMLButtonElement;
      act(() => toggle.click());

      expect(view.container.textContent).toContain(
        en['operator.vehicleQuickView.tire.sectionTitle'],
      );
      expect(view.container.textContent).toContain(
        en['operator.vehicleQuickView.tire.displayMode.ESTIMATED'],
      );
      expect(view.container.textContent).not.toContain('operator.vehicleQuickView.tire');
    });
  });

  describe('raw key and machine-code leakage guards', () => {
    it('does not render raw translation keys or unmapped display mode codes', () => {
      const view = renderTireProfile('en');
      cleanup = view.cleanup;
      expect(view.container.textContent).not.toContain('operator.vehicleQuickView.tire');
      expect(tileValue(infoTiles(view.container)[4])).not.toBe('MEASURED');
      expect(operatorVehicleQuickViewTireProfileSectionTitle('en')).toBe(
        en['operator.vehicleQuickView.tire.sectionTitle'],
      );
      expect(operatorVehicleQuickViewTireProfileMeasureActionLabel('de')).toBe(
        de['operator.vehicleQuickView.tire.measureAction'],
      );
    });
  });
});
