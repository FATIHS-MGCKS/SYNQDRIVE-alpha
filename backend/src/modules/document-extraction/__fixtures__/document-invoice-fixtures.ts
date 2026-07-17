export const INVOICE_COMPLETE_19 = {
  invoiceNumber: 'INV-2026-001',
  invoiceDate: '2026-03-10',
  dueDate: '2026-04-09',
  currency: 'EUR',
  supplier: 'Werkstatt Müller GmbH',
  vendorName: 'Werkstatt Müller GmbH',
  customer: 'SynqDrive Fleet GmbH',
  subtotalNet: 10000,
  netCents: 10000,
  totalTax: 1900,
  taxCents: 1900,
  totalGross: 11900,
  grossCents: 11900,
  totalCents: 11900,
  taxRatePercent: 19,
  amountSemantics: 'GROSS',
  taxSemantics: 'EXPLICIT',
  lineItems: [
    {
      description: 'Ölwechsel',
      quantity: 1,
      unitPriceNetCents: 10000,
      taxRate: 19,
      netCents: 10000,
      taxCents: 1900,
      grossCents: 11900,
    },
  ],
};

export const INVOICE_MULTI_RATE = {
  invoiceNumber: 'INV-MIX-1',
  invoiceDate: '2026-03-11',
  currency: 'EUR',
  amountSemantics: 'EXPLICIT',
  taxSemantics: 'EXPLICIT',
  subtotalNet: 8000,
  totalTax: 1160,
  totalGross: 9160,
  taxLines: [
    { taxRatePercent: 19, netCents: 5000, taxCents: 950, grossCents: 5950 },
    { taxRatePercent: 7, netCents: 3000, taxCents: 210, grossCents: 3210 },
  ],
};

export const INVOICE_TAX_FREE = {
  invoiceNumber: 'INV-TF-1',
  invoiceDate: '2026-03-12',
  currency: 'EUR',
  subtotalNet: 5000,
  totalTax: 0,
  totalGross: 5000,
  taxSemantics: 'TAX_FREE',
  taxExemptReason: '§4 UStG — innergemeinschaftliche Lieferung',
  amountSemantics: 'GROSS',
};

export const INVOICE_REVERSE_CHARGE = {
  invoiceNumber: 'INV-RC-1',
  invoiceDate: '2026-03-13',
  currency: 'EUR',
  reverseCharge: true,
  subtotalNet: 20000,
  totalTax: 0,
  totalGross: 20000,
  taxSemantics: 'TAX_FREE',
  taxExemptReason: 'Reverse charge — §13b UStG',
  amountSemantics: 'EXPLICIT',
};

export const INVOICE_CREDIT_NOTE = {
  invoiceNumber: 'CN-2026-001',
  creditNoteReference: 'INV-2026-001',
  originalInvoiceReference: 'INV-2026-001',
  invoiceDate: '2026-03-14',
  currency: 'EUR',
  isCreditNote: true,
  totalGross: -5950,
  grossCents: -5950,
  totalCents: -5950,
  netCents: -5000,
  taxCents: -950,
  taxRatePercent: 19,
  amountSemantics: 'GROSS',
  taxSemantics: 'EXPLICIT',
};

export const INVOICE_UNCLEAR_SEMANTICS = {
  invoiceNumber: 'INV-UNK-1',
  invoiceDate: '2026-03-15',
  totalCents: 10000,
};

export const INVOICE_ROUNDING_WARNING = {
  invoiceNumber: 'INV-RND-1',
  invoiceDate: '2026-03-16',
  currency: 'EUR',
  subtotalNet: 10000,
  totalTax: 1900,
  totalGross: 11901,
  amountSemantics: 'EXPLICIT',
  taxSemantics: 'EXPLICIT',
};

export const INVOICE_NET_GROSS_BLOCKER = {
  invoiceNumber: 'INV-BAD-1',
  invoiceDate: '2026-03-17',
  currency: 'EUR',
  subtotalNet: 10000,
  totalTax: 1900,
  totalGross: 12500,
  amountSemantics: 'EXPLICIT',
  taxSemantics: 'EXPLICIT',
};

export const INVOICE_MISSING_CURRENCY = {
  invoiceNumber: 'INV-NO-CUR',
  invoiceDate: '2026-03-18',
  subtotalNet: 10000,
  totalTax: 1900,
  totalGross: 11900,
  amountSemantics: 'EXPLICIT',
  taxSemantics: 'EXPLICIT',
};
