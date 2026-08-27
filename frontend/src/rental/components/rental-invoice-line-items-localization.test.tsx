// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';

vi.mock('@iconify/react', () => ({
  Icon: () => null,
  disableCache: vi.fn(),
}));

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import {
  buildInvoiceLineItemsPanel,
  buildTaxBreakdown,
  formatInvoiceMoney,
  inferUnitLabel,
  normalizeTaxRate,
  rentalDaysLineItemExample,
} from './invoices/invoiceLineItems.mapper';
import { inferUnitKind } from '../lib/rental-invoice-line-items-i18n';
import { InvoiceLineItems } from './invoices/InvoiceLineItems';
import type { Invoice } from './invoices/invoiceTypes';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import type { TranslationKey } from '../../i18n/translations/en';

const P253_ENFORCE_CLEAN_EXACT = [
  'rental/components/invoices/InvoiceLineItems.tsx',
  'rental/components/invoices/invoiceLineItems.mapper.ts',
  'rental/lib/rental-invoice-line-items-i18n.ts',
];

const RAW_DESCRIPTION = 'Zusatzleistung Sonderfall X7';
const EXPLICIT_UNIT = 'Paket X7';

const theme = {
  card: 'card',
  tp: 'text-foreground',
  ts: 'text-muted-foreground',
  inputCls: 'input',
  isDarkMode: false,
};

function isP253EnforceCleanPath(relPath: string): boolean {
  return P253_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function sampleInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-p253',
    invoiceNumber: 1,
    invoiceNumberDisplay: 'FSM-2026-0001',
    type: 'OUTGOING_BOOKING',
    customerId: null,
    vendorId: null,
    vendorName: null,
    bookingId: null,
    vehicleId: null,
    title: 'Test',
    description: '',
    lineItems: [
      {
        description: RAW_DESCRIPTION,
        quantity: 1,
        unitLabel: EXPLICIT_UNIT,
        unitPriceNetCents: 1234,
        taxRate: 19,
        netCents: 1234,
        taxCents: 234,
        grossCents: 1468,
      },
      rentalDaysLineItemExample(),
      {
        description: 'Beratung (2 Stunden)',
        quantity: 2,
        unitPriceNetCents: 5000,
        taxRate: 7,
        netCents: 10000,
        taxCents: 700,
        grossCents: 10700,
      },
      {
        description: 'Kilometerpauschale 120 km',
        quantity: 1,
        unitPriceNetCents: 2500,
        taxRate: 19,
        netCents: 2500,
        taxCents: 475,
        grossCents: 2975,
      },
      {
        description: 'Rabatt Sommeraktion',
        quantity: 1,
        unitPriceNetCents: -1000,
        taxRate: 19,
        netCents: -1000,
        taxCents: -190,
        grossCents: -1190,
      },
    ],
    subtotalCents: 62154,
    taxCents: 1219,
    totalCents: 63373,
    paidCents: 10000,
    outstandingCents: 53373,
    currency: 'EUR',
    invoiceDate: '2026-07-01',
    dueDate: '2026-07-15',
    status: 'PARTIALLY_PAID',
    templateId: null,
    imageUrl: null,
    extractedData: null,
    generatedDocumentId: null,
    notes: '',
    paidAt: null,
    createdAt: '2026-07-01T10:00:00Z',
    ...overrides,
  };
}

const translate =
  (dict: Record<string, string>) =>
  (key: TranslationKey, vars?: Record<string, string | number>) => {
    let text = dict[key] ?? key;
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, String(v));
      });
    }
    return text;
  };

const tDe = translate(de);
const tEn = translate(en);

