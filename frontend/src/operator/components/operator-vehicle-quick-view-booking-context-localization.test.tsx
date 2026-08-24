// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { act, createElement, type ComponentProps, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import {
  formatOperatorVehicleQuickViewDateTime,
  operatorVehicleQuickViewBookingKindLabel,
  operatorVehicleQuickViewBookingSectionTitle,
  type OperatorVehicleQuickViewBookingKind,
} from '../lib/operator-vehicle-quick-view-i18n';
import { OperatorVehicleQuickViewBookingContext } from './OperatorVehicleQuickViewBookingContext';

const P231_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorVehicleQuickViewBookingContext.tsx',
  'operator/lib/operator-vehicle-quick-view-i18n.ts',
];

function isP231EnforceCleanPath(relPath: string): boolean {
  return P231_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p231ScopedFindings() {
  return inventory.findings.filter((finding) => isP231EnforceCleanPath(finding.file));
}

const BOOKING_KINDS: OperatorVehicleQuickViewBookingKind[] = [
  'pickup',
  'return',
  'active',
  'reserved',
];

const BOOKING_KIND_KEYS = [
  'operator.vehicleQuickView.booking.kind.pickup',
  'operator.vehicleQuickView.booking.kind.return',
  'operator.vehicleQuickView.booking.kind.active',
  'operator.vehicleQuickView.booking.kind.reserved',
] as const;

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

function renderBookingContext(
  locale: 'de' | 'en',
  props: Partial<ComponentProps<typeof OperatorVehicleQuickViewBookingContext>> = {},
) {
  const view = renderWithLocale(
    locale,
    createElement(OperatorVehicleQuickViewBookingContext, {
      kind: 'pickup',
      customerName: 'Max Mustermann',
      when: '2026-08-24T10:30:00.000Z',
      station: 'Berlin Mitte',
      ...props,
    }),
  );
  return view;
}

function LocaleSwitchHarness(
  props: Partial<ComponentProps<typeof OperatorVehicleQuickViewBookingContext>>,
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
    createElement(OperatorVehicleQuickViewBookingContext, {
      kind: 'pickup',
      customerName: 'Max Mustermann',
      when: '2026-08-24T10:30:00.000Z',
      station: 'Berlin Mitte',
      ...props,
    }),
  );
}

function sectionTitle(container: HTMLElement): string {
  return container.querySelector('h3')?.textContent?.trim() ?? '';
}

function bookingContextRoot(container: HTMLElement): HTMLElement {
  return container.querySelector('[aria-label]') as HTMLElement;
}

function kindLabel(container: HTMLElement): string {
  return (
    bookingContextRoot(container)?.querySelector('.text-sm.font-semibold')?.textContent?.trim() ??
    ''
  );
}

function customerName(container: HTMLElement): string {
  const root = bookingContextRoot(container);
  const paragraphs = root?.querySelectorAll('p') ?? [];
  return paragraphs[1]?.textContent?.trim() ?? '';
}

function datetimeLine(container: HTMLElement): string {
  const root = bookingContextRoot(container);
  const paragraphs = root?.querySelectorAll('p') ?? [];
  return paragraphs[2]?.textContent?.trim() ?? '';
}

describe('operator Vehicle Quick View Booking Context localization (P2.2.31)', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  describe('enforce-clean inventory', () => {
    it('reports zero P231 scoped findings', () => {
      expect(p231ScopedFindings()).toHaveLength(0);
    });
  });

  describe('EN presentation', () => {
    it('renders section title and pickup kind label in English', () => {
      const view = renderBookingContext('en', { kind: 'pickup' });
      cleanup = view.cleanup;
      expect(sectionTitle(view.container)).toBe(
        en['operator.vehicleQuickView.booking.sectionTitle'],
      );
      expect(kindLabel(view.container)).toBe(
        en['operator.vehicleQuickView.booking.kind.pickup'],
      );
    });

    it('renders customer name and station without translation', () => {
      const view = renderBookingContext('en', {
        customerName: 'Jane Doe',
        station: 'Munich Airport',
      });
      cleanup = view.cleanup;
      expect(customerName(view.container)).toBe('Jane Doe');
      expect(datetimeLine(view.container)).toContain('Munich Airport');
    });

    it('formats datetime with English locale', () => {
      const view = renderBookingContext('en', { when: '2026-08-24T10:30:00.000Z' });
      cleanup = view.cleanup;
      const expected = formatOperatorVehicleQuickViewDateTime('en', '2026-08-24T10:30:00.000Z');
      expect(datetimeLine(view.container)).toContain(expected);
    });
  });

  describe('DE presentation', () => {
    it('renders section title and return kind label in German', () => {
      const view = renderBookingContext('de', { kind: 'return' });
      cleanup = view.cleanup;
      expect(sectionTitle(view.container)).toBe(
        de['operator.vehicleQuickView.booking.sectionTitle'],
      );
      expect(kindLabel(view.container)).toBe(de['operator.vehicleQuickView.booking.kind.return']);
    });

    it('formats datetime with German locale', () => {
      const view = renderBookingContext('de', { when: '2026-08-24T10:30:00.000Z' });
      cleanup = view.cleanup;
      const expected = formatOperatorVehicleQuickViewDateTime('de', '2026-08-24T10:30:00.000Z');
      expect(datetimeLine(view.container)).toContain(expected);
    });
  });

  describe('kind label maps', () => {
    it.each(BOOKING_KINDS)('maps %s kind to canonical translation keys', (kind) => {
      expect(operatorVehicleQuickViewBookingKindLabel('en', kind)).toBe(
        en[`operator.vehicleQuickView.booking.kind.${kind}`],
      );
      expect(operatorVehicleQuickViewBookingKindLabel('de', kind)).toBe(
        de[`operator.vehicleQuickView.booking.kind.${kind}`],
      );
    });
  });

  describe('same-mount locale switch', () => {
    it('updates labels without remounting booking context', () => {
      const view = renderWithLocale('de', createElement(LocaleSwitchHarness, { kind: 'active' }));
      cleanup = view.cleanup;
      expect(view.container.textContent).toContain(
        de['operator.vehicleQuickView.booking.kind.active'],
      );

      const toggle = view.container.querySelector('button') as HTMLButtonElement;
      act(() => toggle.click());

      expect(view.container.textContent).toContain(
        en['operator.vehicleQuickView.booking.kind.active'],
      );
      expect(view.container.textContent).not.toContain('operator.vehicleQuickView.booking');
    });
  });

  describe('adapter presentation maps', () => {
    it('maps booking section title and kind labels without raw key leakage', () => {
      expect(operatorVehicleQuickViewBookingSectionTitle('en')).toBe(
        en['operator.vehicleQuickView.booking.sectionTitle'],
      );
      expect(operatorVehicleQuickViewBookingSectionTitle('de')).toBe(
        de['operator.vehicleQuickView.booking.sectionTitle'],
      );
      for (const key of BOOKING_KIND_KEYS) {
        expect(key).toMatch(/^operator\.vehicleQuickView\.booking\.kind\./);
      }
    });
  });
});
