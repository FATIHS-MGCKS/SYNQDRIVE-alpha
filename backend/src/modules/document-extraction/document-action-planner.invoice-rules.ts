import {
  assessInvoiceAmountTaxSemantics,
  isCreditNoteDocument,
  readInvoiceNumber,
  readOriginalInvoiceReference,
  readTotalGrossCents,
  type AmountSemanticsStatus,
  type InvoiceAmountTaxAssessment,
  type TaxSemanticsStatus,
} from './document-invoice-extraction.rules';
import { gateActionPlanOnPlausibility } from './document-plausibility-gate.util';

export {
  assessInvoiceAmountTaxSemantics,
  type AmountSemanticsStatus,
  type InvoiceAmountTaxAssessment,
  type TaxSemanticsStatus,
} from './document-invoice-extraction.rules';

export const FINANCE_SEMANTIC_ACTIONS = {
  CREATE_INVOICE_DRAFT: 'CREATE_INVOICE_DRAFT',
  CREATE_CREDIT_NOTE_DRAFT: 'CREATE_CREDIT_NOTE_DRAFT',
  LINK_VENDOR: 'LINK_VENDOR',
  LINK_VEHICLE: 'LINK_VEHICLE',
  LINK_BOOKING: 'LINK_BOOKING',
  LINK_EXISTING_INVOICE: 'LINK_EXISTING_INVOICE',
  SUGGEST_PAYMENT_REVIEW: 'SUGGEST_PAYMENT_REVIEW',
  SUGGEST_DUE_DATE_TASK: 'SUGGEST_DUE_DATE_TASK',
  ARCHIVE_ONLY: 'ARCHIVE_ONLY',
} as const;

export type FinanceSemanticAction =
  (typeof FINANCE_SEMANTIC_ACTIONS)[keyof typeof FINANCE_SEMANTIC_ACTIONS];

export const FINANCE_DOCUMENT_MODES = {
  INCOMING_INVOICE: 'INCOMING_INVOICE',
  CREDIT_NOTE: 'CREDIT_NOTE',
  PAYMENT_REMINDER: 'PAYMENT_REMINDER',
  PAYMENT_PROOF: 'PAYMENT_PROOF',
} as const;

export type FinanceDocumentMode =
  (typeof FINANCE_DOCUMENT_MODES)[keyof typeof FINANCE_DOCUMENT_MODES];

export const FINANCE_PLAN_OUTCOMES = {
  READY: 'READY',
  DRAFT_ONLY: 'DRAFT_ONLY',
  BLOCKED: 'BLOCKED',
} as const;

export type FinancePlanOutcome =
  (typeof FINANCE_PLAN_OUTCOMES)[keyof typeof FINANCE_PLAN_OUTCOMES];

const CREDIT_NOTE_SUBTYPES = new Set(['CREDIT_NOTE', 'GUTSCHRIFT', 'CREDIT_MEMO']);
const PAYMENT_REMINDER_SUBTYPES = new Set(['PAYMENT_REMINDER', 'MAHNUNG', 'DUNNING', 'REMINDER']);
const PAYMENT_PROOF_SUBTYPES = new Set(['PAYMENT_PROOF', 'ZAHLUNGSNACHWEIS', 'PAYMENT_RECEIPT']);
const INCOMING_INVOICE_SUBTYPES = new Set([
  'INCOMING_INVOICE',
  'EINGANGSRECHNUNG',
  'VENDOR_INVOICE',
  'STANDARD',
  'UNSPECIFIED',
]);

export type FinancePlannerInput = {
  effectiveDocumentType: string;
  documentSubtype?: string | null;
  documentCategory?: string | null;
  confirmedData: Record<string, unknown>;
  plausibilityChecks?: import('./document-plausibility.types').PlausibilityCheck[];
};

export type FinanceMissingRequirement = {
  code: string;
  message: string;
  fieldKeys?: string[];
};

export type FinanceDraftRequirementAssessment = {
  missingRequirements: FinanceMissingRequirement[];
  amountTaxAssessment: InvoiceAmountTaxAssessment;
  canCreateInvoiceDraft: boolean;
  canCreateCreditNoteDraft: boolean;
  planOutcome: FinancePlanOutcome;
};

