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
};

const ALLOWED_TAX_RATES = [0, 7, 19];

export function normalizeTaxRate(rate: number | undefined | null): number {
  if (rate == null || !Number.isFinite(rate)) return 19;
  const r = Math.round(rate);
  return ALLOWED_TAX_RATES.includes(r) ? r : 19;
}

export function computeInvoiceTotals(
  items: InvoiceLineItemInput[],
  fallbackTotalCents?: number,
): InvoiceTotals {
  if (!items.length) {
    const total = fallbackTotalCents ?? 0;
    const taxRate = 19;
    const subtotalCents = Math.round(total / (1 + taxRate / 100));
    const taxCents = total - subtotalCents;
    return {
      lineItems: [],
      subtotalCents,
      taxCents,
      totalCents: total,
    };
  }

  const lineItems: InvoiceLineItemComputed[] = items.map((item) => {
    const qty = Math.max(0, item.quantity || 1);
    const unitNet = Math.max(0, Math.round(item.unitPriceNetCents || 0));
    const taxRate = normalizeTaxRate(item.taxRate);
    const netCents = Math.round(unitNet * qty);
    const taxCents = Math.round((netCents * taxRate) / 100);
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

  return { lineItems, subtotalCents, taxCents, totalCents };
}

/** Parse legacy lineItems JSON into structured inputs. */
export function parseLegacyLineItems(raw: unknown): InvoiceLineItemInput[] {
  if (!Array.isArray(raw)) return [];
  const out: InvoiceLineItemInput[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const desc = String(r.description ?? r.name ?? 'Position');
    const qty = Number(r.quantity ?? 1);
    let unitNet = 0;
    if (r.unitPriceNetCents != null) unitNet = Number(r.unitPriceNetCents);
    else if (r.unitPriceCents != null) unitNet = Number(r.unitPriceCents);
    else if (r.totalCents != null && qty > 0) {
      const gross = Number(r.totalCents);
      unitNet = Math.round(gross / qty / 1.19);
    }
    out.push({
      description: desc,
      quantity: Number.isFinite(qty) ? qty : 1,
      unitPriceNetCents: Number.isFinite(unitNet) ? unitNet : 0,
      taxRate: normalizeTaxRate(Number(r.taxRate)),
      category: typeof r.category === 'string' ? r.category : undefined,
      bookingId: typeof r.bookingId === 'string' ? r.bookingId : undefined,
      vehicleId: typeof r.vehicleId === 'string' ? r.vehicleId : undefined,
    });
  }
  return out;
}
