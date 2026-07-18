import {
  INVOICE_COMPLETE_19,
  INVOICE_CREDIT_NOTE,
  INVOICE_MISSING_CURRENCY,
  INVOICE_MULTI_RATE,
  INVOICE_NET_GROSS_BLOCKER,
  INVOICE_REVERSE_CHARGE,
  INVOICE_ROUNDING_WARNING,
  INVOICE_TAX_FREE,
  INVOICE_UNCLEAR_SEMANTICS,
} from './__fixtures__/document-invoice-fixtures';
import {
  assessInvoiceApplyGate,
  assessInvoiceAmountTaxSemantics,
  buildInvoiceApplyLineItems,
  buildInvoiceApplyPayload,
  collectInvoicePlausibilityChecks,
  isCreditNoteDocument,
  readCurrency,
  readCustomer,
  readInvoiceNumber,
  readLineItems,
  readOriginalInvoiceReference,
  readSupplier,
  readTotalGrossCents,
} from './document-invoice-extraction.rules';
import { DocumentExtractionPlausibilityService } from './document-extraction-plausibility.service';

describe('document-invoice-extraction.rules', () => {
  describe('field readers', () => {
    it('reads canonical invoice fields and aliases', () => {
      expect(readInvoiceNumber(INVOICE_COMPLETE_19)).toBe('INV-2026-001');
      expect(readCurrency(INVOICE_COMPLETE_19)).toBe('EUR');
      expect(readSupplier(INVOICE_COMPLETE_19)).toBe('Werkstatt Müller GmbH');
      expect(readCustomer(INVOICE_COMPLETE_19)).toBe('SynqDrive Fleet GmbH');
      expect(readLineItems(INVOICE_COMPLETE_19)).toHaveLength(1);
      expect(readOriginalInvoiceReference(INVOICE_CREDIT_NOTE)).toBe('INV-2026-001');
    });

    it('does not default currency to EUR', () => {
      expect(readCurrency(INVOICE_MISSING_CURRENCY)).toBeNull();
      expect(readCurrency({})).toBeNull();
    });
  });

  describe('tax semantics', () => {
    it('accepts explicit 19% without defaulting tax rate', () => {
      const assessment = assessInvoiceAmountTaxSemantics(INVOICE_COMPLETE_19);
      expect(assessment.amountSemantics).toBe('EXPLICIT');
      expect(assessment.taxSemantics).toBe('EXPLICIT');
      expect(assessment.taxLines[0]?.taxRatePercent).toBe(19);
    });

    it('supports multiple tax rates via taxLines', () => {
      const assessment = assessInvoiceAmountTaxSemantics(INVOICE_MULTI_RATE);
      expect(assessment.taxSemantics).toBe('EXPLICIT');
      expect(assessment.taxLines).toHaveLength(2);
      expect(assessment.taxLines.map((line) => line.taxRatePercent)).toEqual([19, 7]);
    });

    it('accepts tax-free invoice with reason', () => {
      const assessment = assessInvoiceAmountTaxSemantics(INVOICE_TAX_FREE);
      expect(assessment.taxSemantics).toBe('TAX_FREE');
    });

    it('accepts reverse charge as tax-free semantics', () => {
      const assessment = assessInvoiceAmountTaxSemantics(INVOICE_REVERSE_CHARGE);
      expect(assessment.taxSemantics).toBe('TAX_FREE');
    });

    it('marks unclear net/gross without explicit semantics', () => {
      const assessment = assessInvoiceAmountTaxSemantics(INVOICE_UNCLEAR_SEMANTICS);
      expect(assessment.amountSemantics).toBe('UNCLEAR');
      expect(assessment.taxSemantics).toBe('UNCLEAR');
    });
  });

  describe('credit note detection', () => {
    it('detects credit notes by flag, subtype, and negative amount', () => {
      expect(isCreditNoteDocument(INVOICE_CREDIT_NOTE, 'CREDIT_NOTE')).toBe(true);
      expect(isCreditNoteDocument({ totalGross: -100 }, null)).toBe(true);
      expect(isCreditNoteDocument(INVOICE_COMPLETE_19, 'STANDARD')).toBe(false);
    });
  });

  describe('plausibility checks', () => {
    it('warns on minor rounding differences', () => {
      const checks = collectInvoicePlausibilityChecks(INVOICE_ROUNDING_WARNING);
      expect(checks.some((check) => check.code === 'INVOICE_NET_GROSS_ROUNDING')).toBe(true);
      expect(checks.find((check) => check.code === 'INVOICE_NET_GROSS_ROUNDING')?.status).toBe(
        'WARNING',
      );
    });

    it('blocks net/gross inconsistency beyond tolerance', () => {
      const checks = collectInvoicePlausibilityChecks(INVOICE_NET_GROSS_BLOCKER);
      expect(checks.some((check) => check.code === 'INVOICE_NET_GROSS_INCONSISTENT')).toBe(true);
    });

    it('warns when currency is missing', () => {
      const checks = collectInvoicePlausibilityChecks(INVOICE_MISSING_CURRENCY);
      expect(checks.some((check) => check.code === 'INVOICE_MISSING_CURRENCY')).toBe(true);
    });

    it('integrates with plausibility service for INVOICE type', () => {
      const svc = new DocumentExtractionPlausibilityService();
      const result = svc.runChecks('INVOICE', INVOICE_NET_GROSS_BLOCKER, {});
      expect(result.checks.some((check) => check.code === 'INVOICE_NET_GROSS_INCONSISTENT')).toBe(
        true,
      );
    });
  });

  describe('apply gate', () => {
    it('allows complete explicit invoice', () => {
      const gate = assessInvoiceApplyGate({ fields: INVOICE_COMPLETE_19 });
      expect(gate.canApply).toBe(true);
      expect(gate.blockers).toHaveLength(0);
    });

    it('blocks unclear amount semantics', () => {
      const gate = assessInvoiceApplyGate({ fields: INVOICE_UNCLEAR_SEMANTICS });
      expect(gate.canApply).toBe(false);
      expect(gate.blockers.some((blocker) => blocker.code === 'UNCLEAR_AMOUNT_OR_TAX_SEMANTICS')).toBe(
        true,
      );
    });

    it('blocks missing currency', () => {
      const gate = assessInvoiceApplyGate({ fields: INVOICE_MISSING_CURRENCY });
      expect(gate.canApply).toBe(false);
      expect(gate.blockers.some((blocker) => blocker.code === 'MISSING_CURRENCY')).toBe(true);
    });

    it('blocks net/gross inconsistency', () => {
      const gate = assessInvoiceApplyGate({ fields: INVOICE_NET_GROSS_BLOCKER });
      expect(gate.canApply).toBe(false);
    });
  });

  describe('apply line items', () => {
    it('builds line items from structured lineItems without 19% default', () => {
      const items = buildInvoiceApplyLineItems(INVOICE_COMPLETE_19);
      expect(items).toHaveLength(1);
      expect(items?.[0]?.taxRate).toBe(19);
      expect(items?.[0]?.unitPriceNetCents).toBe(10000);
    });

    it('builds line items from taxLines for multi-rate invoices', () => {
      const items = buildInvoiceApplyLineItems(INVOICE_MULTI_RATE);
      expect(items).toHaveLength(2);
      expect(items?.map((item) => item.taxRate)).toEqual([19, 7]);
    });

    it('does not invent line items for unclear semantics', () => {
      expect(buildInvoiceApplyLineItems(INVOICE_UNCLEAR_SEMANTICS)).toBeUndefined();
    });

    it('uses tax-free gross for reverse charge', () => {
      const items = buildInvoiceApplyLineItems(INVOICE_REVERSE_CHARGE);
      expect(items?.[0]?.taxRate).toBe(0);
      expect(items?.[0]?.unitPriceNetCents).toBe(20000);
    });
  });

  describe('buildInvoiceApplyPayload', () => {
    it('builds explicit 19% payload with line items', () => {
      const payload = buildInvoiceApplyPayload(INVOICE_COMPLETE_19);
      expect(payload?.vendorInvoiceNumber).toBe('INV-2026-001');
      expect(payload?.draftOnly).toBe(false);
      expect(payload?.lineItems?.[0]?.taxRate).toBe(19);
    });

    it('builds multi-rate payload from taxLines', () => {
      const payload = buildInvoiceApplyPayload(INVOICE_MULTI_RATE);
      expect(payload?.lineItems).toHaveLength(2);
      expect(payload?.lineItems?.map((item) => item.taxRate)).toEqual([19, 7]);
    });

    it('builds tax-free payload with zero tax rate', () => {
      const payload = buildInvoiceApplyPayload(INVOICE_TAX_FREE);
      expect(payload?.lineItems?.[0]?.taxRate).toBe(0);
    });

    it('builds credit note payload with negative total', () => {
      const payload = buildInvoiceApplyPayload(INVOICE_CREDIT_NOTE, {
        documentSubtype: 'CREDIT_NOTE',
      });
      expect(payload?.isCreditNote).toBe(true);
      expect(payload?.totalCents).toBeLessThan(0);
    });

    it('marks unclear invoices as draftOnly', () => {
      const payload = buildInvoiceApplyPayload({
        ...INVOICE_UNCLEAR_SEMANTICS,
        currency: 'EUR',
      });
      expect(payload?.draftOnly).toBe(true);
    });
  });
});
