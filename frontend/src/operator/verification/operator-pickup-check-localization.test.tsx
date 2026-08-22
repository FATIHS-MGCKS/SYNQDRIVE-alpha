// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockSubmitManualPickupCheck } = vi.hoisted(() => ({
  mockSubmitManualPickupCheck: vi.fn(async () => ({ ok: true })),
}));

vi.mock('../../lib/api', () => ({
  api: {
    customerVerification: {
      submitManualPickupCheck: mockSubmitManualPickupCheck,
    },
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import {
  OPERATOR_PICKUP_CHECK_FIELDS,
  operatorPickupCheckFieldLabel,
} from '../lib/operator-pickup-check-i18n';
import { OperatorPickupCheckSheet } from './OperatorPickupCheckSheet';
import {
  buildManualPickupCheckPayload,
  DEFAULT_OPERATOR_PICKUP_CHECK_FORM,
} from './operatorPickupCheckPayload';

const P225_ENFORCE_CLEAN_EXACT = [
  'operator/verification/OperatorPickupCheckSheet.tsx',
  'operator/lib/operator-pickup-check-i18n.ts',
  'operator/verification/operatorPickupCheckPayload.ts',
];

const baseProps = {
  customerId: 'cust-7',
  bookingId: 'bk-42',
  customerName: 'Alex Müller',
  onClose: vi.fn(),
  onSuccess: vi.fn(),
};

function isP225EnforceCleanPath(relPath: string): boolean {
  return P225_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p225ScopedFindings() {
  return inventory.findings.filter((finding) => isP225EnforceCleanPath(finding.file));
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

function renderSheet(locale: 'de' | 'en') {
  return renderWithLocale(
    locale,
    createElement(OperatorPickupCheckSheet, baseProps),
  );
}

describe('operator Pickup Verification localization (P2.2.25)', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  describe('enforce-clean inventory', () => {
    it('reports zero P225 scoped findings', () => {
      expect(p225ScopedFindings()).toHaveLength(0);
    });
  });

  describe('EN presentation', () => {
    it('renders localized title and checklist labels', () => {
      const view = renderSheet('en');
      cleanup = view.cleanup;
      const text = view.container.textContent ?? '';
      expect(text).toContain(en['operator.pickupCheck.title']);
      expect(text).toContain(en['operator.pickupCheck.checklist.idDocumentSeen']);
      expect(text).toContain(en['operator.pickupCheck.fields.notes']);
      expect(text).toContain('Alex Müller');
      expect(text).not.toContain('Ausweis gesehen');
    });
  });

  describe('DE presentation', () => {
    it('renders localized title and checklist labels', () => {
      const view = renderSheet('de');
      cleanup = view.cleanup;
      const text = view.container.textContent ?? '';
      expect(text).toContain(de['operator.pickupCheck.title']);
      expect(text).toContain(de['operator.pickupCheck.checklist.idDocumentSeen']);
      expect(text).toContain(de['operator.pickupCheck.fields.notes']);
      expect(text).toContain('Alex Müller');
      expect(text).not.toContain('Pickup verification');
    });
  });

  describe('checklist adapter', () => {
    it('maps machine field keys to localized labels without leaking keys', () => {
      const enLabel = operatorPickupCheckFieldLabel('en', 'drivingLicenseSeen');
      const deLabel = operatorPickupCheckFieldLabel('de', 'drivingLicenseSeen');
      expect(enLabel).toBe(en['operator.pickupCheck.checklist.drivingLicenseSeen']);
      expect(deLabel).toBe(de['operator.pickupCheck.checklist.drivingLicenseSeen']);
      expect(enLabel).not.toContain('drivingLicenseSeen');
    });

    it('preserves canonical checklist field order', () => {
      expect(OPERATOR_PICKUP_CHECK_FIELDS.map((item) => item.field)).toEqual([
        'idDocumentSeen',
        'idNameMatchesBooking',
        'idDateOfBirthChecked',
        'minimumAgePassed',
        'drivingLicenseSeen',
        'licenseNameMatchesBooking',
        'licenseClassValid',
        'licenseNotExpired',
        'minimumLicenseDurationPassed',
      ]);
    });
  });

  describe('boolean checklist regression', () => {
    it('toggles representative checklist fields', async () => {
      const view = renderSheet('en');
      cleanup = view.cleanup;
      const boxes = view.container.querySelectorAll('input[type="checkbox"]');
      expect(boxes.length).toBe(9);
      expect((boxes[0] as HTMLInputElement).checked).toBe(false);
      await act(async () => {
        (boxes[0] as HTMLInputElement).click();
      });
      expect((boxes[0] as HTMLInputElement).checked).toBe(true);
      await act(async () => {
        (boxes[0] as HTMLInputElement).click();
      });
      expect((boxes[0] as HTMLInputElement).checked).toBe(false);
    });
  });

  describe('runtime locale switch', () => {
    it('updates chrome and preserves checklist state on same mount EN → DE', async () => {
      function LocaleSwitchButton({ target }: { target: 'de' | 'en' }) {
        const { setLocale } = useLanguage();
        return createElement(
          'button',
          {
            type: 'button',
            'data-testid': `switch-locale-${target}`,
            onClick: () => setLocale(target),
          },
          target.toUpperCase(),
        );
      }

      const view = renderWithLocale(
        'en',
        createElement(
          'div',
          null,
          createElement(LocaleSwitchButton, { target: 'de' }),
          createElement(OperatorPickupCheckSheet, baseProps),
        ),
      );
      cleanup = view.cleanup;

      const boxes = view.container.querySelectorAll('input[type="checkbox"]');
      await act(async () => {
        (boxes[0] as HTMLInputElement).click();
      });

      expect(view.container.textContent).toContain(en['operator.pickupCheck.title']);
      expect((boxes[0] as HTMLInputElement).checked).toBe(true);

      const switchBtn = document.querySelector('[data-testid="switch-locale-de"]') as HTMLButtonElement;
      await act(async () => {
        switchBtn.click();
      });

      expect(view.container.textContent).toContain(de['operator.pickupCheck.title']);
      expect((boxes[0] as HTMLInputElement).checked).toBe(true);
      expect(view.container.textContent).toContain('Alex Müller');
    });
  });

  describe('payload regression', () => {
    it('builds unchanged ManualPickupCheckDto payload', () => {
      const payload = buildManualPickupCheckPayload({
        customerId: 'cust-7',
        bookingId: 'bk-42',
        ...DEFAULT_OPERATOR_PICKUP_CHECK_FORM,
        idDocumentSeen: true,
        drivingLicenseSeen: true,
        notes: 'Pickup note 42 — rear key present',
      });
      expect(payload.customerId).toBe('cust-7');
      expect(payload.bookingId).toBe('bk-42');
      expect(payload.idDocumentSeen).toBe(true);
      expect(payload.drivingLicenseSeen).toBe(true);
      expect(payload.minimumLicenseDurationPassed).toBe(true);
      expect(payload.notes).toBe('Pickup note 42 — rear key present');
    });

    it('submits payload with stable boolean keys via API mock', async () => {
      const view = renderSheet('en');
      cleanup = view.cleanup;
      const boxes = view.container.querySelectorAll('input[type="checkbox"]');
      await act(async () => {
        (boxes[0] as HTMLInputElement).click();
        (boxes[4] as HTMLInputElement).click();
      });
      const saveBtn = Array.from(view.container.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes(en['operator.pickupCheck.actions.save']),
      );
      await act(async () => {
        saveBtn?.click();
      });
      expect(mockSubmitManualPickupCheck).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'cust-7',
          bookingId: 'bk-42',
          idDocumentSeen: true,
          drivingLicenseSeen: true,
        }),
      );
    });
  });
});
