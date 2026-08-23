// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { act, createElement, type ComponentProps, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import type { VehicleHealthResponse } from '../../lib/api';
import type { VehicleData } from '../../rental/data/vehicles';
import { VEHICLE_OPERATIONAL_STATUS } from '../../rental/lib/vehicle-operational-state';
import {
  operatorVehicleQuickViewPrimaryStatusLabel,
  operatorVehicleQuickViewReleaseLabel,
  operatorVehicleQuickViewRentalHealthStateLabel,
} from '../lib/operator-vehicle-quick-view-i18n';
import type { OperatorVehicleStatusSnapshot } from '../lib/operatorVehicleQuickView.utils';
import {
  OperatorVehicleQuickViewHeader,
  OperatorVehicleQuickViewHeaderNotFound,
} from './OperatorVehicleQuickViewHeader';

const P228_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorVehicleQuickViewHeader.tsx',
  'operator/lib/operator-vehicle-quick-view-i18n.ts',
];

function isP228EnforceCleanPath(relPath: string): boolean {
  return P228_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p228ScopedFindings() {
  return inventory.findings.filter((finding) => isP228EnforceCleanPath(finding.file));
}

function vehicleFixture(overrides: Partial<VehicleData> = {}): VehicleData {
  return {
    id: 'veh-qv-228',
    license: 'KS-QV 228',
    model: 'Fleet Unit 42',
    year: 2024,
    station: 'Berlin Central',
    fuelType: 'Electric',
    status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
    cleaningStatus: 'Clean',
    healthStatus: 'Good Health',
    online: true,
    lastSignal: new Date().toISOString(),
    badge: 0,
    odometer: 10000,
    fuel: 80,
    battery: 90,
    speed: 0,
    coolant: 90,
    brakes: 95,
    tires: 90,
    engineOil: 90,
    isElectric: true,
    hvBatteryCapacityKwh: 75,
    leasingRate: '',
    insuranceCost: '',
    taxCost: '',
    totalMonthlyCost: '',
    ...overrides,
  } as VehicleData;
}

function snapshotFixture(
  overrides: Partial<OperatorVehicleStatusSnapshot> = {},
): OperatorVehicleStatusSnapshot {
  return {
    primaryStatus: 'ready',
    primaryLabel: 'Bereit',
    primaryTone: 'success',
    releaseDecision: 'yes',
    releaseLabel: 'Ja',
    releaseTone: 'success',
    contradictions: [],
    healthAvailable: true,
    ...overrides,
  };
}

function healthFixture(overrides: Partial<VehicleHealthResponse> = {}): VehicleHealthResponse {
  const module = {
    state: 'good' as const,
    reason: '',
    last_updated_at: '2026-08-23T10:00:00.000Z',
    data_stale: false,
  };
  return {
    vehicle_id: 'veh-qv-228',
    organization_id: 'org-1',
    overall_state: 'good',
    rental_blocked: false,
    blocking_reasons: [],
    modules: {
      battery: module,
      tires: module,
      brakes: module,
      error_codes: module,
      service_compliance: module,
      complaints: module,
      vehicle_alerts: module,
    },
    generated_at: '2026-08-23T10:00:00.000Z',
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

function renderHeader(
  locale: 'de' | 'en',
  props: Partial<ComponentProps<typeof OperatorVehicleQuickViewHeader>> = {},
) {
  const onClose = vi.fn();
  const onReloadDetails = vi.fn();
  const view = renderWithLocale(
    locale,
    createElement(OperatorVehicleQuickViewHeader, {
      vehicle: vehicleFixture(),
      snapshot: snapshotFixture(),
      health: healthFixture(),
      healthLoading: false,
      onClose,
      onReloadDetails,
      ...props,
    }),
  );
  return { ...view, onClose, onReloadDetails };
}

function LocaleSwitchHarness({
  onClose,
}: {
  onClose: () => void;
}) {
  const { locale, setLocale } = useLanguage();
  return createElement(
    'div',
    null,
    createElement(
      'button',
      { type: 'button', onClick: () => setLocale(locale === 'de' ? 'en' : 'de') },
      'toggle-locale',
    ),
    createElement(OperatorVehicleQuickViewHeader, {
      vehicle: vehicleFixture(),
      snapshot: snapshotFixture(),
      health: healthFixture(),
      healthLoading: false,
      onClose,
      onReloadDetails: () => undefined,
    }),
  );
}

describe('operator Vehicle Quick View Header & Primary Status localization (P2.2.28)', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  describe('enforce-clean inventory', () => {
    it('reports zero P228 scoped findings', () => {
      expect(p228ScopedFindings()).toHaveLength(0);
    });
  });

  describe('EN presentation', () => {
    it('renders header chrome and primary status labels in English', () => {
      const view = renderHeader('en');
      cleanup = view.cleanup;
      expect(view.container.textContent).toContain('KS-QV 228');
      expect(view.container.textContent).toContain('Fleet Unit 42');
      expect(view.container.textContent).toContain(en['dashboard.label.ready']);
      expect(view.container.textContent).toContain(en['operator.vehicleQuickView.header.releaseQuestion']);
      expect(view.container.textContent).toContain(en['operator.vehicleQuickView.header.release.yes']);
      expect(view.container.textContent).toContain(en['health.state.good']);
    });

    it('renders not-found chrome in English', () => {
      const view = renderWithLocale('en', createElement(OperatorVehicleQuickViewHeaderNotFound));
      cleanup = view.cleanup;
      expect(view.container.textContent).toContain(en['operator.vehicleQuickView.header.notFound']);
    });
  });

  describe('DE presentation', () => {
    it('renders header chrome and primary status labels in German', () => {
      const view = renderHeader('de');
      cleanup = view.cleanup;
      expect(view.container.textContent).toContain('KS-QV 228');
      expect(view.container.textContent).toContain('Fleet Unit 42');
      expect(view.container.textContent).toContain(de['dashboard.label.ready']);
      expect(view.container.textContent).toContain(de['operator.vehicleQuickView.header.releaseQuestion']);
      expect(view.container.textContent).toContain(de['operator.vehicleQuickView.header.release.yes']);
      expect(view.container.textContent).toContain(de['health.state.good']);
    });

    it('renders not-found chrome in German', () => {
      const view = renderWithLocale('de', createElement(OperatorVehicleQuickViewHeaderNotFound));
      cleanup = view.cleanup;
      expect(view.container.textContent).toContain(de['operator.vehicleQuickView.header.notFound']);
    });
  });

  describe('fixed-DE regression', () => {
    it('uses active locale for primary status instead of hardcoded German snapshot labels', () => {
      const viewEn = renderHeader('en', {
        snapshot: snapshotFixture({ primaryLabel: 'Bereit', releaseLabel: 'Ja' }),
      });
      cleanup = viewEn.cleanup;
      expect(viewEn.container.textContent).toContain(en['dashboard.label.ready']);
      expect(viewEn.container.textContent).not.toContain('Bereit');
      expect(viewEn.container.textContent).toContain(en['operator.vehicleQuickView.header.release.yes']);
    });

    it('maps adapter labels through canonical keys for EN and DE', () => {
      expect(operatorVehicleQuickViewPrimaryStatusLabel('en', 'blocked')).toBe(
        en['dashboard.label.blocked'],
      );
      expect(operatorVehicleQuickViewPrimaryStatusLabel('de', 'rented')).toBe(
        de['operator.vehicleQuickView.header.primaryStatus.rented'],
      );
      expect(operatorVehicleQuickViewReleaseLabel('en', 'review')).toBe(
        en['operator.vehicleQuickView.header.release.review'],
      );
      expect(operatorVehicleQuickViewRentalHealthStateLabel('de', 'warning')).toBe(
        de['health.state.warning'],
      );
    });
  });

  describe('status style regression', () => {
    it('keeps success tone class for ready primary status across locales', () => {
      const viewEn = renderHeader('en');
      const toneEn = viewEn.container.querySelector('.sq-chip-success');
      viewEn.cleanup();

      const viewDe = renderHeader('de');
      cleanup = viewDe.cleanup;
      const toneDe = viewDe.container.querySelector('.sq-chip-success');

      expect(toneEn).not.toBeNull();
      expect(toneDe).not.toBeNull();
    });

    it('keeps critical tone class for blocked primary status across locales', () => {
      const blockedSnapshot = snapshotFixture({
        primaryStatus: 'blocked',
        primaryTone: 'critical',
        releaseDecision: 'no',
        releaseTone: 'critical',
      });
      const viewEn = renderHeader('en', { snapshot: blockedSnapshot });
      const toneEn = viewEn.container.querySelector('.sq-chip-critical');
      viewEn.cleanup();

      const viewDe = renderHeader('de', { snapshot: blockedSnapshot });
      cleanup = viewDe.cleanup;
      const toneDe = viewDe.container.querySelector('.sq-chip-critical');

      expect(toneEn).not.toBeNull();
      expect(toneDe).not.toBeNull();
    });
  });

  describe('dynamic data preservation', () => {
    it('preserves vehicle identity across locale switch on same mount', () => {
      const onClose = vi.fn();
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);
      window.localStorage.setItem('synqdrive.locale', 'de');
      act(() => {
        root.render(
          createElement(LanguageProvider, null, createElement(LocaleSwitchHarness, { onClose })),
        );
      });
      cleanup = () => {
        act(() => root.unmount());
        container.remove();
      };

      expect(container.textContent).toContain('KS-QV 228');
      expect(container.textContent).toContain('Fleet Unit 42');
      expect(container.textContent).toContain(de['operator.vehicleQuickView.header.releaseQuestion']);

      act(() => {
        container.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(container.textContent).toContain('KS-QV 228');
      expect(container.textContent).toContain('Fleet Unit 42');
      expect(container.textContent).toContain(en['operator.vehicleQuickView.header.releaseQuestion']);
    });
  });

  describe('callback regression', () => {
    it('invokes onClose with the same semantics under EN and DE', () => {
      const viewDe = renderHeader('de');
      const closeDe = viewDe.container.querySelector('button[aria-label]') as HTMLButtonElement;
      closeDe?.click();
      expect(viewDe.onClose).toHaveBeenCalledTimes(1);
      viewDe.cleanup();

      const viewEn = renderHeader('en');
      cleanup = viewEn.cleanup;
      const closeEn = viewEn.container.querySelector('button[aria-label]') as HTMLButtonElement;
      closeEn?.click();
      expect(viewEn.onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('accessibility regression', () => {
    it('localizes close aria-label per locale', () => {
      const viewDe = renderHeader('de');
      const closeDe = viewDe.container.querySelector('button[aria-label]') as HTMLButtonElement;
      expect(closeDe?.getAttribute('aria-label')).toBe(de['common.close']);
      viewDe.cleanup();

      const viewEn = renderHeader('en');
      cleanup = viewEn.cleanup;
      const closeEn = viewEn.container.querySelector('button[aria-label]') as HTMLButtonElement;
      expect(closeEn?.getAttribute('aria-label')).toBe(en['common.close']);
    });
  });

  describe('cleaning chip regression', () => {
    it('renders localized cleaning pending chip when machine state requires cleaning', () => {
      const viewEn = renderHeader('en', {
        vehicle: vehicleFixture({ cleaningStatus: 'Needs Cleaning' }),
      });
      cleanup = viewEn.cleanup;
      expect(viewEn.container.textContent).toContain(en['dashboard.fleet.cleaningPending']);
    });
  });
});
