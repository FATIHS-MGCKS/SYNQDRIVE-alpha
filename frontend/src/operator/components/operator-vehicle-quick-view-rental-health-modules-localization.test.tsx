// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { act, createElement, type ComponentProps, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import type { RentalHealthModule, VehicleHealthResponse } from '../../lib/api';
import {
  operatorVehicleQuickViewRentalHealthModuleLabel,
  operatorVehicleQuickViewRentalHealthModulePresentation,
  operatorVehicleQuickViewRentalHealthSectionTitle,
  operatorVehicleQuickViewRentalHealthStateLabel,
  RENTAL_HEALTH_MODULE_KEYS,
  type OperatorVehicleQuickViewRentalHealthModuleKey,
} from '../lib/operator-vehicle-quick-view-i18n';
import { OperatorVehicleQuickViewRentalHealth } from './OperatorVehicleQuickViewRentalHealth';

const P232_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorVehicleQuickViewRentalHealth.tsx',
  'operator/lib/operator-vehicle-quick-view-i18n.ts',
];

function isP232EnforceCleanPath(relPath: string): boolean {
  return P232_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p232ScopedFindings() {
  return inventory.findings.filter((finding) => isP232EnforceCleanPath(finding.file));
}

function moduleFixture(
  state: RentalHealthModule['state'],
  reason: string,
  stale = false,
): RentalHealthModule {
  return {
    state,
    reason,
    last_updated_at: '2026-08-24T10:00:00.000Z',
    data_stale: stale,
  };
}

function healthFixture(
  overrides: Partial<Record<OperatorVehicleQuickViewRentalHealthModuleKey, RentalHealthModule>> = {},
): VehicleHealthResponse {
  return {
    vehicle_id: 'veh-1',
    organization_id: 'org-1',
    overall_state: 'warning',
    rental_blocked: false,
    blocking_reasons: [],
    modules: {
      battery: moduleFixture('good', 'Battery OK'),
      tires: moduleFixture('warning', 'Tread depth low', true),
      brakes: moduleFixture('critical', 'Pads worn'),
      error_codes: moduleFixture('unknown', ''),
      service_compliance: moduleFixture('n_a', 'Not applicable'),
      complaints: moduleFixture('good', 'No complaints'),
      vehicle_alerts: moduleFixture('warning', 'OEM alert active'),
      ...overrides,
    },
    generated_at: '2026-08-24T10:00:00.000Z',
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

function renderRentalHealth(
  locale: 'de' | 'en',
  props: Partial<ComponentProps<typeof OperatorVehicleQuickViewRentalHealth>> = {},
) {
  return renderWithLocale(
    locale,
    createElement(OperatorVehicleQuickViewRentalHealth, {
      health: healthFixture(),
      healthLoading: false,
      ...props,
    }),
  );
}

function LocaleSwitchHarness(
  props: Partial<ComponentProps<typeof OperatorVehicleQuickViewRentalHealth>>,
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
    createElement(OperatorVehicleQuickViewRentalHealth, {
      health: healthFixture(),
      healthLoading: false,
      ...props,
    }),
  );
}

function sectionTitle(container: HTMLElement): string {
  return container.querySelector('h3')?.textContent?.trim() ?? '';
}

function moduleRows(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll('.rounded-xl.border.border-border\\/40'));
}

function moduleLabel(row: HTMLElement): string {
  return row.querySelector('.text-xs.font-semibold')?.textContent?.trim() ?? '';
}

function moduleReason(row: HTMLElement): string {
  return row.querySelector('.truncate')?.textContent?.trim() ?? '';
}

function moduleChip(row: HTMLElement): string {
  return row.querySelector('.sq-chip')?.textContent?.trim() ?? '';
}

describe('operator Vehicle Quick View Rental Health Modules localization (P2.2.32)', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  describe('enforce-clean inventory', () => {
    it('reports zero P232 scoped findings', () => {
      expect(p232ScopedFindings()).toHaveLength(0);
    });
  });

  describe('module order', () => {
    it('preserves canonical module key order', () => {
      expect(RENTAL_HEALTH_MODULE_KEYS).toEqual([
        'battery',
        'tires',
        'brakes',
        'error_codes',
        'service_compliance',
        'complaints',
        'vehicle_alerts',
      ]);
    });
  });

  describe('EN presentation', () => {
    it('renders section title and module labels in English', () => {
      const view = renderRentalHealth('en');
      cleanup = view.cleanup;
      expect(sectionTitle(view.container)).toBe(
        en['operator.vehicleQuickView.health.sectionTitle'],
      );
      const rows = moduleRows(view.container);
      expect(rows).toHaveLength(7);
      expect(moduleLabel(rows[0])).toBe(en['operator.vehicleQuickView.health.module.battery']);
      expect(moduleLabel(rows[1])).toBe(en['operator.vehicleQuickView.health.module.tires']);
    });

    it('renders health state chips and stale suffix without translating dynamic reasons', () => {
      const view = renderRentalHealth('en');
      cleanup = view.cleanup;
      const rows = moduleRows(view.container);
      expect(moduleReason(rows[0])).toBe('Battery OK');
      expect(moduleChip(rows[0])).toContain(en['health.state.good']);
      expect(moduleChip(rows[1])).toContain(en['health.state.warning']);
      expect(moduleChip(rows[1])).toContain(en['operator.vehicleQuickView.health.staleSuffix']);
      expect(moduleChip(rows[2])).toContain(en['health.state.critical']);
    });

    it('renders empty state in English when health is unavailable', () => {
      const view = renderRentalHealth('en', { health: null });
      cleanup = view.cleanup;
      expect(view.container.textContent).toContain(en['operator.vehicleQuickView.health.empty']);
    });
  });

  describe('DE presentation', () => {
    it('renders section title and module labels in German', () => {
      const view = renderRentalHealth('de');
      cleanup = view.cleanup;
      expect(sectionTitle(view.container)).toBe(
        de['operator.vehicleQuickView.health.sectionTitle'],
      );
      const rows = moduleRows(view.container);
      expect(moduleLabel(rows[0])).toBe(de['operator.vehicleQuickView.health.module.battery']);
      expect(moduleLabel(rows[3])).toBe(de['operator.vehicleQuickView.health.module.error_codes']);
    });

    it('renders localized state chips and no-data fallback', () => {
      const base = healthFixture();
      const health = {
        ...base,
        modules: {
          ...base.modules,
          error_codes: undefined as unknown as RentalHealthModule,
        },
      };
      const view = renderRentalHealth('de', { health });
      cleanup = view.cleanup;
      const rows = moduleRows(view.container);
      expect(moduleReason(rows[3])).toBe(de['operator.vehicleQuickView.health.noData']);
      expect(moduleChip(rows[3])).toBe(de['operator.vehicleQuickView.health.reasonFallback']);
    });
  });

  describe('adapter presentation maps', () => {
    it.each(RENTAL_HEALTH_MODULE_KEYS)('maps %s module label to canonical translation keys', (key) => {
      expect(operatorVehicleQuickViewRentalHealthModuleLabel('en', key)).toBe(
        en[`operator.vehicleQuickView.health.module.${key}`],
      );
      expect(operatorVehicleQuickViewRentalHealthModuleLabel('de', key)).toBe(
        de[`operator.vehicleQuickView.health.module.${key}`],
      );
    });

    it('maps rental health states through health.state.* keys', () => {
      const states = ['good', 'warning', 'critical', 'unknown', 'n_a'] as const;
      for (const state of states) {
        expect(operatorVehicleQuickViewRentalHealthStateLabel('en', state)).toBe(
          en[`health.state.${state === 'n_a' ? 'na' : state}`],
        );
        expect(operatorVehicleQuickViewRentalHealthStateLabel('de', state)).toBe(
          de[`health.state.${state === 'n_a' ? 'na' : state}`],
        );
      }
    });

    it('keeps machine state and raw values stable in presentation helper', () => {
      const mod = moduleFixture('warning', 'Tread depth low', true);
      const enRow = operatorVehicleQuickViewRentalHealthModulePresentation('en', mod);
      const deRow = operatorVehicleQuickViewRentalHealthModulePresentation('de', mod);
      expect(enRow.reason).toBe('Tread depth low');
      expect(deRow.reason).toBe('Tread depth low');
      expect(enRow.stale).toBe(true);
      expect(deRow.stale).toBe(true);
      expect(enRow.tone).toBe('watch');
      expect(deRow.tone).toBe('watch');
    });
  });

  describe('same-mount locale switch', () => {
    it('updates labels without remounting rental health modules', () => {
      const view = renderWithLocale('de', createElement(LocaleSwitchHarness));
      cleanup = view.cleanup;
      expect(view.container.textContent).toContain(
        de['operator.vehicleQuickView.health.module.battery'],
      );
      expect(view.container.textContent).toContain(de['health.state.critical']);

      const toggle = view.container.querySelector('button') as HTMLButtonElement;
      act(() => toggle.click());

      expect(view.container.textContent).toContain(
        en['operator.vehicleQuickView.health.module.battery'],
      );
      expect(view.container.textContent).toContain(en['health.state.critical']);
      expect(view.container.textContent).not.toContain('operator.vehicleQuickView.health');
    });
  });

  describe('visibility and module count', () => {
    it('renders seven modules for representative health data in both locales', () => {
      const enView = renderRentalHealth('en');
      const deView = renderRentalHealth('de');
      cleanup = () => {
        enView.cleanup();
        deView.cleanup();
      };
      expect(moduleRows(enView.container)).toHaveLength(7);
      expect(moduleRows(deView.container)).toHaveLength(7);
    });
  });

  describe('raw key and machine-code leakage guards', () => {
    it('does not render raw translation keys or machine module ids in visible text', () => {
      const view = renderRentalHealth('en');
      cleanup = view.cleanup;
      expect(view.container.textContent).not.toContain('operator.vehicleQuickView.health');
      expect(view.container.textContent).not.toContain('health.state.');
      expect(view.container.textContent).not.toContain('error_codes');
      expect(view.container.textContent).not.toContain('service_compliance');
      expect(view.container.textContent).not.toContain('vehicle_alerts');
      expect(operatorVehicleQuickViewRentalHealthSectionTitle('en')).toBe(
        en['operator.vehicleQuickView.health.sectionTitle'],
      );
    });
  });
});
