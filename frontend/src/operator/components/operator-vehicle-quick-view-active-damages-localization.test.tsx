// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { act, createElement, type ComponentProps, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import type { DamageResponse } from '../../rental/lib/damage.types';
import {
  operatorVehicleQuickViewActiveDamagesImpactLabel,
  operatorVehicleQuickViewActiveDamagesRowTitle,
  operatorVehicleQuickViewActiveDamagesSectionTitle,
  operatorVehicleQuickViewActiveDamagesSeverityLabel,
  operatorVehicleQuickViewActiveDamagesTypeLabel,
} from '../lib/operator-vehicle-quick-view-i18n';
import { OperatorVehicleQuickViewActiveDamages } from './OperatorVehicleQuickViewActiveDamages';

const P233_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorVehicleQuickViewActiveDamages.tsx',
  'operator/lib/operator-vehicle-quick-view-i18n.ts',
];

function isP233EnforceCleanPath(relPath: string): boolean {
  return P233_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p233ScopedFindings() {
  return inventory.findings.filter((finding) => isP233EnforceCleanPath(finding.file));
}

function damageFixture(
  overrides: Partial<DamageResponse> & Pick<DamageResponse, 'id'>,
): DamageResponse {
  return {
    vehicleId: 'veh-1',
    damageType: 'SCRATCH',
    severity: 'MODERATE',
    status: 'OPEN',
    description: null,
    locationView: 'FRONT',
    locationX: null,
    locationY: null,
    locationLabel: null,
    estimatedCostCents: null,
    repairCostCents: null,
    chargedToCustomerCents: null,
    depositHoldCents: null,
    source: 'INSPECTION',
    rentalImpact: 'NONE',
    evidenceStatus: 'COMPLETE',
    liabilityStatus: 'NOT_APPLICABLE',
    liabilityNote: null,
    reportedBy: null,
    reportedAt: '2026-08-24T10:00:00.000Z',
    createdAt: '2026-08-24T10:00:00.000Z',
    updatedAt: '2026-08-24T10:00:00.000Z',
    repairStartedAt: null,
    repairedAt: null,
    images: [],
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

function renderActiveDamages(
  locale: 'de' | 'en',
  props: Partial<ComponentProps<typeof OperatorVehicleQuickViewActiveDamages>> = {},
) {
  return renderWithLocale(
    locale,
    createElement(OperatorVehicleQuickViewActiveDamages, {
      damages: [damageFixture({ id: 'dmg-1' })],
      damagesLoading: false,
      ...props,
    }),
  );
}

function LocaleSwitchHarness(
  props: Partial<ComponentProps<typeof OperatorVehicleQuickViewActiveDamages>>,
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
    createElement(OperatorVehicleQuickViewActiveDamages, {
      damages: [damageFixture({ id: 'dmg-1', rentalImpact: 'WATCH' })],
      damagesLoading: false,
      ...props,
    }),
  );
}

function sectionTitle(container: HTMLElement): string {
  return container.querySelector('h3')?.textContent?.trim() ?? '';
}

function damageRows(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll('.rounded-xl.border.border-border\\/50'));
}

function rowTitle(row: HTMLElement): string {
  return row.querySelector('.text-sm.font-semibold')?.textContent?.trim() ?? '';
}

function rowLocation(row: HTMLElement): string {
  return row.querySelector('.text-xs.text-muted-foreground')?.textContent?.trim() ?? '';
}

function rowChip(row: HTMLElement): string {
  return row.querySelector('.sq-chip')?.textContent?.trim() ?? '';
}

describe('operator Vehicle Quick View Active Damages localization (P2.2.33)', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  describe('enforce-clean inventory', () => {
    it('reports zero P233 scoped findings', () => {
      expect(p233ScopedFindings()).toHaveLength(0);
    });
  });

  describe('EN presentation', () => {
    it('renders section title and empty state in English', () => {
      const view = renderActiveDamages('en', { damages: [] });
      cleanup = view.cleanup;
      expect(sectionTitle(view.container)).toBe(
        en['operator.vehicleQuickView.damages.sectionTitle'],
      );
      expect(view.container.textContent).toContain(en['operator.vehicleQuickView.damages.empty']);
    });

    it('renders localized type and severity labels via damage capture reuse', () => {
      const view = renderActiveDamages('en', {
        damages: [damageFixture({ id: 'dmg-1', damageType: 'SCRATCH', severity: 'CRITICAL' })],
      });
      cleanup = view.cleanup;
      const row = damageRows(view.container)[0];
      expect(rowTitle(row)).toBe(
        `${en['operator.damageCapture.damageType.SCRATCH']}${en['operator.vehicleQuickView.damages.rowSeparator']}${en['operator.damageCapture.severity.CRITICAL']}`,
      );
    });

    it('renders localized rental impact chip', () => {
      const view = renderActiveDamages('en', {
        damages: [damageFixture({ id: 'dmg-1', rentalImpact: 'BLOCK_RENTAL' })],
      });
      cleanup = view.cleanup;
      expect(rowChip(damageRows(view.container)[0])).toBe(
        en['operator.damageCapture.rentalImpact.BLOCK_RENTAL'],
      );
    });
  });

  describe('DE presentation', () => {
    it('renders section title and empty state in German', () => {
      const view = renderActiveDamages('de', { damages: [] });
      cleanup = view.cleanup;
      expect(sectionTitle(view.container)).toBe(
        de['operator.vehicleQuickView.damages.sectionTitle'],
      );
      expect(view.container.textContent).toContain(de['operator.vehicleQuickView.damages.empty']);
    });

    it('renders localized type and severity labels in German', () => {
      const view = renderActiveDamages('de', {
        damages: [damageFixture({ id: 'dmg-1', damageType: 'DENT', severity: 'MAJOR' })],
      });
      cleanup = view.cleanup;
      const row = damageRows(view.container)[0];
      expect(rowTitle(row)).toContain(de['operator.damageCapture.damageType.DENT']);
      expect(rowTitle(row)).toContain(de['operator.damageCapture.severity.MAJOR']);
    });
  });

  describe('dynamic data freeze', () => {
    it('preserves locationLabel verbatim across locales', () => {
      const location = 'Stoßfänger hinten links – Kratzer XYZ-42';
      const enView = renderActiveDamages('en', {
        damages: [damageFixture({ id: 'dmg-1', locationLabel: location })],
      });
      const deView = renderActiveDamages('de', {
        damages: [damageFixture({ id: 'dmg-1', locationLabel: location })],
      });
      cleanup = () => {
        enView.cleanup();
        deView.cleanup();
      };
      expect(rowLocation(damageRows(enView.container)[0])).toBe(location);
      expect(rowLocation(damageRows(deView.container)[0])).toBe(location);
    });
  });

  describe('adapter presentation maps', () => {
    it('maps damage type, severity, and impact through operator.damageCapture keys', () => {
      expect(operatorVehicleQuickViewActiveDamagesTypeLabel('en', 'SCRATCH')).toBe(
        en['operator.damageCapture.damageType.SCRATCH'],
      );
      expect(operatorVehicleQuickViewActiveDamagesSeverityLabel('de', 'MODERATE')).toBe(
        de['operator.damageCapture.severity.MODERATE'],
      );
      expect(operatorVehicleQuickViewActiveDamagesImpactLabel('en', 'WATCH')).toBe(
        en['operator.damageCapture.rentalImpact.WATCH'],
      );
      expect(operatorVehicleQuickViewActiveDamagesRowTitle('en', {
        damageType: 'SCRATCH',
        severity: 'MINOR',
      })).toContain(en['operator.damageCapture.damageType.SCRATCH']);
    });
  });

  describe('count and order regression', () => {
    it('preserves damage count, order, and IDs across locales', () => {
      const damages = [
        damageFixture({ id: 'dmg-alpha', damageType: 'SCRATCH', severity: 'MINOR' }),
        damageFixture({ id: 'dmg-beta', damageType: 'DENT', severity: 'MAJOR' }),
      ];
      const enView = renderActiveDamages('en', { damages });
      const deView = renderActiveDamages('de', { damages });
      cleanup = () => {
        enView.cleanup();
        deView.cleanup();
      };
      expect(damageRows(enView.container)).toHaveLength(2);
      expect(damageRows(deView.container)).toHaveLength(2);
      expect(rowTitle(damageRows(enView.container)[0])).toContain(
        en['operator.damageCapture.damageType.SCRATCH'],
      );
      expect(rowTitle(damageRows(deView.container)[0])).toContain(
        de['operator.damageCapture.damageType.SCRATCH'],
      );
    });

    it('limits visible rows to five damages', () => {
      const damages = Array.from({ length: 6 }, (_, index) =>
        damageFixture({ id: `dmg-${index}`, damageType: 'SCRATCH', severity: 'MINOR' }),
      );
      const view = renderActiveDamages('en', { damages });
      cleanup = view.cleanup;
      expect(damageRows(view.container)).toHaveLength(5);
    });
  });

  describe('same-mount locale switch', () => {
    it('updates labels without remounting active damages', () => {
      const view = renderWithLocale('de', createElement(LocaleSwitchHarness));
      cleanup = view.cleanup;
      expect(view.container.textContent).toContain(
        de['operator.vehicleQuickView.damages.sectionTitle'],
      );
      expect(view.container.textContent).toContain(de['operator.damageCapture.rentalImpact.WATCH']);

      const toggle = view.container.querySelector('button') as HTMLButtonElement;
      act(() => toggle.click());

      expect(view.container.textContent).toContain(
        en['operator.vehicleQuickView.damages.sectionTitle'],
      );
      expect(view.container.textContent).toContain(en['operator.damageCapture.rentalImpact.WATCH']);
      expect(view.container.textContent).not.toContain('operator.vehicleQuickView.damages');
    });
  });

  describe('raw key and machine-code leakage guards', () => {
    it('does not render raw translation keys or unmapped severity codes when labels exist', () => {
      const view = renderActiveDamages('en');
      cleanup = view.cleanup;
      expect(view.container.textContent).not.toContain('operator.vehicleQuickView.damages');
      expect(view.container.textContent).not.toContain('operator.damageCapture');
      expect(rowTitle(damageRows(view.container)[0])).not.toContain('MODERATE');
      expect(operatorVehicleQuickViewActiveDamagesSectionTitle('en')).toBe(
        en['operator.vehicleQuickView.damages.sectionTitle'],
      );
    });
  });
});
