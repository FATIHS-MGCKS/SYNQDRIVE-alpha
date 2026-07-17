import type { PlausibilityCheck } from './document-extraction-plausibility.service';

export const INVOICE_ROUNDING_TOLERANCE_CENTS = 2;

export type AmountSemanticsStatus = 'EXPLICIT' | 'UNCLEAR' | 'MISSING';
export type TaxSemanticsStatus = 'EXPLICIT' | 'TAX_FREE' | 'UNCLEAR' | 'MISSING';

export type InvoiceTaxLine = {
  taxRatePercent: number | null;
  netCents: number | null;
  taxCents: number | null;
  grossCents: number | null;
};

export type InvoiceLineItem = {
  description: string;
  quantity: number;
  unitPriceNetCents: number | null;
  taxRatePercent: number | null;
  netCents: number | null;
  taxCents: number | null;
  grossCents: number | null;
};

export type InvoiceAmountTaxAssessment = {
  amountSemantics: AmountSemanticsStatus;
  taxSemantics: TaxSemanticsStatus;
  taxLines: InvoiceTaxLine[];
  missingFieldKeys: string[];
};

export type InvoiceApplyGateBlocker = {
  code: string;
  message: string;
  fieldKeys?: string[];
};

export type InvoiceApplyGateResult = {
  canApply: boolean;
  isCreditNote: boolean;
  blockers: InvoiceApplyGateBlocker[];
};

export type InvoiceApplyLineItem = {
  description: string;
  quantity: number;
  unitPriceNetCents: number;
  taxRate: number;
};

const CREDIT_NOTE_SUBTYPES = new Set(['CREDIT_NOTE', 'GUTSCHRIFT', 'CREDIT_MEMO']);

function toStr(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return null;
}

