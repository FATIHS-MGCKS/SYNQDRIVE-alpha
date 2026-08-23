// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { act, createElement, type ComponentProps, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import type { BookingHandoverGate } from '../../rental/lib/bookingHandoverGates';
import {
  operatorVehicleQuickViewQuickActionCreateBookingLabel,
  operatorVehicleQuickViewQuickActionPickupLabel,
  operatorVehicleQuickViewQuickActionReturnLabel,
} from '../lib/operator-vehicle-quick-view-i18n';
import { OperatorVehicleQuickViewQuickActions } from './OperatorVehicleQuickViewQuickActions';

const P229_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorVehicleQuickViewQuickActions.tsx',
  'operator/lib/operator-vehicle-quick-view-i18n.ts',
];

function isP229EnforceCleanPath(relPath: string): boolean {
  return P229_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p229ScopedFindings() {
  return inventory.findings.filter((finding) => isP229EnforceCleanPath(finding.file));
}

const allowedGate: BookingHandoverGate = { allowed: true };
const blockedGate: BookingHandoverGate = {
  allowed: false,
  reasonKey: 'handover.gates.pickupWrongStatus',
};

const vehicleLabel = 'Fleet Unit 42 · KS-QA 229';
const customerName = 'Distinctive Customer P229';

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

function renderQuickActions(
  locale: 'de' | 'en',
  props: Partial<ComponentProps<typeof OperatorVehicleQuickViewQuickActions>> = {},
) {
  const onPickup = vi.fn();
  const onReturn = vi.fn();
  const onCreateBooking = vi.fn();
  const view = renderWithLocale(
    locale,
    createElement(OperatorVehicleQuickViewQuickActions, {
      pickupVisible: true,
      pickupDisabled: false,
      pickupCustomerName: customerName,
      pickupGate: allowedGate,
      returnVisible: true,
      returnDisabled: false,
      returnCustomerName: customerName,
      returnGate: allowedGate,
      vehicleLabel,
      onPickup,
      onReturn,
      onCreateBooking,
      ...props,
    }),
  );
  return { ...view, onPickup, onReturn, onCreateBooking };
}

function LocaleSwitchHarness(
  props: Partial<ComponentProps<typeof OperatorVehicleQuickViewQuickActions>>,
) {
  const { locale, setLocale } = useLanguage();
  const onPickup = vi.fn();
  const onReturn = vi.fn();
  const onCreateBooking = vi.fn();
  return createElement(
    'div',
    null,
    createElement(
      'button',
      { type: 'button', onClick: () => setLocale(locale === 'de' ? 'en' : 'de') },
      'toggle-locale',
    ),
    createElement(OperatorVehicleQuickViewQuickActions, {
      pickupVisible: true,
      pickupDisabled: false,
      pickupCustomerName: customerName,
      pickupGate: allowedGate,
      returnVisible: true,
      returnDisabled: false,
      returnCustomerName: customerName,
      returnGate: allowedGate,
      vehicleLabel,
      onPickup,
      onReturn,
      onCreateBooking,
      ...props,
    }),
  );
}

function buttonTexts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('button[type="button"]'))
    .filter((button) => button.textContent !== 'toggle-locale')
    .map((button) => button.querySelector('.text-sm.font-semibold')?.textContent?.trim() ?? '');
}

describe('operator Vehicle Quick View Quick Actions localization (P2.2.29)', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  describe('enforce-clean inventory', () => {
    it('reports zero P229 scoped findings', () => {
      expect(p229ScopedFindings()).toHaveLength(0);
    });
  });

  describe('EN presentation', () => {
    it('renders all quick action labels in English with correct order', () => {
      const view = renderQuickActions('en');
      cleanup = view.cleanup;
      expect(buttonTexts(view.container)).toEqual([
        en['vehicle.bookings.startPickup'],
        en['vehicle.bookings.startReturn'],
        en['operator.vehicleQuickView.quickActions.createBooking.title'],
      ]);
      expect(view.container.textContent).toContain(customerName);
      expect(view.container.textContent).toContain(vehicleLabel);
    });

    it('hides pickup and return when not visible while keeping booking action', () => {
      const view = renderQuickActions('en', {
        pickupVisible: false,
        returnVisible: false,
      });
      cleanup = view.cleanup;
      expect(buttonTexts(view.container)).toEqual([
        en['operator.vehicleQuickView.quickActions.createBooking.title'],
      ]);
    });
  });

  describe('DE presentation', () => {
    it('renders all quick action labels in German with correct order', () => {
      const view = renderQuickActions('de');
      cleanup = view.cleanup;
      expect(buttonTexts(view.container)).toEqual([
        de['vehicle.bookings.startPickup'],
        de['vehicle.bookings.startReturn'],
        de['operator.vehicleQuickView.quickActions.createBooking.title'],
      ]);
    });
  });

  describe('same-mount locale switch', () => {
    it('updates labels without losing dynamic vehicle context', () => {
      const view = renderWithLocale('de', createElement(LocaleSwitchHarness, {}));
      cleanup = view.cleanup;
      expect(view.container.textContent).toContain(de['vehicle.bookings.startPickup']);
      expect(view.container.textContent).toContain(customerName);
      expect(view.container.textContent).toContain(vehicleLabel);

      const toggle = view.container.querySelector('button') as HTMLButtonElement;
      act(() => toggle.click());

      expect(view.container.textContent).toContain(en['vehicle.bookings.startPickup']);
      expect(view.container.textContent).toContain(customerName);
      expect(view.container.textContent).toContain(vehicleLabel);
      expect(view.container.textContent).not.toContain('operator.vehicleQuickView.quickActions');
    });
  });

  describe('callback regression', () => {
    it('invokes pickup, return, and booking callbacks with stable semantics', () => {
      const view = renderQuickActions('en');
      cleanup = view.cleanup;
      const buttons = Array.from(view.container.querySelectorAll('button[type="button"]')).filter(
        (button) => button.textContent !== 'toggle-locale',
      );

      act(() => (buttons[0] as HTMLButtonElement).click());
      act(() => (buttons[1] as HTMLButtonElement).click());
      act(() => (buttons[2] as HTMLButtonElement).click());

      expect(view.onPickup).toHaveBeenCalledTimes(1);
      expect(view.onReturn).toHaveBeenCalledTimes(1);
      expect(view.onCreateBooking).toHaveBeenCalledTimes(1);
    });

    it('preserves disabled pickup button without invoking callback', () => {
      const view = renderQuickActions('en', {
        pickupDisabled: true,
        pickupGate: blockedGate,
      });
      cleanup = view.cleanup;
      const pickupButton = view.container.querySelectorAll('button[type="button"]')[0] as HTMLButtonElement;
      expect(pickupButton.disabled).toBe(true);
      act(() => pickupButton.click());
      expect(view.onPickup).not.toHaveBeenCalled();
    });
  });

  describe('adapter presentation maps', () => {
    it('maps machine action identities to canonical keys without raw key leakage', () => {
      expect(operatorVehicleQuickViewQuickActionPickupLabel('en')).toBe(en['vehicle.bookings.startPickup']);
      expect(operatorVehicleQuickViewQuickActionReturnLabel('de')).toBe(de['vehicle.bookings.startReturn']);
      expect(operatorVehicleQuickViewQuickActionCreateBookingLabel('en')).toBe(
        en['operator.vehicleQuickView.quickActions.createBooking.title'],
      );
      expect(operatorVehicleQuickViewQuickActionCreateBookingLabel('de')).toBe(
        de['operator.vehicleQuickView.quickActions.createBooking.title'],
      );
    });
  });
});