describe('P2.2.53 rental invoice line items localization', () => {
  it('has zero P253 enforce-clean scanner debt', () => {
    const scoped = inventory.findings.filter((f) => isP253EnforceCleanPath(f.file));
    expect(scoped).toHaveLength(0);
  });

  it('formats money differently per locale without changing raw cents', () => {
    const invoice = sampleInvoice();
    const dePanel = buildInvoiceLineItemsPanel(invoice, tDe, 'de');
    const enPanel = buildInvoiceLineItemsPanel(invoice, tEn, 'en');
    expect(dePanel!.subtotalCents).toBe(enPanel!.subtotalCents);
    expect(dePanel!.lines[0].grossCents).toBe(1468);
    expect(formatInvoiceMoney(1234, 'EUR', 'de')).not.toBe(formatInvoiceMoney(1234, 'EUR', 'en'));
  });

  it('preserves raw description, quantity, cents, tax rates, and order', () => {
    const panel = buildInvoiceLineItemsPanel(sampleInvoice(), tDe, 'de');
    expect(panel!.lines.map((l) => l.id)).toEqual(['line-0', 'line-1', 'line-2', 'line-3', 'line-4']);
    expect(panel!.lines[0].description).toBe(RAW_DESCRIPTION);
    expect(panel!.lines[0].quantity).toBe(1);
    expect(panel!.lines[0].unitPriceNetCents).toBe(1234);
    expect(panel!.lines[0].taxRate).toBe(19);
    expect(panel!.lines[1].quantity).toBe(5);
    expect(panel!.lines[4].isCreditOrDiscount).toBe(true);
    expect(buildTaxBreakdown(panel!.lines).map((r) => r.taxRate)).toEqual([7, 19]);
  });

  it('localizes inferred unit labels without changing inference patterns', () => {
    expect(inferUnitLabel('Fahrzeugmiete (5 Tage)')).toBe('Tage');
    expect(inferUnitKind('Beratung (2 Stunden)')).toBe('hours');
    expect(inferUnitKind('Kilometerpauschale 120 km')).toBe('km');

    const dePanel = buildInvoiceLineItemsPanel(sampleInvoice(), tDe, 'de');
    const enPanel = buildInvoiceLineItemsPanel(sampleInvoice(), tEn, 'en');
    expect(dePanel!.lines[1].unitLabel).toBe('Tage');
    expect(enPanel!.lines[1].unitLabel).toBe('days');
    expect(dePanel!.lines[2].unitLabel).toBe('Std.');
    expect(enPanel!.lines[2].unitLabel).toBe('hrs');
    expect(dePanel!.lines[3].unitLabel).toBe('km');
    expect(enPanel!.lines[3].unitLabel).toBe('km');
  });

  it('preserves explicit raw unit labels', () => {
    const panel = buildInvoiceLineItemsPanel(sampleInvoice(), tEn, 'en');
    expect(panel!.lines[0].unitLabel).toBe(EXPLICIT_UNIT);
  });

  it('keeps financial calculation semantics unchanged', () => {
    const line = rentalDaysLineItemExample();
    const quantity = Number.isFinite(line.quantity) ? line.quantity : 1;
    const taxRate = normalizeTaxRate(line.taxRate);
    const unitPriceNetCents = Math.round(line.unitPriceNetCents ?? 0);
    const netCents = line.netCents ?? Math.round(unitPriceNetCents * quantity);
    const taxCents = line.taxCents ?? Math.round((netCents * taxRate) / 100);
    const grossCents = line.grossCents ?? netCents + taxCents;
    expect({ quantity, taxRate, unitPriceNetCents, netCents, taxCents, grossCents }).toEqual({
      quantity: 5,
      taxRate: 19,
      unitPriceNetCents: 10084,
      netCents: 50420,
      taxCents: 9580,
      grossCents: 60000,
    });
  });

  it('preserves same-mount list across DE↔EN', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    function SameMountApp() {
      const { setLocale } = useLanguage();
      return createElement(
        'div',
        null,
        createElement('button', {
          type: 'button',
          'data-testid': 'locale-de',
          onClick: () => setLocale('de'),
        }, 'DE'),
        createElement('button', {
          type: 'button',
          'data-testid': 'locale-en',
          onClick: () => setLocale('en'),
        }, 'EN'),
        createElement(InvoiceLineItems, {
          invoice: sampleInvoice(),
          ...theme,
        }),
      );
    }

    await act(async () => {
      root.render(createElement(LanguageProvider, null, createElement(SameMountApp)));
    });

    const section = () => container.querySelector('[data-testid="invoice-line-items-section"]');

    await act(async () => {
      container.querySelector('[data-testid="locale-de"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    expect(section()?.textContent).toContain('Positionen');
    expect(section()?.textContent).toContain(RAW_DESCRIPTION);
    expect(section()?.textContent).toContain(EXPLICIT_UNIT);
    expect(section()?.textContent).toContain('Tage');

    await act(async () => {
      container.querySelector('[data-testid="locale-en"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    expect(section()?.textContent).toContain('Line items');
    expect(section()?.textContent).toContain(RAW_DESCRIPTION);
    expect(section()?.textContent).toContain(EXPLICIT_UNIT);
    expect(section()?.textContent).toContain('days');

    await act(async () => {
      root.unmount();
      container.remove();
    });
  });

  it('keeps empty line items behavior unchanged', () => {
    const panel = buildInvoiceLineItemsPanel(sampleInvoice({ lineItems: [] }), tDe, 'de');
    expect(panel).toBeNull();
  });
});
