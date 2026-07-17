import { planDocumentActions } from './document-action-planner.engine';
import {
  assessFinanceDraftRequirements,
  assessInvoiceAmountTaxSemantics,
  FINANCE_DOCUMENT_MODES,
  FINANCE_PLAN_OUTCOMES,
  FINANCE_SEMANTIC_ACTIONS,
  resolveFinanceDocumentMode,
} from './document-action-planner.invoice-rules';
import { buildPlannerTestInput } from './document-action-planner.test-fixtures';

function invoiceInput(
  confirmedData: Record<string, unknown>,
  overrides: Parameters<typeof buildPlannerTestInput>[0] = {},
) {
  return buildPlannerTestInput({
    effectiveDocumentType: 'INVOICE',
    documentCategory: 'FINANCE',
    documentSubtype: 'STANDARD',
    entityLinks: [],
    entityCandidates: [],
    confirmedData,
    ...overrides,
  });
}

function semanticActions(result: ReturnType<typeof planDocumentActions>): string[] {
  return result.actions
    .map((action) => (action.previewPayload as Record<string, unknown>)?.semanticAction)
    .filter((value): value is string => typeof value === 'string');
}

const explicitInvoice19 = {
  invoiceNumber: 'INV-2026-001',
  eventDate: '2026-03-10',
  totalCents: 11900,
  grossCents: 11900,
  netCents: 10000,
  taxCents: 1900,
  taxRatePercent: 19,
  amountSemantics: 'GROSS',
  taxSemantics: 'EXPLICIT',
};

