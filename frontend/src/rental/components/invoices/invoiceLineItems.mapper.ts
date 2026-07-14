import type { TranslationKey } from '../../i18n/translations/en';
import { formatAmount } from './invoiceFormatters';
import type { InvoiceLineItemView, InvoiceLineItemsPanel, InvoiceTaxBreakdownRow } from './invoiceLineItemTypes';
import type { Invoice, InvoiceLineItem } from './invoiceTypes';

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

const ALLOWED_TAX_RATES = [0, 7, 19];

export function normalizeTaxRate(rate: number | undefined | null): number {
  if (rate == null || !Number.isFinite(rate)) return 19;
  const rounded = Math.round(rate);
  return ALLOWED_TAX_RATES.includes(rounded) ? rounded : 19;
}

export function inferUnitLabel(description: string, raw?: InvoiceLineItem): string | null {
  const explicit = (raw as { unit?: string; unitLabel?: string } | undefined)?.unit
    ?? (raw as { unitLabel?: string } | undefined)?.unitLabel;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  if (/\bTage\b/i.test(description)) return 'Tage';
  if (/\bStunden?\b/i.test(description)) return 'Std.';
  if (/\bkm\b/i.test(description)) return 'km';
  return null;
}

export function taxRateLabel(rate: number, t: Translate): string {
  if (rate === 0) return t('invoiceLineItem.tax.free');
  return t('invoiceLineItem.tax.rate', { rate });
}

function parseLineInput(item: InvoiceLineItem, index: number): InvoiceLineItemView {
  const quantity = Number.isFinite(item.quantity) ? item.quantity : 1;
  const taxRate = normalizeTaxRate(item.taxRate);
  const unitPriceNetCents = Math.round(item.unitPriceNetCents ?? item.unitPriceCents ?? 0);

  let netCents = item.netCents;
  let taxCents = item.taxCents;
  let grossCents = item.grossCents ?? item.totalCents;

  if (netCents == null) {
    netCents = Math.round(unitPriceNetCents * quantity);
  }
  if (taxCents == null) {
    taxCents = Math.round((netCents * taxRate) / 100);
  }
  if (grossCents == null) {
    grossCents = netCents + taxCents;
  }

  const description = item.description?.trim() || 'Position';
  const isCreditOrDiscount =
    grossCents < 0 ||
    netCents < 0 ||
    /rabatt|gutschrift|discount|credit/i.test(description);

  return {
    id: `line-${index}`,
    description,
    quantity,
    unitLabel: inferUnitLabel(description, item),
    unitPriceNetCents,
    taxRate,
    taxRateLabel: taxRate === 0 ? 'tax-free' : `${taxRate}`,
    isTaxFree: taxRate === 0,
    netCents,
    taxCents,
    grossCents,
    isCreditOrDiscount,
  };
}

export function buildTaxBreakdown(lines: InvoiceLineItemView[]): InvoiceTaxBreakdownRow[] {
  const map = new Map<number, { netCents: number; taxCents: number }>();
  for (const line of lines) {
    const bucket = map.get(line.taxRate) ?? { netCents: 0, taxCents: 0 };
    bucket.netCents += line.netCents;
    bucket.taxCents += line.taxCents;
    map.set(line.taxRate, bucket);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([taxRate, amounts]) => ({
      taxRate,
      taxRateLabel: `${taxRate}`,
      netCents: amounts.netCents,
      taxCents: amounts.taxCents,
    }));
}

export function formatInvoiceMoney(cents: number, currency: string): string {
  return formatAmount(cents, currency);
}

export function formatQuantityWithUnit(quantity: number, unitLabel: string | null): string {
  if (unitLabel) return `${quantity} ${unitLabel}`;
  return String(quantity);
}

export function formatUnitTimesPrice(
  quantity: number,
  unitPriceNetCents: number,
  currency: string,
  unitLabel: string | null,
  t: Translate,
): string {
  const qtyLabel = formatQuantityWithUnit(quantity, unitLabel);
  const unitPrice = formatInvoiceMoney(unitPriceNetCents, currency);
  return t('invoiceLineItem.mobile.qtyTimesPrice', { qty: qtyLabel, price: unitPrice });
}

export function buildInvoiceLineItemsPanel(invoice: Invoice, t: Translate): InvoiceLineItemsPanel | null {
  const rawItems = Array.isArray(invoice.lineItems) ? invoice.lineItems : [];
  if (rawItems.length === 0) return null;

  const currency = invoice.currency || 'EUR';
  const lines = rawItems.map((item, index) => {
    const parsed = parseLineInput(item, index);
    return {
      ...parsed,
      taxRateLabel: taxRateLabel(parsed.taxRate, t),
    };
  });

  const computedSubtotal = lines.reduce((sum, line) => sum + line.netCents, 0);
  const computedTax = lines.reduce((sum, line) => sum + line.taxCents, 0);
  const computedGross = lines.reduce((sum, line) => sum + line.grossCents, 0);

  const subtotalCents = invoice.subtotalCents ?? computedSubtotal;
  const taxCents = invoice.taxCents ?? computedTax;
  const totalCents = invoice.totalCents ?? computedGross;

  const totalsReconciled =
    subtotalCents === computedSubtotal &&
    taxCents === computedTax &&
    totalCents === computedGross;

  const creditLines = lines.filter((line) => line.isCreditOrDiscount);
  const creditedByStatus = invoice.status === 'CREDITED' || Boolean(invoice.creditedAt);
  const creditFromLines = creditLines.reduce((sum, line) => sum + Math.abs(line.grossCents), 0);
  const hasCredits = creditedByStatus || creditLines.length > 0;
  const creditCents = creditedByStatus ? totalCents : creditFromLines;

  return {
    currency,
    lines,
    subtotalCents,
    taxCents,
    totalCents,
    paidCents: invoice.paidCents,
    outstandingCents: invoice.outstandingCents,
    taxBreakdown: buildTaxBreakdown(lines),
    hasCredits,
    creditCents,
    creditLabel: creditedByStatus ? t('invoiceLineItem.summary.creditNote') : null,
    totalsReconciled,
  };
}

/** Regression case: 5 rental days → 600,00 € gross with 19% VAT. */
export function rentalDaysLineItemExample(): InvoiceLineItem {
  return {
    description: 'Fahrzeugmiete (5 Tage)',
    quantity: 5,
    unitPriceNetCents: 10084,
    taxRate: 19,
    netCents: 50420,
    taxCents: 9580,
    grossCents: 60000,
  };
}
