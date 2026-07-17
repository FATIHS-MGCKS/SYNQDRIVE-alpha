import {
  INVOICE_COMPLETE_19,
  INVOICE_CREDIT_NOTE,
  INVOICE_MULTI_RATE,
  INVOICE_TAX_FREE,
  INVOICE_UNCLEAR_SEMANTICS,
} from './__fixtures__/document-invoice-fixtures';
import {
  assessFinanceDraftRequirements,
  assessFinancePlan,
  assessInvoiceAmountTaxSemantics,
  FINANCE_DOCUMENT_MODES,
  FINANCE_PLAN_OUTCOMES,
  FINANCE_SEMANTIC_ACTIONS,
  isCreditNoteProfile,
  isFinanceDocumentProfile,
  resolveFinanceDocumentMode,
} from './document-action-planner.invoice-rules';

function financeInput(
  confirmedData: Record<string, unknown>,
  overrides: Partial<Parameters<typeof assessFinanceDraftRequirements>[0]> & {
    duplicateVendorInvoiceId?: string | null;
  } = {},
) {
  return {
    effectiveDocumentType: 'INVOICE',
    documentCategory: 'FINANCE',
    documentSubtype: 'STANDARD',
    confirmedData,
    ...overrides,
  };
}

describe('document-action-planner.invoice-rules', () => {
  describe('finance profile routing', () => {
    it('recognizes INVOICE and finance subtypes', () => {
      expect(isFinanceDocumentProfile(financeInput({}))).toBe(true);
      expect(
        isFinanceDocumentProfile(
          financeInput({}, { effectiveDocumentType: 'SERVICE', documentSubtype: 'CREDIT_NOTE' }),
        ),
      ).toBe(true);
      expect(
        isFinanceDocumentProfile(
          financeInput({}, { effectiveDocumentType: 'SERVICE', documentSubtype: 'RANDOM' }),
        ),
      ).toBe(false);
    });

    it('resolves credit note and incoming invoice modes', () => {
      expect(resolveFinanceDocumentMode(financeInput({}, { documentSubtype: 'CREDIT_NOTE' }))).toBe(
        FINANCE_DOCUMENT_MODES.CREDIT_NOTE,
      );
      expect(resolveFinanceDocumentMode(financeInput({}, { documentSubtype: 'STANDARD' }))).toBe(
        FINANCE_DOCUMENT_MODES.INCOMING_INVOICE,
      );
      expect(resolveFinanceDocumentMode(financeInput({}, { documentSubtype: 'PAYMENT_PROOF' }))).toBe(
        FINANCE_DOCUMENT_MODES.PAYMENT_PROOF,
      );
    });
  });

  describe('tax semantics', () => {
    it('accepts explicit 19% invoice without defaulting tax rate', () => {
      const assessment = assessInvoiceAmountTaxSemantics(INVOICE_COMPLETE_19);
      expect(assessment.taxLines[0]?.taxRatePercent).toBe(19);
    });

    it('supports multiple tax rates via taxLines', () => {
      const assessment = assessInvoiceAmountTaxSemantics(INVOICE_MULTI_RATE);
      expect(assessment.taxLines).toHaveLength(2);
    });

    it('accepts tax-free invoice', () => {
      expect(assessInvoiceAmountTaxSemantics(INVOICE_TAX_FREE).taxSemantics).toBe('TAX_FREE');
    });
  });

  describe('draft requirements', () => {
    it('is READY for complete incoming invoice', () => {
      const assessment = assessFinanceDraftRequirements(financeInput(INVOICE_COMPLETE_19));
      expect(assessment.planOutcome).toBe(FINANCE_PLAN_OUTCOMES.READY);
      expect(assessment.canCreateInvoiceDraft).toBe(true);
    });

    it('enters DRAFT_ONLY for unclear amount semantics', () => {
      const assessment = assessFinanceDraftRequirements(financeInput(INVOICE_UNCLEAR_SEMANTICS));
      expect(assessment.planOutcome).toBe(FINANCE_PLAN_OUTCOMES.DRAFT_ONLY);
      expect(assessment.canCreateInvoiceDraft).toBe(false);
    });

    it('creates credit note draft for negative credit note', () => {
      const assessment = assessFinanceDraftRequirements(
        financeInput(INVOICE_CREDIT_NOTE, { documentSubtype: 'CREDIT_NOTE' }),
      );
      expect(assessment.canCreateCreditNoteDraft).toBe(true);
      expect(assessment.canCreateInvoiceDraft).toBe(false);
      expect(isCreditNoteProfile(financeInput(INVOICE_CREDIT_NOTE, { documentSubtype: 'CREDIT_NOTE' }))).toBe(
        true,
      );
    });

    it('blocks when amount semantics are missing entirely', () => {
      const assessment = assessFinanceDraftRequirements(
        financeInput({ invoiceNumber: 'INV-NO-AMT', vendorName: 'Vendor A' }),
      );
      expect(assessment.planOutcome).toBe(FINANCE_PLAN_OUTCOMES.BLOCKED);
    });
  });

  describe('assessFinancePlan', () => {
    it('plans CREATE_INVOICE_DRAFT for complete incoming invoice', () => {
      const assessment = assessFinancePlan(financeInput(INVOICE_COMPLETE_19));
      expect(assessment.planOutcome).toBe(FINANCE_PLAN_OUTCOMES.READY);
      expect(assessment.actions.map((action) => action.semanticAction)).toContain(
        FINANCE_SEMANTIC_ACTIONS.CREATE_INVOICE_DRAFT,
      );
    });

    it('plans CREATE_CREDIT_NOTE_DRAFT for credit notes', () => {
      const assessment = assessFinancePlan(
        financeInput(INVOICE_CREDIT_NOTE, { documentSubtype: 'CREDIT_NOTE' }),
      );
      expect(assessment.actions.map((action) => action.semanticAction)).toContain(
        FINANCE_SEMANTIC_ACTIONS.CREATE_CREDIT_NOTE_DRAFT,
      );
    });

    it('blocks when duplicate vendor invoice id is present', () => {
      const assessment = assessFinancePlan(
        financeInput(INVOICE_COMPLETE_19, { duplicateVendorInvoiceId: 'inv-dup' }),
      );
      expect(assessment.planOutcome).toBe(FINANCE_PLAN_OUTCOMES.BLOCKED);
      expect(assessment.actions).toHaveLength(0);
      expect(assessment.missingRequirements.some((row) => row.code === 'INVOICE_DUPLICATE_VENDOR_NUMBER')).toBe(
        true,
      );
    });
  });
});