describe('document-action-planner.invoice-rules', () => {
  describe('tax semantics', () => {
    it('accepts explicit 19% invoice without defaulting tax rate', () => {
      const assessment = assessInvoiceAmountTaxSemantics(explicitInvoice19);
      expect(assessment.amountSemantics).toBe('EXPLICIT');
      expect(assessment.taxSemantics).toBe('EXPLICIT');
      expect(assessment.taxLines[0]?.taxRatePercent).toBe(19);
    });

    it('accepts explicit 7% tax', () => {
      const assessment = assessInvoiceAmountTaxSemantics({
        ...explicitInvoice19,
        totalCents: 10700,
        grossCents: 10700,
        netCents: 10000,
        taxCents: 700,
        taxRatePercent: 7,
      });
      expect(assessment.taxSemantics).toBe('EXPLICIT');
      expect(assessment.taxLines[0]?.taxRatePercent).toBe(7);
    });

    it('accepts tax-free invoice', () => {
      const assessment = assessInvoiceAmountTaxSemantics({
        invoiceNumber: 'INV-0',
        totalCents: 5000,
        grossCents: 5000,
        netCents: 5000,
        taxCents: 0,
        taxSemantics: 'TAX_FREE',
        amountSemantics: 'GROSS',
      });
      expect(assessment.taxSemantics).toBe('TAX_FREE');
    });

    it('supports multiple tax rates via taxLines', () => {
      const assessment = assessInvoiceAmountTaxSemantics({
        invoiceNumber: 'INV-MIX',
        amountSemantics: 'EXPLICIT',
        taxSemantics: 'EXPLICIT',
        taxLines: [
          { taxRatePercent: 19, netCents: 5000, taxCents: 950, grossCents: 5950 },
          { taxRatePercent: 7, netCents: 3000, taxCents: 210, grossCents: 3210 },
        ],
      });
      expect(assessment.taxSemantics).toBe('EXPLICIT');
      expect(assessment.taxLines).toHaveLength(2);
    });

    it('marks unclear net/gross without explicit semantics', () => {
      const assessment = assessInvoiceAmountTaxSemantics({
        invoiceNumber: 'INV-UNK',
        totalCents: 10000,
      });
      expect(assessment.amountSemantics).toBe('UNCLEAR');
      expect(assessment.taxSemantics).toBe('UNCLEAR');
    });
  });

  describe('complete incoming invoice', () => {
    it('creates invoice draft with explicit tax data and no default VAT', () => {
      const result = planDocumentActions(invoiceInput(explicitInvoice19));

      expect(result.planDraft.snapshot.planningMode).toBe('FINANCE');
      expect(result.planDraft.snapshot.financePlanOutcome).toBe(FINANCE_PLAN_OUTCOMES.READY);
      expect(semanticActions(result)).toContain(FINANCE_SEMANTIC_ACTIONS.CREATE_INVOICE_DRAFT);
      const draft = result.actions.find((action) => action.actionType === 'CREATE_INVOICE');
      expect(draft?.inputPayload).toMatchObject({
        semanticAction: FINANCE_SEMANTIC_ACTIONS.CREATE_INVOICE_DRAFT,
        taxRatePercent: 19,
        note: 'Planner never applies a default VAT rate.',
      });
      expect(draft?.inputPayload).not.toHaveProperty('taxRate', 19);
    });

    it('suggests vendor link only as confirmation-required candidate', () => {
      const result = planDocumentActions(
        invoiceInput(explicitInvoice19, {
          entityCandidates: [
            { entityType: 'VENDOR', entityId: 'vendor-1', confidence: 0.92, status: 'PROPOSED' },
          ],
        }),
      );

      const vendorLink = result.actions.find(
        (action) =>
          (action.previewPayload as Record<string, unknown>)?.semanticAction ===
          FINANCE_SEMANTIC_ACTIONS.LINK_VENDOR,
      );
      expect(vendorLink?.requirement).toBe('OPTIONAL');
      expect((vendorLink?.inputPayload as Record<string, unknown>).requiresConfirmation).toBe(true);
    });
  });

  describe('incomplete invoice', () => {
    it('enters DRAFT_ONLY without invoice number', () => {
      const result = planDocumentActions(
        invoiceInput({
          ...explicitInvoice19,
          invoiceNumber: undefined,
        }),
      );

      expect(result.planDraft.snapshot.financePlanOutcome).toBe(FINANCE_PLAN_OUTCOMES.DRAFT_ONLY);
      expect(semanticActions(result)).not.toContain(FINANCE_SEMANTIC_ACTIONS.CREATE_INVOICE_DRAFT);
      expect(semanticActions(result)).toContain(FINANCE_SEMANTIC_ACTIONS.SUGGEST_PAYMENT_REVIEW);
    });

    it('enters DRAFT_ONLY for unclear amount semantics', () => {
      const assessment = assessFinanceDraftRequirements(
        invoiceInput({
          invoiceNumber: 'INV-UNK',
          totalCents: 10000,
        }),
      );
      expect(assessment.planOutcome).toBe(FINANCE_PLAN_OUTCOMES.DRAFT_ONLY);

      const result = planDocumentActions(
        invoiceInput({
          invoiceNumber: 'INV-UNK',
          totalCents: 10000,
        }),
      );
      expect(semanticActions(result)).not.toContain(FINANCE_SEMANTIC_ACTIONS.CREATE_INVOICE_DRAFT);
    });

    it('blocks when amount semantics are missing entirely', () => {
      const result = planDocumentActions(
        invoiceInput({
          invoiceNumber: 'INV-NO-AMT',
          vendorName: 'Vendor A',
        }),
      );

      expect(result.planDraft.snapshot.financePlanOutcome).toBe(FINANCE_PLAN_OUTCOMES.BLOCKED);
      expect(result.planDraft.isBlocked).toBe(true);
      expect(semanticActions(result)).not.toContain(FINANCE_SEMANTIC_ACTIONS.CREATE_INVOICE_DRAFT);
    });
  });

  describe('credit note (Gutschrift)', () => {
    it('creates credit note draft instead of positive invoice draft', () => {
      const result = planDocumentActions(
        invoiceInput(
          {
            invoiceNumber: 'CN-1',
            totalCents: -5000,
            grossCents: -5000,
            netCents: -4202,
            taxCents: -798,
            taxRatePercent: 19,
            amountSemantics: 'GROSS',
            taxSemantics: 'EXPLICIT',
            isCreditNote: true,
          },
          { documentSubtype: 'CREDIT_NOTE' },
        ),
      );

      expect(resolveFinanceDocumentMode(invoiceInput({}, { documentSubtype: 'CREDIT_NOTE' }))).toBe(
        FINANCE_DOCUMENT_MODES.CREDIT_NOTE,
      );
      expect(semanticActions(result)).toContain(FINANCE_SEMANTIC_ACTIONS.CREATE_CREDIT_NOTE_DRAFT);
      expect(semanticActions(result)).not.toContain(FINANCE_SEMANTIC_ACTIONS.CREATE_INVOICE_DRAFT);
      const draft = result.actions.find((action) => action.actionType === 'CREATE_INVOICE');
      expect((draft?.inputPayload as Record<string, unknown>).isCreditNote).toBe(true);
    });
  });

  describe('payment reminder (Mahnung)', () => {
    it('suggests linking existing invoice and due-date task', () => {
      const result = planDocumentActions(
        invoiceInput(
          {
            referencedInvoiceNumber: 'INV-2026-001',
            dueDate: '2026-04-01',
            description: 'Zahlungserinnerung',
          },
          {
            documentSubtype: 'PAYMENT_REMINDER',
            entityCandidates: [
              { entityType: 'INVOICE', entityId: 'inv-existing-1', confidence: 0.95, status: 'PROPOSED' },
            ],
          },
        ),
      );

      expect(result.planDraft.snapshot.financeDocumentMode).toBe(
        FINANCE_DOCUMENT_MODES.PAYMENT_REMINDER,
      );
      expect(semanticActions(result)).toContain(FINANCE_SEMANTIC_ACTIONS.LINK_EXISTING_INVOICE);
      expect(semanticActions(result)).toContain(FINANCE_SEMANTIC_ACTIONS.SUGGEST_DUE_DATE_TASK);
      expect(semanticActions(result)).not.toContain(FINANCE_SEMANTIC_ACTIONS.CREATE_INVOICE_DRAFT);
    });
  });

  describe('payment proof (Zahlungsnachweis)', () => {
    it('archives only and suggests payment review', () => {
      const result = planDocumentActions(
        invoiceInput(
          {
            description: 'Überweisungsbeleg',
            paymentDate: '2026-03-12',
          },
          { documentSubtype: 'PAYMENT_PROOF' },
        ),
      );

      expect(result.planDraft.snapshot.financeDocumentMode).toBe(FINANCE_DOCUMENT_MODES.PAYMENT_PROOF);
      expect(semanticActions(result)).toContain(FINANCE_SEMANTIC_ACTIONS.ARCHIVE_ONLY);
      expect(semanticActions(result)).toContain(FINANCE_SEMANTIC_ACTIONS.SUGGEST_PAYMENT_REVIEW);
      expect(semanticActions(result)).not.toContain(FINANCE_SEMANTIC_ACTIONS.CREATE_INVOICE_DRAFT);
    });
  });
});
