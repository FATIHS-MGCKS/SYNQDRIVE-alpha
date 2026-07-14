import { describe, expect, it } from 'vitest';

import { de } from '../../i18n/translations/de';
import type { TranslationKey } from '../../i18n/translations/en';
import {
  buildInvoiceLineItemsPanel,
  buildTaxBreakdown,
  inferUnitLabel,
  rentalDaysLineItemExample,
} from './invoiceLineItems.mapper';
import type { Invoice, InvoiceLineItem } from './invoiceTypes';

const t = (key: TranslationKey, vars?: Record<string, string | number>) => {
  let text = de[key] ?? key;
  if (vars) {
    Object.entries(vars).forEach(([k, v]) => {
      text = text.replace(`{${k}}`, String(v));
    });
  }
  return text;
};

const baseInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 'inv-1',
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
  lineItems: [],
  subtotalCents: 0,
  taxCents: 0,
  totalCents: 0,
  paidCents: 0,
  outstandingCents: 0,
  currency: 'EUR',
  invoiceDate: '2026-07-01',
  dueDate: null,
  status: 'ISSUED',
  templateId: null,
  imageUrl: null,
  extractedData: null,
  notes: '',
  paidAt: null,
  createdAt: '2026-07-01T10:00:00Z',
  ...overrides,
});

describe('invoiceLineItems.mapper', () => {
  it('infers Tage unit from rental description', () => {
    expect(inferUnitLabel('Fahrzeugmiete (5 Tage)')).toBe('Tage');
  });

  it('renders single line with reconciled 5×600€ gross example', () => {
    const line = rentalDaysLineItemExample();
    const panel = buildInvoiceLineItemsPanel(
      baseInvoice({
        lineItems: [line],
        subtotalCents: 50420,
        taxCents: 9580,
        totalCents: 60000,
        outstandingCents: 60000,
      }),
      t,
    );

    expect(panel).not.toBeNull();
    expect(panel!.lines).toHaveLength(1);
    expect(panel!.lines[0].quantity).toBe(5);
    expect(panel!.lines[0].unitLabel).toBe('Tage');
    expect(panel!.lines[0].grossCents).toBe(60000);
    expect(panel!.lines[0].netCents).toBe(50420);
    expect(panel!.totalsReconciled).toBe(true);
    expect(panel!.totalCents).toBe(60000);
  });

  it('supports many line items', () => {
    const items: InvoiceLineItem[] = Array.from({ length: 12 }, (_, i) => ({
      description: `Zusatz ${i + 1}`,
      quantity: 1,
      unitPriceNetCents: 1000,
      taxRate: 19,
      netCents: 1000,
      taxCents: 190,
      grossCents: 1190,
    }));
    const panel = buildInvoiceLineItemsPanel(
      baseInvoice({
        lineItems: items,
        subtotalCents: 12000,
        taxCents: 2280,
        totalCents: 14280,
      }),
      t,
    );
    expect(panel!.lines).toHaveLength(12);
  });

  it('handles long descriptions without truncation in data model', () => {
    const longDesc = 'Lang '.repeat(40).trim();
    const panel = buildInvoiceLineItemsPanel(
      baseInvoice({
        lineItems: [{ description: longDesc, quantity: 1, unitPriceNetCents: 5000, taxRate: 19, netCents: 5000, taxCents: 950, grossCents: 5950 }],
        subtotalCents: 5000,
        taxCents: 950,
        totalCents: 5950,
      }),
      t,
    );
    expect(panel!.lines[0].description.length).toBeGreaterThan(100);
  });

  it('breaks down multiple tax rates', () => {
    const panel = buildInvoiceLineItemsPanel(
      baseInvoice({
        lineItems: [
          { description: 'Standard', quantity: 1, unitPriceNetCents: 10000, taxRate: 19, netCents: 10000, taxCents: 1900, grossCents: 11900 },
          { description: 'Ermäßigt', quantity: 1, unitPriceNetCents: 5000, taxRate: 7, netCents: 5000, taxCents: 350, grossCents: 5350 },
        ],
        subtotalCents: 15000,
        taxCents: 2250,
        totalCents: 17250,
      }),
      t,
    );
    expect(panel!.taxBreakdown).toHaveLength(2);
    expect(buildTaxBreakdown(panel!.lines).map((r) => r.taxRate)).toEqual([7, 19]);
  });

  it('labels tax-free lines', () => {
    const panel = buildInvoiceLineItemsPanel(
      baseInvoice({
        lineItems: [{ description: 'Versicherung', quantity: 1, unitPriceNetCents: 2000, taxRate: 0, netCents: 2000, taxCents: 0, grossCents: 2000 }],
        subtotalCents: 2000,
        taxCents: 0,
        totalCents: 2000,
      }),
      t,
    );
    expect(panel!.lines[0].isTaxFree).toBe(true);
    expect(panel!.lines[0].taxRateLabel).toBe('Steuerfrei');
  });

  it('detects discount/credit lines and credited invoice status', () => {
    const discountPanel = buildInvoiceLineItemsPanel(
      baseInvoice({
        lineItems: [
          { description: 'Miete', quantity: 1, unitPriceNetCents: 10000, taxRate: 19, netCents: 10000, taxCents: 1900, grossCents: 11900 },
          { description: 'Rabatt Sommeraktion', quantity: 1, unitPriceNetCents: -1000, taxRate: 19, netCents: -1000, taxCents: -190, grossCents: -1190 },
        ],
        subtotalCents: 9000,
        taxCents: 1710,
        totalCents: 10710,
      }),
      t,
    );
    expect(discountPanel!.hasCredits).toBe(true);

    const creditedPanel = buildInvoiceLineItemsPanel(
      baseInvoice({
        status: 'CREDITED',
        creditedAt: '2026-07-10T10:00:00Z',
        lineItems: [{ description: 'Miete', quantity: 1, unitPriceNetCents: 10000, taxRate: 19, netCents: 10000, taxCents: 1900, grossCents: 11900 }],
        subtotalCents: 10000,
        taxCents: 1900,
        totalCents: 11900,
      }),
      t,
    );
    expect(creditedPanel!.creditLabel).toBe('Rechnung gutgeschrieben');
    expect(creditedPanel!.creditCents).toBe(11900);
  });
});
