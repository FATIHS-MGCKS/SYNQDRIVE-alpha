import {
  grossCentsFromNetCents,
  legacyGrossSplitMeta,
  normalizeTaxRate,
  netCentsFromGrossCents,
  resolveOrgDefaultTaxRate,
  splitGrossCents,
  SYSTEM_DEFAULT_VAT_RATE,
  taxCentsFromNetCents,
  type OrgTaxSettings,
  type TaxComputationMeta,
} from './invoice-tax.util';

export type InvoiceLineItemInput = {
  description: string;
  quantity: number;
  unitPriceNetCents: number;
  taxRate: number;
  category?: string;
  bookingId?: string;
  vehicleId?: string;
};

export type InvoiceLineItemComputed = InvoiceLineItemInput & {
  netCents: number;
  taxCents: number;
  grossCents: number;
};

export type InvoiceTotals = {
  lineItems: InvoiceLineItemComputed[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  taxMeta?: TaxComputationMeta | null;
};

export type ComputeInvoiceTotalsOptions = {
  defaultTaxRate?: number;
  orgTax?: OrgTaxSettings;
};

export function resolveDefaultTaxRateForInvoice(options?: ComputeInvoiceTotalsOptions): number {
  if (options?.defaultTaxRate != null) {
    return normalizeTaxRate(options.defaultTaxRate, SYSTEM_DEFAULT_VAT_RATE);
  }
  if (options?.orgTax) {
    return resolveOrgDefaultTaxRate(options.orgTax);
  }
  return SYSTEM_DEFAULT_VAT_RATE;
}

export { normalizeTaxRate, netCentsFromGrossCents, taxCentsFromNetCents, splitGrossCents };

export function computeInvoiceTotals(
  items: InvoiceLineItemInput[],
  fallbackTotalCents?: number,
  options?: ComputeInvoiceTotalsOptions,
): InvoiceTotals {
  const defaultTaxRate = resolveDefaultTaxRateForInvoice(options);

  if (!items.length) {
    const total = fallbackTotalCents ?? 0;
    const split = splitGrossCents(total, defaultTaxRate);
    return {
      lineItems: [],
      subtotalCents: split.netCents,
      taxCents: split.taxCents,
      totalCents: split.grossCents,
      taxMeta:
        total > 0
          ? legacyGrossSplitMeta(
              defaultTaxRate,
              'Keine Positionen — Bruttobetrag mit Organisations-Standardsteuersatz aufgeteilt',
            )
          : null,
    };
  }

  const lineItems: InvoiceLineItemComputed[] = items.map((item) => {
    const qty = Math.max(0, item.quantity || 1);
    const unitNet = Math.max(0, Math.round(item.unitPriceNetCents || 0));
    const taxRate = normalizeTaxRate(item.taxRate, defaultTaxRate);
    const netCents = Math.round(unitNet * qty);
    const taxCents = taxCentsFromNetCents(netCents, taxRate);
    const grossCents = netCents + taxCents;
    return {
      ...item,
      quantity: qty,
      unitPriceNetCents: unitNet,
      taxRate,
      netCents,
      taxCents,
      grossCents,
    };
  });

  const subtotalCents = lineItems.reduce((s, l) => s + l.netCents, 0);
  const taxCents = lineItems.reduce((s, l) => s + l.taxCents, 0);
  const totalCents = subtotalCents + taxCents;

  return { lineItems, subtotalCents, taxCents, totalCents, taxMeta: null };
}

function inferTaxRateFromLegacyRow(
  row: Record<string, unknown>,
  defaultTaxRate: number,
): { taxRate: number; meta?: TaxComputationMeta } {
  if (row.taxRate != null && Number.isFinite(Number(row.taxRate))) {
    return { taxRate: normalizeTaxRate(Number(row.taxRate), defaultTaxRate) };
  }
  const net = row.netCents != null ? Number(row.netCents) : NaN;
  const tax = row.taxCents != null ? Number(row.taxCents) : NaN;
  if (Number.isFinite(net) && net > 0 && Number.isFinite(tax) && tax >= 0) {
    const inferred = Math.round((tax / net) * 100);
    if ([0, 7, 19].includes(inferred)) {
      return { taxRate: inferred };
    }
  }
  const gross = row.totalCents != null ? Number(row.totalCents) : row.grossCents != null ? Number(row.grossCents) : NaN;
  if (Number.isFinite(gross) && gross > 0) {
    return {
      taxRate: defaultTaxRate,
      meta: legacyGrossSplitMeta(
        defaultTaxRate,
        'Legacy-Position ohne Steuersatz — Brutto mit Standardsteuersatz aufgeteilt',
      ),
    };
  }
  return { taxRate: defaultTaxRate };
}

/** Parse legacy lineItems JSON into structured inputs. */
export function parseLegacyLineItems(
  raw: unknown,
  options?: ComputeInvoiceTotalsOptions,
): InvoiceLineItemInput[] {
  if (!Array.isArray(raw)) return [];
  const defaultTaxRate = resolveDefaultTaxRateForInvoice(options);
  const out: InvoiceLineItemInput[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const desc = String(r.description ?? r.name ?? 'Position');
    const qty = Number(r.quantity ?? 1);
    const { taxRate } = inferTaxRateFromLegacyRow(r, defaultTaxRate);
    let unitNet = 0;
    if (r.unitPriceNetCents != null) unitNet = Number(r.unitPriceNetCents);
    else if (r.unitPriceCents != null) unitNet = Number(r.unitPriceCents);
    else if (r.netCents != null && qty > 0) unitNet = Math.round(Number(r.netCents) / qty);
    else if (r.totalCents != null && qty > 0) {
      const gross = Number(r.totalCents);
      unitNet = Math.round(netCentsFromGrossCents(gross, taxRate) / qty);
    } else if (r.grossCents != null && qty > 0) {
      const gross = Number(r.grossCents);
      unitNet = Math.round(netCentsFromGrossCents(gross, taxRate) / qty);
    }
    out.push({
      description: desc,
      quantity: Number.isFinite(qty) ? qty : 1,
      unitPriceNetCents: Number.isFinite(unitNet) ? unitNet : 0,
      taxRate,
      category: typeof r.category === 'string' ? r.category : undefined,
      bookingId: typeof r.bookingId === 'string' ? r.bookingId : undefined,
      vehicleId: typeof r.vehicleId === 'string' ? r.vehicleId : undefined,
    });
  }
  return out;
}
