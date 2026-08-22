// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@iconify/react', () => ({
  Icon: () => null,
  disableCache: vi.fn(),
}));

const mockCreate = vi.fn(async () => ({
  id: 'inv-1',
  type: 'OUTGOING_MANUAL',
  title: 'Test Invoice',
  status: 'DRAFT',
}));

vi.mock('../../lib/api', () => ({
  api: {
    invoices: {
      create: mockCreate,
      uploadFile: vi.fn(async () => ({ url: '/uploads/test.pdf' })),
    },
  },
}));

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import { CreateInvoiceDialog } from './invoices/CreateInvoiceDialog';
import { getInvoiceThemeClasses } from './invoices/invoiceTheme';
import {
  CREATE_INVOICE_TEMPLATE_IDS,
  CREATE_INVOICE_TYPE_VALUES,
  CREATE_INVOICE_VAT_RATE,
  formatCreateInvoiceAmount,
  labelCreateInvoiceType,
} from '../lib/create-invoice-i18n';

const __dirname = dirname(fileURLToPath(import.meta.url));

const P221_ENFORCE_CLEAN_EXACT = [
  'rental/components/invoices/CreateInvoiceDialog.tsx',
  'rental/lib/create-invoice-i18n.ts',
];

const lookup = {
  customers: [{ id: 'cust-1', firstName: 'Anna', lastName: 'Müller' }],
  vehicles: [
    {
      id: 'veh-1',
      make: 'BMW',
      model: 'X3',
      licensePlate: 'M-AB 1234',
      vin: 'WBA1234567890ABCDE',
    },
  ],
  vendors: [{ id: 'ven-1', name: 'Werkstatt Nord GmbH' }],
};

function isP221EnforceCleanPath(relPath: string): boolean {
  return P221_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p221ScopedFindings() {
  return inventory.findings.filter((finding) => isP221EnforceCleanPath(finding.file));
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

function renderCreateDialog(locale: 'de' | 'en', onCreated = vi.fn()) {
  const theme = getInvoiceThemeClasses(false);
  return renderWithLocale(
    locale,
    createElement(CreateInvoiceDialog, {
      ...theme,
      orgId: 'org-1',
      lookup,
      onClose: vi.fn(),
      onCreated,
    }),
  );
}

describe('rental Create Invoice Dialog localization (P2.2.21)', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  describe('enforce-clean inventory', () => {
    it('reports zero P221 scoped findings', () => {
      expect(p221ScopedFindings()).toHaveLength(0);
    });
  });

  describe('machine semantics', () => {
    it('preserves invoice type machine values', () => {
      expect(CREATE_INVOICE_TYPE_VALUES).toEqual(['OUTGOING_MANUAL', 'INCOMING_VENDOR']);
    });

    it('preserves template ID machine values', () => {
      expect(CREATE_INVOICE_TEMPLATE_IDS).toEqual(['standard', 'booking', 'damage', 'extra']);
    });

    it('preserves VAT rate machine value', () => {
      expect(CREATE_INVOICE_VAT_RATE).toBe(19);
    });

    it('localizes type labels without changing machine keys', () => {
      expect(labelCreateInvoiceType('en', 'OUTGOING_MANUAL')).toBe(
        en['invoices.list.type.OUTGOING_MANUAL'],
      );
      expect(labelCreateInvoiceType('de', 'INCOMING_VENDOR')).toBe(
        de['invoices.list.type.INCOMING_VENDOR'],
      );
    });

    it('formats amounts with locale-aware currency display', () => {
      expect(formatCreateInvoiceAmount('en', 12345, 'EUR')).toContain('123');
      expect(formatCreateInvoiceAmount('de', 12345, 'EUR')).toContain('123');
    });
  });

  describe('EN render', () => {
    it('shows localized type step title in English', () => {
      const view = renderCreateDialog('en');
      cleanup = view.cleanup;
      expect(view.container.textContent).toContain(en['invoices.create.typeStep.title']);
      expect(view.container.textContent).not.toContain(de['invoices.create.typeStep.title']);
    });
  });

  describe('DE render', () => {
    it('shows localized type step title in German', () => {
      const view = renderCreateDialog('de');
      cleanup = view.cleanup;
      expect(view.container.textContent).toContain(de['invoices.create.typeStep.title']);
    });
  });

  describe('runtime locale switch', () => {
    it('switches locale at runtime without stale labels', async () => {
      const enView = renderCreateDialog('en');
      await act(async () => {});
      expect(enView.container.textContent).toContain(en['invoices.create.typeStep.title']);
      enView.cleanup();

      const deView = renderCreateDialog('de');
      cleanup = deView.cleanup;
      await act(async () => {});
      expect(deView.container.textContent).toContain(de['invoices.create.typeStep.title']);
      expect(deView.container.textContent).not.toContain(en['invoices.create.typeStep.title']);
    });
  });

  describe('dynamic business data preservation', () => {
    it('keeps customer names unchanged under EN', async () => {
      const view = renderCreateDialog('en');
      cleanup = view.cleanup;

      const outgoingBtn = [...view.container.querySelectorAll('button')].find((btn) =>
        btn.textContent?.includes(en['invoices.list.type.OUTGOING_MANUAL']),
      );
      expect(outgoingBtn).toBeTruthy();
      await act(async () => {
        outgoingBtn?.click();
      });

      expect(view.container.textContent).toContain('Anna Müller');
    });
  });

  describe('payload regression', () => {
    it('submits outgoing invoice payload with frozen machine semantics', async () => {
      const onCreated = vi.fn();
      const view = renderCreateDialog('en', onCreated);
      cleanup = view.cleanup;

      const outgoingBtn = [...view.container.querySelectorAll('button')].find((btn) =>
        btn.textContent?.includes(en['invoices.list.type.OUTGOING_MANUAL']),
      );
      await act(async () => {
        outgoingBtn?.click();
      });

      const titleInput = view.container.querySelector('input') as HTMLInputElement;
      await act(async () => {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        )?.set;
        nativeInputValueSetter?.call(titleInput, 'Fleet service');
        titleInput.dispatchEvent(new Event('input', { bubbles: true }));
        titleInput.dispatchEvent(new Event('change', { bubbles: true }));
      });

      const createBtn = [...view.container.querySelectorAll('button')].find((btn) =>
        btn.textContent?.includes(en['invoices.createInvoice']),
      );
      await act(async () => {
        createBtn?.click();
      });

      expect(mockCreate).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({
          type: 'OUTGOING_MANUAL',
          title: 'Fleet service',
          currency: 'EUR',
          lineItems: expect.arrayContaining([
            expect.objectContaining({
              quantity: 1,
              taxRate: 19,
              unitPriceNetCents: 0,
            }),
          ]),
        }),
      );
    });
  });

  describe('calculation regression', () => {
    it('uses unchanged VAT calculation constant', () => {
      const subtotal = 10000;
      const tax = Math.round(subtotal * (CREATE_INVOICE_VAT_RATE / 100));
      expect(tax).toBe(1900);
      expect(subtotal + tax).toBe(11900);
    });
  });

  describe('source guards', () => {
    it('uses translation keys in CreateInvoiceDialog source', () => {
      const source = readFileSync(join(__dirname, 'invoices/CreateInvoiceDialog.tsx'), 'utf8');
      expect(source).toContain("t('invoices.create.typeStep.title')");
      expect(source).not.toMatch(/Rechnungsart wählen/);
    });
  });
});
