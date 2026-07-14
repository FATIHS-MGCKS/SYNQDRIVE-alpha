import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { de } from '../../i18n/translations/de';
import type { TranslationKey } from '../../i18n/translations/en';
import { InvoiceLineItems } from './InvoiceLineItems';
import { rentalDaysLineItemExample } from './invoiceLineItems.mapper';
import type { Invoice } from './invoiceTypes';

vi.mock('../../i18n/LanguageContext', () => ({
  useLanguage: () => ({
    locale: 'de',
    t: (key: TranslationKey, vars?: Record<string, string | number>) => {
      let text = de[key] ?? key;
      if (vars) {
        Object.entries(vars).forEach(([k, v]) => {
          text = text.replace(`{${k}}`, String(v));
        });
      }
      return text;
    },
  }),
}));

const theme = {
  card: 'card',
  tp: 'text-foreground',
  ts: 'text-muted-foreground',
  inputCls: 'input',
  isDarkMode: false,
};

const sampleInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 'inv-1',
  invoiceNumber: 1,
  invoiceNumberDisplay: 'FSM-2026-0001',
  type: 'OUTGOING_BOOKING',
  customerId: null,
  vendorId: null,
  vendorName: null,
  bookingId: null,
  vehicleId: null,
  title: 'Mietrechnung',
  description: '',
  lineItems: [rentalDaysLineItemExample()],
  subtotalCents: 50420,
  taxCents: 9580,
  totalCents: 60000,
  paidCents: 0,
  outstandingCents: 60000,
  currency: 'EUR',
  invoiceDate: '2026-07-01',
  dueDate: '2026-07-15',
  status: 'ISSUED',
  templateId: null,
  imageUrl: null,
  extractedData: null,
  notes: '',
  paidAt: null,
  createdAt: '2026-07-01T10:00:00Z',
  ...overrides,
});

function renderAtWidth(widthClass: string, invoice: Invoice = sampleInvoice()) {
  return renderToStaticMarkup(
    <div className={widthClass}>
      <InvoiceLineItems invoice={invoice} {...theme} />
    </div>,
  );
}

describe('InvoiceLineItems component', () => {
  it('shows labeled gross total and net unit price for 5-day rental', () => {
    const html = renderAtWidth('w-full');
    expect(html).toContain('Fahrzeugmiete (5 Tage)');
    expect(html).toContain('Einzelpreis (netto)');
    expect(html).toContain('Gesamt (brutto)');
    expect(html).toContain('600,00');
  });

  it('renders summary block with net, tax, gross, paid, outstanding', () => {
    const html = renderAtWidth('w-full');
    expect(html).toContain('invoice-line-items-summary');
    expect(html).toContain('Netto');
    expect(html).toContain('Steuer');
    expect(html).toContain('Brutto');
    expect(html).toContain('Bezahlt');
    expect(html).toContain('Offen');
  });

  it('uses mobile cards without desktop-only cramped table on narrow width', () => {
    const html = renderAtWidth('w-[320px]');
    expect(html).toContain('data-layout="mobile-line-cards"');
    expect(html).toContain('5 Tage');
    expect(html).toContain('Positionsgesamtbetrag (brutto)');
    expect(html).toContain('hidden md:block');
  });

  it('shows tax-free label', () => {
    const html = renderAtWidth(
      'w-full',
      sampleInvoice({
        lineItems: [{ description: 'Versicherung', quantity: 1, unitPriceNetCents: 2000, taxRate: 0, netCents: 2000, taxCents: 0, grossCents: 2000 }],
        subtotalCents: 2000,
        taxCents: 0,
        totalCents: 2000,
      }),
    );
    expect(html).toContain('Steuerfrei');
  });

  it('shows multiple tax rates in summary', () => {
    const html = renderAtWidth(
      'w-full',
      sampleInvoice({
        lineItems: [
          { description: 'A', quantity: 1, unitPriceNetCents: 10000, taxRate: 19, netCents: 10000, taxCents: 1900, grossCents: 11900 },
          { description: 'B', quantity: 1, unitPriceNetCents: 5000, taxRate: 7, netCents: 5000, taxCents: 350, grossCents: 5350 },
        ],
        subtotalCents: 15000,
        taxCents: 2250,
        totalCents: 17250,
      }),
    );
    expect(html).toContain('Steuer (7 %)');
    expect(html).toContain('Steuer (19 %)');
  });

  it('shows credit note for credited invoices', () => {
    const html = renderAtWidth(
      'w-full',
      sampleInvoice({ status: 'CREDITED', creditedAt: '2026-07-10T10:00:00Z' }),
    );
    expect(html).toContain('Rechnung gutgeschrieben');
  });

  it('wraps long descriptions with break-words', () => {
    const longDesc = 'Sehr lange Positionsbeschreibung '.repeat(8).trim();
    const html = renderAtWidth(
      'w-[320px]',
      sampleInvoice({
        lineItems: [{ description: longDesc, quantity: 1, unitPriceNetCents: 1000, taxRate: 19, netCents: 1000, taxCents: 190, grossCents: 1190 }],
        subtotalCents: 1000,
        taxCents: 190,
        totalCents: 1190,
      }),
    );
    expect(html).toContain('break-words');
    expect(html).toContain(longDesc.slice(0, 40));
  });

  it('returns null when no line items', () => {
    const html = renderToStaticMarkup(
      <InvoiceLineItems invoice={sampleInvoice({ lineItems: [] })} {...theme} />,
    );
    expect(html).toBe('');
  });
});

describe('InvoiceLineItems responsive widths', () => {
  ['320px', '375px', '390px', 'tablet', 'desktop'].forEach((label) => {
    const cls =
      label === 'tablet' ? 'w-[768px]' : label === 'desktop' ? 'w-[1280px]' : `w-[${label}]`;

    it(`renders at ${label}`, () => {
      const html = renderAtWidth(cls);
      expect(html).toContain('invoice-line-items-section');
      expect(html).toContain('Positionen');
      expect(html).toContain('Summen');
    });
  });
});
