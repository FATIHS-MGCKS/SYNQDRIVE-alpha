export interface InvoiceLineItemView {
  id: string;
  description: string;
  quantity: number;
  unitLabel: string | null;
  unitPriceNetCents: number;
  taxRate: number;
  taxRateLabel: string;
  isTaxFree: boolean;
  netCents: number;
  taxCents: number;
  grossCents: number;
  isCreditOrDiscount: boolean;
}

export interface InvoiceTaxBreakdownRow {
  taxRate: number;
  taxRateLabel: string;
  netCents: number;
  taxCents: number;
}

export interface InvoiceLineItemsPanel {
  currency: string;
  lines: InvoiceLineItemView[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  paidCents: number;
  outstandingCents: number;
  taxBreakdown: InvoiceTaxBreakdownRow[];
  hasCredits: boolean;
  creditCents: number;
  creditLabel: string | null;
  totalsReconciled: boolean;
}