function toNum(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value.trim().replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toDate(value: unknown): Date | null {
  const raw = toStr(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function readCents(data: Record<string, unknown>, key: string): number | null {
  return toNum(data[key]);
}

function readTaxRatePercent(data: Record<string, unknown>): number | null {
  const explicit = data.taxRatePercent ?? data.taxRate;
  if (explicit == null || explicit === '') return null;
  return toNum(explicit);
}

function normalizeTaxLine(raw: unknown): InvoiceTaxLine | null {
  if (raw == null || typeof raw !== 'object') return null;
  const line = raw as Record<string, unknown>;
  const taxRatePercent = readTaxRatePercent(line);
  const netCents = readCents(line, 'netCents') ?? readCents(line, 'net');
  const taxCents = readCents(line, 'taxCents') ?? readCents(line, 'tax');
  const grossCents =
    readCents(line, 'grossCents') ??
    readCents(line, 'gross') ??
    readCents(line, 'totalCents');

  if (taxRatePercent == null && netCents == null && taxCents == null && grossCents == null) {
    return null;
  }

  return { taxRatePercent, netCents, taxCents, grossCents };
}

function readTaxLines(data: Record<string, unknown>): InvoiceTaxLine[] {
  const raw = data.taxLines;
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeTaxLine).filter((line): line is InvoiceTaxLine => line != null);
}

function normalizeLineItem(raw: unknown): InvoiceLineItem | null {
  if (raw == null || typeof raw !== 'object') return null;
  const line = raw as Record<string, unknown>;
  const description = toStr(line.description) ?? toStr(line.name);
  if (!description) return null;

  const quantityRaw = toNum(line.quantity);
  const quantity = quantityRaw != null && quantityRaw > 0 ? quantityRaw : 1;
  const unitPriceNetCents =
    readCents(line, 'unitPriceNetCents') ??
    readCents(line, 'unitPriceCents') ??
    readCents(line, 'unitNetCents');
  const taxRatePercent = readTaxRatePercent(line);
  const netCents = readCents(line, 'netCents') ?? readCents(line, 'net');
  const taxCents = readCents(line, 'taxCents') ?? readCents(line, 'tax');
  const grossCents =
    readCents(line, 'grossCents') ??
    readCents(line, 'gross') ??
    readCents(line, 'totalCents');

  return {
    description,
    quantity,
    unitPriceNetCents,
    taxRatePercent,
    netCents,
    taxCents,
    grossCents,
  };
}

export function readLineItems(data: Record<string, unknown>): InvoiceLineItem[] {
  const raw = data.lineItems;
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeLineItem).filter((line): line is InvoiceLineItem => line != null);
}

function hasAnyAmount(data: Record<string, unknown>): boolean {
  return (
    readSubtotalNetCents(data) != null ||
    readTotalGrossCents(data) != null ||
    readTotalTaxCents(data) != null ||
    readCents(data, 'totalCents') != null
  );
}

function readExplicitAmountSemantics(data: Record<string, unknown>): AmountSemanticsStatus | null {
  const raw = String(data.amountSemantics ?? '').toUpperCase();
  if (raw === 'GROSS' || raw === 'NET' || raw === 'EXPLICIT') return 'EXPLICIT';
  if (raw === 'UNCLEAR') return 'UNCLEAR';
  return null;
}

function readExplicitTaxSemantics(data: Record<string, unknown>): TaxSemanticsStatus | null {
  const raw = String(data.taxSemantics ?? '').toUpperCase();
  if (raw === 'EXPLICIT') return 'EXPLICIT';
  if (raw === 'TAX_FREE' || raw === 'TAX_EXEMPT' || raw === 'ZERO_RATED') return 'TAX_FREE';
  if (raw === 'UNCLEAR') return 'UNCLEAR';
  if (data.taxFree === true || data.isTaxFree === true) return 'TAX_FREE';
  if (readReverseCharge(data)) return 'TAX_FREE';
  return null;
}

export function readInvoiceNumber(data: Record<string, unknown>): string | null {
  return (
    toStr(data.invoiceNumber) ??
    toStr(data.creditNoteNumber) ??
    toStr(data.documentNumber)
  );
}

export function readInvoiceDate(data: Record<string, unknown>): string | null {
  return toStr(data.invoiceDate) ?? toStr(data.eventDate);
}

export function readDueDate(data: Record<string, unknown>): string | null {
  return toStr(data.dueDate);
}

export function readCurrency(data: Record<string, unknown>): string | null {
  const raw = toStr(data.currency);
  if (!raw) return null;
  return raw.toUpperCase();
}

export function readSupplier(data: Record<string, unknown>): string | null {
  return (
    toStr(data.supplier) ??
    toStr(data.supplierName) ??
    toStr(data.vendorName) ??
    toStr(data.workshopName)
  );
}

export function readCustomer(data: Record<string, unknown>): string | null {
  return (
    toStr(data.customer) ??
    toStr(data.customerName) ??
    toStr(data.addressee) ??
    toStr(data.billTo)
  );
}

export function readSubtotalNetCents(data: Record<string, unknown>): number | null {
  return (
    readCents(data, 'subtotalNet') ??
    readCents(data, 'subtotalNetCents') ??
    readCents(data, 'netCents')
  );
}

export function readTotalTaxCents(data: Record<string, unknown>): number | null {
  return (
    readCents(data, 'totalTax') ??
    readCents(data, 'totalTaxCents') ??
    readCents(data, 'taxCents')
  );
}

export function readTotalGrossCents(data: Record<string, unknown>): number | null {
  return (
    readCents(data, 'totalGross') ??
    readCents(data, 'totalGrossCents') ??
    readCents(data, 'grossCents') ??
    readCents(data, 'totalCents')
  );
}

export function readTaxExemptReason(data: Record<string, unknown>): string | null {
  return toStr(data.taxExemptReason) ?? toStr(data.taxExemptionReason);
}

export function readReverseCharge(data: Record<string, unknown>): boolean {
  if (data.reverseCharge === true) return true;
  const token = toStr(data.reverseCharge)?.toLowerCase();
  return token === 'true' || token === 'yes' || token === 'ja';
}

export function readCreditNoteReference(data: Record<string, unknown>): string | null {
  return (
    toStr(data.creditNoteReference) ??
    toStr(data.referencedInvoiceNumber) ??
    toStr(data.relatedInvoiceNumber)
  );
}

export function readOriginalInvoiceReference(data: Record<string, unknown>): string | null {
  return (
    toStr(data.originalInvoiceReference) ??
    toStr(data.originalInvoiceNumber) ??
    toStr(data.invoiceReference) ??
    readCreditNoteReference(data)
  );
}

export function isCreditNoteDocument(
  data: Record<string, unknown>,
  documentSubtype?: string | null,
): boolean {
  const subtype = documentSubtype?.trim().toUpperCase().replace(/[\s-]+/g, '_') ?? '';
  if (subtype && CREDIT_NOTE_SUBTYPES.has(subtype)) return true;

  const documentKind = toStr(data.documentKind)?.toUpperCase().replace(/[\s-]+/g, '_');
  if (documentKind && CREDIT_NOTE_SUBTYPES.has(documentKind)) return true;

  if (data.isCreditNote === true || data.creditNote === true) return true;

  const gross = readTotalGrossCents(data);
  return gross != null && gross < 0;
}

export function assessInvoiceAmountTaxSemantics(
  data: Record<string, unknown>,
): InvoiceAmountTaxAssessment {
  const missingFieldKeys: string[] = [];
  const explicitAmountSemantics = readExplicitAmountSemantics(data);
  const explicitTaxSemantics = readExplicitTaxSemantics(data);
  const taxLines = readTaxLines(data);
  const lineItems = readLineItems(data);

  if (explicitAmountSemantics === 'UNCLEAR' || explicitTaxSemantics === 'UNCLEAR') {
    return {
      amountSemantics: explicitAmountSemantics ?? 'UNCLEAR',
      taxSemantics: explicitTaxSemantics ?? 'UNCLEAR',
      taxLines,
      missingFieldKeys: ['amountSemantics'],
    };
  }

  if (!hasAnyAmount(data) && taxLines.length === 0 && lineItems.length === 0) {
    missingFieldKeys.push('totalGross', 'subtotalNet');
    return {
      amountSemantics: 'MISSING',
      taxSemantics: 'MISSING',
      taxLines,
      missingFieldKeys,
    };
  }

  if (explicitTaxSemantics === 'TAX_FREE' || readReverseCharge(data)) {
    return {
      amountSemantics: explicitAmountSemantics ?? 'EXPLICIT',
      taxSemantics: 'TAX_FREE',
      taxLines,
      missingFieldKeys,
    };
  }

  if (taxLines.length > 0) {
    const allLinesExplicit = taxLines.every(
      (line) =>
        line.taxRatePercent != null &&
        (line.netCents != null || line.grossCents != null || line.taxCents != null),
    );
    const allLinesTaxFree = taxLines.every((line) => line.taxRatePercent === 0);

    if (allLinesExplicit) {
      return {
        amountSemantics: explicitAmountSemantics ?? 'EXPLICIT',
        taxSemantics: allLinesTaxFree ? 'TAX_FREE' : 'EXPLICIT',
        taxLines,
        missingFieldKeys,
      };
    }

    return {
      amountSemantics: explicitAmountSemantics ?? 'UNCLEAR',
      taxSemantics: explicitTaxSemantics ?? 'UNCLEAR',
      taxLines,
      missingFieldKeys: ['taxLines'],
    };
  }

  if (lineItems.length > 0) {
    const allLinesExplicit = lineItems.every(
      (line) =>
        line.taxRatePercent != null &&
        (line.netCents != null || line.grossCents != null || line.unitPriceNetCents != null),
    );
    const allLinesTaxFree = lineItems.every((line) => line.taxRatePercent === 0);

    if (allLinesExplicit) {
      return {
        amountSemantics: explicitAmountSemantics ?? 'EXPLICIT',
        taxSemantics: allLinesTaxFree ? 'TAX_FREE' : 'EXPLICIT',
        taxLines: lineItems.map((line) => ({
          taxRatePercent: line.taxRatePercent,
          netCents: line.netCents,
          taxCents: line.taxCents,
          grossCents: line.grossCents,
        })),
        missingFieldKeys,
      };
    }

    return {
      amountSemantics: explicitAmountSemantics ?? 'UNCLEAR',
      taxSemantics: explicitTaxSemantics ?? 'UNCLEAR',
      taxLines,
      missingFieldKeys: ['lineItems'],
    };
  }

  const netCents = readSubtotalNetCents(data);
  const taxCents = readTotalTaxCents(data);
  const grossCents = readTotalGrossCents(data);
  const taxRatePercent = readTaxRatePercent(data);

  if (netCents != null && taxCents != null && grossCents != null) {
    return {
      amountSemantics: explicitAmountSemantics ?? 'EXPLICIT',
      taxSemantics:
        taxCents === 0 || taxRatePercent === 0
          ? 'TAX_FREE'
          : explicitTaxSemantics ?? 'EXPLICIT',
      taxLines: [{ taxRatePercent, netCents, taxCents, grossCents }],
      missingFieldKeys,
    };
  }

  if (taxRatePercent != null && grossCents != null && explicitAmountSemantics === 'EXPLICIT') {
    return {
      amountSemantics: 'EXPLICIT',
      taxSemantics: taxRatePercent === 0 ? 'TAX_FREE' : explicitTaxSemantics ?? 'EXPLICIT',
      taxLines: [{ taxRatePercent, netCents, taxCents, grossCents }],
      missingFieldKeys,
    };
  }

  if (grossCents != null && !explicitAmountSemantics && !explicitTaxSemantics) {
    return {
      amountSemantics: 'UNCLEAR',
      taxSemantics: 'UNCLEAR',
      taxLines,
      missingFieldKeys: ['amountSemantics', 'taxSemantics'],
    };
  }

  if (explicitAmountSemantics === 'EXPLICIT' && explicitTaxSemantics === 'EXPLICIT') {
    return {
      amountSemantics: 'EXPLICIT',
      taxSemantics: 'EXPLICIT',
      taxLines,
      missingFieldKeys,
    };
  }

  return {
    amountSemantics: explicitAmountSemantics ?? (hasAnyAmount(data) ? 'UNCLEAR' : 'MISSING'),
    taxSemantics: explicitTaxSemantics ?? 'UNCLEAR',
    taxLines,
    missingFieldKeys: hasAnyAmount(data) ? ['amountSemantics'] : ['totalGross'],
  };
}

function centsDiff(a: number, b: number): number {
  return Math.abs(Math.round(a) - Math.round(b));
}

function assessNetGrossTaxConsistency(fields: Record<string, unknown>): PlausibilityCheck[] {
  const checks: PlausibilityCheck[] = [];
  const net = readSubtotalNetCents(fields);
  const tax = readTotalTaxCents(fields);
  const gross = readTotalGrossCents(fields);

  if (net != null && tax != null && gross != null) {
    const expectedGross = net + tax;
    const diff = centsDiff(expectedGross, gross);
    if (diff > INVOICE_ROUNDING_TOLERANCE_CENTS) {
      checks.push({
        code: 'INVOICE_NET_GROSS_INCONSISTENT',
        status: 'BLOCKER',
        message: `Net (${net}) + tax (${tax}) does not equal gross (${gross}).`,
        source: 'DOCUMENT',
      });
    } else if (diff > 0) {
      checks.push({
        code: 'INVOICE_NET_GROSS_ROUNDING',
        status: 'WARNING',
        message: `Minor rounding difference between net+tax and gross (${diff} cent(s)).`,
        source: 'DOCUMENT',
      });
    }
  }

  const taxLines = readTaxLines(fields);
  if (taxLines.length > 1) {
    const sumNet = taxLines.reduce((sum, line) => sum + (line.netCents ?? 0), 0);
    const sumTax = taxLines.reduce((sum, line) => sum + (line.taxCents ?? 0), 0);
    const sumGross = taxLines.reduce((sum, line) => sum + (line.grossCents ?? 0), 0);

    if (net != null && centsDiff(sumNet, net) > INVOICE_ROUNDING_TOLERANCE_CENTS) {
      checks.push({
        code: 'INVOICE_TAX_LINES_NET_MISMATCH',
        status: 'BLOCKER',
        message: 'Sum of tax line net amounts does not match subtotalNet.',
        source: 'DOCUMENT',
      });
    }
    if (tax != null && centsDiff(sumTax, tax) > INVOICE_ROUNDING_TOLERANCE_CENTS) {
      checks.push({
        code: 'INVOICE_TAX_LINES_TAX_MISMATCH',
        status: 'BLOCKER',
        message: 'Sum of tax line tax amounts does not match totalTax.',
        source: 'DOCUMENT',
      });
    }
    if (gross != null && centsDiff(sumGross, gross) > INVOICE_ROUNDING_TOLERANCE_CENTS) {
      checks.push({
        code: 'INVOICE_TAX_LINES_GROSS_MISMATCH',
        status: 'BLOCKER',
        message: 'Sum of tax line gross amounts does not match totalGross.',
        source: 'DOCUMENT',
      });
    }
  }

  const lineItems = readLineItems(fields);
  if (lineItems.length > 0 && gross != null) {
    const lineGrossSum = lineItems.reduce((sum, line) => sum + (line.grossCents ?? 0), 0);
    const diff = centsDiff(lineGrossSum, gross);
    if (diff > INVOICE_ROUNDING_TOLERANCE_CENTS) {
      checks.push({
        code: 'INVOICE_LINE_ITEMS_GROSS_MISMATCH',
        status: 'BLOCKER',
        message: 'Sum of line item gross amounts does not match totalGross.',
        source: 'DOCUMENT',
      });
    } else if (diff > 0) {
      checks.push({
        code: 'INVOICE_LINE_ITEMS_ROUNDING',
        status: 'WARNING',
        message: `Minor rounding difference between line items and total gross (${diff} cent(s)).`,
        source: 'DOCUMENT',
      });
    }
  }

  return checks;
}

export function collectInvoicePlausibilityChecks(
  fields: Record<string, unknown>,
  options?: { documentSubtype?: string | null },
): PlausibilityCheck[] {
  const checks: PlausibilityCheck[] = [];
  const assessment = assessInvoiceAmountTaxSemantics(fields);
  const isCredit = isCreditNoteDocument(fields, options?.documentSubtype);

  checks.push(...assessNetGrossTaxConsistency(fields));

  if (!readCurrency(fields)) {
    checks.push({
      code: 'INVOICE_MISSING_CURRENCY',
      status: 'WARNING',
      message: 'Currency must be confirmed — no silent EUR conversion.',
      source: 'DOCUMENT',
    });
  }

  if (
    assessment.amountSemantics === 'UNCLEAR' ||
    assessment.taxSemantics === 'UNCLEAR'
  ) {
    checks.push({
      code: 'INVOICE_UNCLEAR_AMOUNT_TAX_SEMANTICS',
      status: 'WARNING',
      message: 'Amount or tax semantics are unclear — review before apply.',
      source: 'DOCUMENT',
    });
  }

  if (readReverseCharge(fields) && (readTotalTaxCents(fields) ?? 0) > 0) {
    checks.push({
      code: 'INVOICE_REVERSE_CHARGE_WITH_TAX',
      status: 'WARNING',
      message: 'Reverse charge is set but totalTax is positive.',
      source: 'DOCUMENT',
    });
  }

  const taxExempt = readTaxExemptReason(fields);
  const totalTax = readTotalTaxCents(fields);
  if (
    (assessment.taxSemantics === 'TAX_FREE' || taxExempt) &&
    totalTax != null &&
    totalTax > 0
  ) {
    checks.push({
      code: 'INVOICE_TAX_EXEMPT_WITH_TAX',
      status: 'WARNING',
      message: 'Document is marked tax-exempt but totalTax is positive.',
      source: 'DOCUMENT',
    });
  }

  if (isCredit) {
    const gross = readTotalGrossCents(fields);
    if (gross != null && gross > 0) {
      checks.push({
        code: 'INVOICE_CREDIT_NOTE_POSITIVE_AMOUNT',
        status: 'BLOCKER',
        message: 'Credit note amounts should be negative or zero.',
        source: 'DOCUMENT',
      });
    }
    if (!readCreditNoteReference(fields) && !readOriginalInvoiceReference(fields)) {
      checks.push({
        code: 'INVOICE_CREDIT_NOTE_MISSING_REFERENCE',
        status: 'WARNING',
        message: 'Credit note should reference the original invoice.',
        source: 'DOCUMENT',
      });
    }
  }

  const invoiceDate = toDate(readInvoiceDate(fields));
  const dueDate = toDate(readDueDate(fields));
  if (invoiceDate && dueDate && dueDate.getTime() < invoiceDate.getTime()) {
    checks.push({
      code: 'INVOICE_DUE_DATE_BEFORE_INVOICE',
      status: 'WARNING',
      message: 'Due date must not be before invoice date.',
      source: 'DOCUMENT',
    });
  }

  return checks;
}

export function assessInvoiceApplyGate(input: {
  fields: Record<string, unknown>;
  documentSubtype?: string | null;
}): InvoiceApplyGateResult {
  const { fields } = input;
  const blockers: InvoiceApplyGateBlocker[] = [];
  const assessment = assessInvoiceAmountTaxSemantics(fields);
  const isCredit = isCreditNoteDocument(fields, input.documentSubtype);

  if (!readInvoiceNumber(fields)) {
    blockers.push({
      code: 'MISSING_INVOICE_NUMBER',
      message: 'Invoice number is required before apply.',
      fieldKeys: ['invoiceNumber'],
    });
  }

  if (!readCurrency(fields)) {
    blockers.push({
      code: 'MISSING_CURRENCY',
      message: 'Currency must be confirmed — currencies are not silently converted to EUR.',
      fieldKeys: ['currency'],
    });
  }

  if (
    assessment.amountSemantics === 'UNCLEAR' ||
    assessment.taxSemantics === 'UNCLEAR'
  ) {
    blockers.push({
      code: 'UNCLEAR_AMOUNT_OR_TAX_SEMANTICS',
      message: 'Unclear amount or tax semantics block final apply.',
      fieldKeys: ['amountSemantics', 'taxSemantics'],
    });
  }

  if (assessment.amountSemantics === 'MISSING' || assessment.taxSemantics === 'MISSING') {
    blockers.push({
      code: 'MISSING_AMOUNT_OR_TAX_SEMANTICS',
      message: 'Amount and tax semantics must be explicit before apply.',
      fieldKeys: assessment.missingFieldKeys,
    });
  }

  const consistencyBlockers = assessNetGrossTaxConsistency(fields).filter(
    (check) => check.status === 'BLOCKER',
  );
  for (const check of consistencyBlockers) {
    blockers.push({
      code: check.code,
      message: check.message,
      fieldKeys: ['subtotalNet', 'totalTax', 'totalGross'],
    });
  }

  if (isCredit) {
    const gross = readTotalGrossCents(fields);
    if (gross != null && gross > 0) {
      blockers.push({
        code: 'INVOICE_CREDIT_NOTE_POSITIVE_AMOUNT',
        message: 'Credit note must not apply with a positive gross amount.',
        fieldKeys: ['totalGross', 'isCreditNote'],
      });
    }
  }

  return {
    canApply: blockers.length === 0,
    isCreditNote: isCredit,
    blockers,
  };
}

export function buildInvoiceApplyLineItems(
  fields: Record<string, unknown>,
): InvoiceApplyLineItem[] | undefined {
  const lineItems = readLineItems(fields);
  if (lineItems.length > 0) {
    return lineItems.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPriceNetCents: Math.abs(line.unitPriceNetCents ?? line.netCents ?? 0),
      taxRate: line.taxRatePercent ?? 0,
    }));
  }

  const taxLines = readTaxLines(fields);
  if (taxLines.length > 0) {
    return taxLines.map((line, index) => ({
      description: `Position ${index + 1} (${line.taxRatePercent ?? 0}% MwSt.)`,
      quantity: 1,
      unitPriceNetCents: Math.abs(line.netCents ?? 0),
      taxRate: line.taxRatePercent ?? 0,
    }));
  }

  const net = readSubtotalNetCents(fields);
  const tax = readTotalTaxCents(fields);
  const taxRate = readTaxRatePercent(fields);
  const gross = readTotalGrossCents(fields);
  const assessment = assessInvoiceAmountTaxSemantics(fields);

  if (net != null && assessment.amountSemantics === 'EXPLICIT') {
    let resolvedTaxRate = taxRate;
    if (resolvedTaxRate == null && tax != null && net > 0) {
      resolvedTaxRate = Math.round((Math.abs(tax) / Math.abs(net)) * 100);
    }
    if (resolvedTaxRate == null && assessment.taxSemantics === 'TAX_FREE') {
      resolvedTaxRate = 0;
    }
    if (resolvedTaxRate != null) {
      return [
        {
          description: toStr(fields.title) ?? toStr(fields.description) ?? 'Eingangsrechnung',
          quantity: 1,
          unitPriceNetCents: Math.abs(net),
          taxRate: resolvedTaxRate,
        },
      ];
    }
  }

  if (gross != null && assessment.taxSemantics === 'TAX_FREE' && assessment.amountSemantics === 'EXPLICIT') {
    return [
      {
        description: toStr(fields.title) ?? 'Eingangsrechnung',
        quantity: 1,
        unitPriceNetCents: Math.abs(gross),
        taxRate: 0,
      },
    ];
  }

  return undefined;
}

export function resolveInvoiceApplyTotals(fields: Record<string, unknown>): {
  totalCents: number;
  currency: string | null;
} {
  const gross = readTotalGrossCents(fields) ?? 0;
  return {
    totalCents: Math.round(gross),
    currency: readCurrency(fields),
  };
}