export function normalizeFinanceDocumentSubtype(
  subtype: string | null | undefined,
): string | null {
  if (!subtype?.trim()) return null;
  return subtype.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

export function isFinanceDocumentProfile(input: FinancePlannerInput): boolean {
  if (input.effectiveDocumentType === 'INVOICE') {
    return true;
  }

  const normalizedSubtype = normalizeFinanceDocumentSubtype(input.documentSubtype);
  if (normalizedSubtype) {
    if (CREDIT_NOTE_SUBTYPES.has(normalizedSubtype) || PAYMENT_REMINDER_SUBTYPES.has(normalizedSubtype)) {
      return true;
    }
    if (PAYMENT_PROOF_SUBTYPES.has(normalizedSubtype)) {
      return input.documentCategory === 'FINANCE';
    }
    if (INCOMING_INVOICE_SUBTYPES.has(normalizedSubtype)) {
      return input.documentCategory === 'FINANCE';
    }
  }

  const documentKind = normalizeFinanceDocumentSubtype(
    String(input.confirmedData.documentKind ?? ''),
  );
  if (documentKind) {
    if (CREDIT_NOTE_SUBTYPES.has(documentKind) || PAYMENT_REMINDER_SUBTYPES.has(documentKind)) {
      return true;
    }
    if (PAYMENT_PROOF_SUBTYPES.has(documentKind)) {
      return input.documentCategory === 'FINANCE';
    }
    if (INCOMING_INVOICE_SUBTYPES.has(documentKind)) {
      return input.documentCategory === 'FINANCE';
    }
  }

  return false;
}

export function resolveFinanceDocumentMode(input: FinancePlannerInput): FinanceDocumentMode {
  const normalized = normalizeFinanceDocumentSubtype(input.documentSubtype);
  if (normalized && CREDIT_NOTE_SUBTYPES.has(normalized)) {
    return FINANCE_DOCUMENT_MODES.CREDIT_NOTE;
  }
  if (normalized && PAYMENT_REMINDER_SUBTYPES.has(normalized)) {
    return FINANCE_DOCUMENT_MODES.PAYMENT_REMINDER;
  }
  if (normalized && PAYMENT_PROOF_SUBTYPES.has(normalized)) {
    return FINANCE_DOCUMENT_MODES.PAYMENT_PROOF;
  }

  const documentKind = normalizeFinanceDocumentSubtype(
    String(input.confirmedData.documentKind ?? ''),
  );
  if (documentKind && CREDIT_NOTE_SUBTYPES.has(documentKind)) {
    return FINANCE_DOCUMENT_MODES.CREDIT_NOTE;
  }
  if (documentKind && PAYMENT_REMINDER_SUBTYPES.has(documentKind)) {
    return FINANCE_DOCUMENT_MODES.PAYMENT_REMINDER;
  }
  if (documentKind && PAYMENT_PROOF_SUBTYPES.has(documentKind)) {
    return FINANCE_DOCUMENT_MODES.PAYMENT_PROOF;
  }

  if (input.confirmedData.isCreditNote === true || input.confirmedData.creditNote === true) {
    return FINANCE_DOCUMENT_MODES.CREDIT_NOTE;
  }

  return FINANCE_DOCUMENT_MODES.INCOMING_INVOICE;
}

function isCreditAmount(data: Record<string, unknown>): boolean {
  const total = readTotalGrossCents(data);
  return total != null && total < 0;
}

export function assessFinanceDraftRequirements(
  input: FinancePlannerInput,
): FinanceDraftRequirementAssessment {
  const mode = resolveFinanceDocumentMode(input);
  const data = input.confirmedData;
  const amountTaxAssessment = assessInvoiceAmountTaxSemantics(data);
  const missingRequirements: FinanceMissingRequirement[] = [];

  if (mode === FINANCE_DOCUMENT_MODES.PAYMENT_PROOF) {
    return {
      missingRequirements,
      amountTaxAssessment,
      canCreateInvoiceDraft: false,
      canCreateCreditNoteDraft: false,
      planOutcome: FINANCE_PLAN_OUTCOMES.READY,
    };
  }

  if (mode === FINANCE_DOCUMENT_MODES.PAYMENT_REMINDER) {
    return {
      missingRequirements,
      amountTaxAssessment,
      canCreateInvoiceDraft: false,
      canCreateCreditNoteDraft: false,
      planOutcome: FINANCE_PLAN_OUTCOMES.READY,
    };
  }

  if (!readInvoiceNumber(data)) {
    missingRequirements.push({
      code: 'MISSING_INVOICE_NUMBER',
      message: 'Invoice number is required before a finance draft can be created.',
      fieldKeys: ['invoiceNumber'],
    });
  }

  if (amountTaxAssessment.amountSemantics === 'MISSING') {
    missingRequirements.push({
      code: 'MISSING_AMOUNT_SEMANTICS',
      message: 'Gross, net, tax, and tax rate must be explicit or marked unclear.',
      fieldKeys: amountTaxAssessment.missingFieldKeys,
    });
  } else if (
    amountTaxAssessment.amountSemantics === 'UNCLEAR' ||
    amountTaxAssessment.taxSemantics === 'UNCLEAR'
  ) {
    missingRequirements.push({
      code: 'UNCLEAR_AMOUNT_OR_TAX_SEMANTICS',
      message: 'Amount or tax semantics are unclear — draft creation requires operator review.',
      fieldKeys: amountTaxAssessment.missingFieldKeys,
    });
  }

  const semanticsReady =
    amountTaxAssessment.amountSemantics === 'EXPLICIT' ||
    amountTaxAssessment.taxSemantics === 'TAX_FREE';
  const taxReady =
    amountTaxAssessment.taxSemantics === 'EXPLICIT' ||
    amountTaxAssessment.taxSemantics === 'TAX_FREE';

  const canCreateCreditNoteDraft =
    mode === FINANCE_DOCUMENT_MODES.CREDIT_NOTE &&
    Boolean(readInvoiceNumber(data)) &&
    semanticsReady &&
    taxReady &&
    (isCreditAmount(data) || data.isCreditNote === true || data.creditNote === true);

  const canCreateInvoiceDraft =
    mode === FINANCE_DOCUMENT_MODES.INCOMING_INVOICE &&
    Boolean(readInvoiceNumber(data)) &&
    semanticsReady &&
    taxReady &&
    !isCreditAmount(data);

  let planOutcome: FinancePlanOutcome = FINANCE_PLAN_OUTCOMES.READY;
  if (amountTaxAssessment.amountSemantics === 'MISSING') {
    planOutcome = FINANCE_PLAN_OUTCOMES.BLOCKED;
  } else if (
    !readInvoiceNumber(data) ||
    amountTaxAssessment.amountSemantics === 'UNCLEAR' ||
    amountTaxAssessment.taxSemantics === 'UNCLEAR'
  ) {
    planOutcome = FINANCE_PLAN_OUTCOMES.DRAFT_ONLY;
  } else if (!canCreateInvoiceDraft && !canCreateCreditNoteDraft) {
    planOutcome = FINANCE_PLAN_OUTCOMES.DRAFT_ONLY;
  }

  if (
    mode === FINANCE_DOCUMENT_MODES.CREDIT_NOTE &&
    !readOriginalInvoiceReference(data)
  ) {
    missingRequirements.push({
      code: 'MISSING_ORIGINAL_INVOICE_REFERENCE',
      message: 'Credit note should reference the original invoice.',
      fieldKeys: ['originalInvoiceReference', 'creditNoteReference'],
    });
  }

  return gateActionPlanOnPlausibility(
    {
      missingRequirements,
      amountTaxAssessment,
      canCreateInvoiceDraft,
      canCreateCreditNoteDraft,
      planOutcome,
    },
    input.plausibilityChecks ?? [],
  );
}

export function buildFinancePlannerSummary(
  mode: FinanceDocumentMode,
  planOutcome: FinancePlanOutcome,
  actionCount: number,
): string {
  if (mode === FINANCE_DOCUMENT_MODES.PAYMENT_PROOF) {
    return `Payment proof plan: ${actionCount} action(s); archive-only outcome.`;
  }
  if (mode === FINANCE_DOCUMENT_MODES.PAYMENT_REMINDER) {
    return `Payment reminder plan: ${actionCount} action(s); link to existing invoice when possible.`;
  }
  if (planOutcome === FINANCE_PLAN_OUTCOMES.BLOCKED) {
    return 'Finance plan blocked: missing amount semantics.';
  }
  if (planOutcome === FINANCE_PLAN_OUTCOMES.DRAFT_ONLY) {
    return 'Finance plan draft-only: missing invoice number or unclear amount/tax semantics.';
  }
  if (mode === FINANCE_DOCUMENT_MODES.CREDIT_NOTE) {
    return `Credit note plan: ${actionCount} action(s) including credit note draft preview.`;
  }
  return `Incoming invoice plan: ${actionCount} action(s) including invoice draft preview.`;
}

export function isCreditNoteProfile(
  input: FinancePlannerInput,
): boolean {
  return (
    resolveFinanceDocumentMode(input) === FINANCE_DOCUMENT_MODES.CREDIT_NOTE ||
    isCreditNoteDocument(input.confirmedData, input.documentSubtype)
  );
}

export type FinancePlannedAction = {
  semanticAction: FinanceSemanticAction;
  requirement: 'REQUIRED' | 'OPTIONAL' | 'INFORMATIONAL';
};

export type FinancePlanAssessment = {
  documentMode: FinanceDocumentMode;
  planOutcome: FinancePlanOutcome;
  actions: FinancePlannedAction[];
  duplicateVendorInvoiceId: string | null;
  missingRequirements: FinanceMissingRequirement[];
  amountTaxAssessment: InvoiceAmountTaxAssessment;
  canCreateInvoiceDraft: boolean;
  canCreateCreditNoteDraft: boolean;
};

export function assessFinancePlan(
  input: FinancePlannerInput & { duplicateVendorInvoiceId?: string | null },
): FinancePlanAssessment {
  const draft = assessFinanceDraftRequirements(input);
  const mode = resolveFinanceDocumentMode(input);
  const actions: FinancePlannedAction[] = [];
  const missingRequirements = [...draft.missingRequirements];

  if (input.duplicateVendorInvoiceId) {
    missingRequirements.push({
      code: 'INVOICE_DUPLICATE_VENDOR_NUMBER',
      message: 'An invoice with the same number already exists for this vendor.',
      fieldKeys: ['invoiceNumber', 'vendorName', 'supplier'],
    });
  }

  let planOutcome = draft.planOutcome;
  if (input.duplicateVendorInvoiceId) {
    planOutcome = FINANCE_PLAN_OUTCOMES.BLOCKED;
  }

  if (planOutcome !== FINANCE_PLAN_OUTCOMES.BLOCKED) {
    if (mode === FINANCE_DOCUMENT_MODES.CREDIT_NOTE) {
      actions.push({
        semanticAction: FINANCE_SEMANTIC_ACTIONS.CREATE_CREDIT_NOTE_DRAFT,
        requirement: 'REQUIRED',
      });
    } else if (mode === FINANCE_DOCUMENT_MODES.INCOMING_INVOICE) {
      actions.push({
        semanticAction: FINANCE_SEMANTIC_ACTIONS.CREATE_INVOICE_DRAFT,
        requirement: 'REQUIRED',
      });
    }
  }

  return gateActionPlanOnPlausibility(
    {
      documentMode: mode,
      planOutcome,
      actions,
      duplicateVendorInvoiceId: input.duplicateVendorInvoiceId ?? null,
      missingRequirements,
      amountTaxAssessment: draft.amountTaxAssessment,
      canCreateInvoiceDraft: draft.canCreateInvoiceDraft,
      canCreateCreditNoteDraft: draft.canCreateCreditNoteDraft,
    },
    input.plausibilityChecks ?? [],
  );
}
