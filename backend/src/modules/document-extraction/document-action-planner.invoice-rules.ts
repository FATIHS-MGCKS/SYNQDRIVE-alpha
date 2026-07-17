import type { DocumentEntityType } from '@prisma/client';
import type { PlannedDocumentActionInput } from './document-action.types';
import type {
  DocumentActionBlockingReason,
  DocumentActionMissingRequirement,
  DocumentActionPlannerBuildContext,
  DocumentActionPlannerInput,
  DocumentFollowUpCandidateType,
} from './document-action-planner.types';

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

export type AmountSemanticsStatus = 'EXPLICIT' | 'UNCLEAR' | 'MISSING';
export type TaxSemanticsStatus = 'EXPLICIT' | 'TAX_FREE' | 'UNCLEAR' | 'MISSING';

export type InvoiceTaxLine = {
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

const CREDIT_NOTE_SUBTYPES = new Set([
  'CREDIT_NOTE',
  'GUTSCHRIFT',
  'CREDIT_MEMO',
]);

const PAYMENT_REMINDER_SUBTYPES = new Set([
  'PAYMENT_REMINDER',
  'MAHNUNG',
  'DUNNING',
  'REMINDER',
]);

const PAYMENT_PROOF_SUBTYPES = new Set([
  'PAYMENT_PROOF',
  'ZAHLUNGSNACHWEIS',
  'PAYMENT_RECEIPT',
]);

const INCOMING_INVOICE_SUBTYPES = new Set([
  'INCOMING_INVOICE',
  'EINGANGSRECHNUNG',
  'VENDOR_INVOICE',
  'STANDARD',
  'UNSPECIFIED',
]);

const LINK_ENTITY_TYPES: DocumentEntityType[] = ['VENDOR', 'VEHICLE', 'BOOKING'];

const SEMANTIC_LINK_BY_ENTITY: Record<DocumentEntityType, FinanceSemanticAction> = {
  VENDOR: FINANCE_SEMANTIC_ACTIONS.LINK_VENDOR,
  VEHICLE: FINANCE_SEMANTIC_ACTIONS.LINK_VEHICLE,
  BOOKING: FINANCE_SEMANTIC_ACTIONS.LINK_BOOKING,
  CUSTOMER: FINANCE_SEMANTIC_ACTIONS.LINK_VENDOR,
  DRIVER: FINANCE_SEMANTIC_ACTIONS.LINK_BOOKING,
  ORGANIZATION: FINANCE_SEMANTIC_ACTIONS.LINK_VENDOR,
};

export function normalizeFinanceDocumentSubtype(
  subtype: string | null | undefined,
): string | null {
  if (!subtype?.trim()) return null;
  return subtype.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

export function isFinanceDocumentProfile(
  input: Pick<
    DocumentActionPlannerInput,
    'effectiveDocumentType' | 'documentSubtype' | 'documentCategory' | 'confirmedData'
  >,
): boolean {
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

export function resolveFinanceDocumentMode(
  input: Pick<DocumentActionPlannerInput, 'documentSubtype' | 'confirmedData'>,
): FinanceDocumentMode {
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

function hasNonEmptyField(data: Record<string, unknown>, key: string): boolean {
  const value = data[key];
  return value != null && value !== '';
}

function readCents(data: Record<string, unknown>, key: string): number | null {
  const raw = data[key];
  if (raw == null || raw === '') return null;
  const cents = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(cents)) return null;
  return cents;
}

function readTaxRatePercent(data: Record<string, unknown>): number | null {
  const explicit = data.taxRatePercent ?? data.taxRate;
  if (explicit == null || explicit === '') return null;
  const rate = typeof explicit === 'number' ? explicit : Number(explicit);
  if (!Number.isFinite(rate)) return null;
  return rate;
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

  return {
    taxRatePercent,
    netCents,
    taxCents,
    grossCents,
  };
}

function readTaxLines(data: Record<string, unknown>): InvoiceTaxLine[] {
  const raw = data.taxLines;
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeTaxLine).filter((line): line is InvoiceTaxLine => line != null);
}

function hasAnyAmount(data: Record<string, unknown>): boolean {
  return (
    readCents(data, 'totalCents') != null ||
    readCents(data, 'grossCents') != null ||
    readCents(data, 'netCents') != null
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
  return null;
}

export function assessInvoiceAmountTaxSemantics(
  data: Record<string, unknown>,
): InvoiceAmountTaxAssessment {
  const missingFieldKeys: string[] = [];
  const explicitAmountSemantics = readExplicitAmountSemantics(data);
  const explicitTaxSemantics = readExplicitTaxSemantics(data);
  const taxLines = readTaxLines(data);

  if (explicitAmountSemantics === 'UNCLEAR' || explicitTaxSemantics === 'UNCLEAR') {
    return {
      amountSemantics: explicitAmountSemantics ?? 'UNCLEAR',
      taxSemantics: explicitTaxSemantics ?? 'UNCLEAR',
      taxLines,
      missingFieldKeys: ['amountSemantics'],
    };
  }

  if (!hasAnyAmount(data) && taxLines.length === 0) {
    missingFieldKeys.push('totalCents');
    return {
      amountSemantics: 'MISSING',
      taxSemantics: 'MISSING',
      taxLines,
      missingFieldKeys,
    };
  }

  if (explicitTaxSemantics === 'TAX_FREE') {
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

  const netCents = readCents(data, 'netCents');
  const taxCents = readCents(data, 'taxCents');
  const grossCents = readCents(data, 'grossCents') ?? readCents(data, 'totalCents');
  const taxRatePercent = readTaxRatePercent(data);

  if (netCents != null && taxCents != null && grossCents != null) {
    return {
      amountSemantics: explicitAmountSemantics ?? 'EXPLICIT',
      taxSemantics:
        taxCents === 0 || taxRatePercent === 0
          ? 'TAX_FREE'
          : explicitTaxSemantics ?? 'EXPLICIT',
      taxLines: [
        {
          taxRatePercent,
          netCents,
          taxCents,
          grossCents,
        },
      ],
      missingFieldKeys,
    };
  }

  if (taxRatePercent != null && grossCents != null && explicitAmountSemantics === 'EXPLICIT') {
    return {
      amountSemantics: 'EXPLICIT',
      taxSemantics: taxRatePercent === 0 ? 'TAX_FREE' : explicitTaxSemantics ?? 'EXPLICIT',
      taxLines: [
        {
          taxRatePercent,
          netCents,
          taxCents,
          grossCents,
        },
      ],
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
    missingFieldKeys: hasAnyAmount(data) ? ['amountSemantics'] : ['totalCents'],
  };
}

function hasInvoiceNumber(data: Record<string, unknown>): boolean {
  return (
    hasNonEmptyField(data, 'invoiceNumber') ||
    hasNonEmptyField(data, 'creditNoteNumber') ||
    hasNonEmptyField(data, 'documentNumber')
  );
}

function readReferencedInvoiceNumber(data: Record<string, unknown>): string | null {
  const value =
    data.referencedInvoiceNumber ??
    data.originalInvoiceNumber ??
    data.relatedInvoiceNumber ??
    data.invoiceReference;
  if (value == null || value === '') return null;
  return String(value).trim();
}

function isCreditAmount(data: Record<string, unknown>): boolean {
  const total = readCents(data, 'totalCents') ?? readCents(data, 'grossCents');
  return total != null && total < 0;
}

export type FinanceDraftRequirementAssessment = {
  missingRequirements: DocumentActionMissingRequirement[];
  amountTaxAssessment: InvoiceAmountTaxAssessment;
  canCreateInvoiceDraft: boolean;
  canCreateCreditNoteDraft: boolean;
  planOutcome: FinancePlanOutcome;
};

export function assessFinanceDraftRequirements(
  input: DocumentActionPlannerInput,
): FinanceDraftRequirementAssessment {
  const mode = resolveFinanceDocumentMode(input);
  const data = input.confirmedData;
  const amountTaxAssessment = assessInvoiceAmountTaxSemantics(data);
  const missingRequirements: DocumentActionMissingRequirement[] = [];
  const missingFieldKeys: string[] = [];

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

  if (!hasInvoiceNumber(data)) {
    missingFieldKeys.push('invoiceNumber');
    missingRequirements.push({
      code: 'MISSING_INVOICE_NUMBER',
      message: 'Invoice number is required before a finance draft can be created.',
      fieldKeys: ['invoiceNumber'],
    });
  }

  if (amountTaxAssessment.amountSemantics === 'MISSING') {
    missingFieldKeys.push(...amountTaxAssessment.missingFieldKeys);
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
    hasInvoiceNumber(data) &&
    semanticsReady &&
    taxReady &&
    (isCreditAmount(data) || data.isCreditNote === true || data.creditNote === true);

  const canCreateInvoiceDraft =
    mode === FINANCE_DOCUMENT_MODES.INCOMING_INVOICE &&
    hasInvoiceNumber(data) &&
    semanticsReady &&
    taxReady &&
    !isCreditAmount(data);

  let planOutcome: FinancePlanOutcome = FINANCE_PLAN_OUTCOMES.READY;
  if (amountTaxAssessment.amountSemantics === 'MISSING') {
    planOutcome = FINANCE_PLAN_OUTCOMES.BLOCKED;
  } else if (
    !hasInvoiceNumber(data) ||
    amountTaxAssessment.amountSemantics === 'UNCLEAR' ||
    amountTaxAssessment.taxSemantics === 'UNCLEAR'
  ) {
    planOutcome = FINANCE_PLAN_OUTCOMES.DRAFT_ONLY;
  } else if (!canCreateInvoiceDraft && !canCreateCreditNoteDraft) {
    planOutcome = FINANCE_PLAN_OUTCOMES.DRAFT_ONLY;
  }

  return {
    missingRequirements,
    amountTaxAssessment,
    canCreateInvoiceDraft,
    canCreateCreditNoteDraft,
    planOutcome,
  };
}

function hasConfirmedEntityLink(
  entityLinks: DocumentActionPlannerInput['entityLinks'],
  entityType: DocumentEntityType,
): boolean {
  return entityLinks.some(
    (link) => String(link.entityType).toUpperCase() === entityType && link.entityId?.trim(),
  );
}

function findUnconfirmedLinkCandidate(
  input: DocumentActionPlannerInput,
  entityType: DocumentEntityType,
): { entityId: string; confidence: number | null } | null {
  if (hasConfirmedEntityLink(input.entityLinks, entityType)) {
    return null;
  }

  const candidate = input.entityCandidates.find(
    (row) =>
      String(row.entityType).toUpperCase() === entityType &&
      row.entityId?.trim() &&
      String(row.status ?? 'PROPOSED').toUpperCase() !== 'REJECTED',
  );
  if (!candidate?.entityId?.trim()) return null;

  return {
    entityId: candidate.entityId.trim(),
    confidence: candidate.confidence ?? null,
  };
}

function findExistingInvoiceCandidate(
  input: DocumentActionPlannerInput,
): { entityId: string; confidence: number | null; invoiceNumber: string | null } | null {
  const referencedNumber = readReferencedInvoiceNumber(input.confirmedData);
  const candidate = input.entityCandidates.find((row) => {
    const type = String(row.entityType).toUpperCase();
    if (type !== 'INVOICE' && type !== 'ORG_INVOICE') return false;
    if (!row.entityId?.trim()) return false;
    if (String(row.status ?? 'PROPOSED').toUpperCase() === 'REJECTED') return false;
    return true;
  });

  if (!candidate?.entityId?.trim()) {
    return referencedNumber
      ? { entityId: '', confidence: null, invoiceNumber: referencedNumber }
      : null;
  }

  return {
    entityId: candidate.entityId.trim(),
    confidence: candidate.confidence ?? null,
    invoiceNumber: referencedNumber,
  };
}

function buildFinanceDraftPayload(
  ctx: DocumentActionPlannerBuildContext,
  semanticAction: FinanceSemanticAction,
): Record<string, unknown> {
  const data = ctx.input.confirmedData;
  const assessment = assessInvoiceAmountTaxSemantics(data);
  return {
    semanticAction,
    invoiceNumber:
      data.invoiceNumber ?? data.creditNoteNumber ?? data.documentNumber ?? null,
    eventDate: data.eventDate ?? data.invoiceDate ?? null,
    dueDate: data.dueDate ?? null,
    totalCents: readCents(data, 'totalCents'),
    grossCents: readCents(data, 'grossCents') ?? readCents(data, 'totalCents'),
    netCents: readCents(data, 'netCents'),
    taxCents: readCents(data, 'taxCents'),
    taxRatePercent: readTaxRatePercent(data),
    taxLines: assessment.taxLines,
    amountSemantics: assessment.amountSemantics,
    taxSemantics: assessment.taxSemantics,
    isCreditNote: semanticAction === FINANCE_SEMANTIC_ACTIONS.CREATE_CREDIT_NOTE_DRAFT,
    confirmedFieldKeys: Object.keys(data).sort(),
    note: 'Planner never applies a default VAT rate.',
  };
}

function buildFinanceDraftAction(
  ctx: DocumentActionPlannerBuildContext,
  semanticAction: FinanceSemanticAction,
  sequence: number,
): PlannedDocumentActionInput {
  const payload = buildFinanceDraftPayload(ctx, semanticAction);
  return {
    actionType: 'CREATE_INVOICE',
    requirement: 'REQUIRED',
    targetEntityType: hasConfirmedEntityLink(ctx.input.entityLinks, 'VEHICLE') ? 'VEHICLE' : null,
    targetEntityId: findUnconfirmedLinkCandidate(ctx.input, 'VEHICLE')?.entityId ?? ctx.vehicleEntityId,
    sequence,
    inputPayload: payload,
    previewPayload: {
      semanticAction,
      wouldCreate:
        semanticAction === FINANCE_SEMANTIC_ACTIONS.CREATE_CREDIT_NOTE_DRAFT
          ? 'credit_note_draft'
          : 'invoice_draft',
      ...payload,
    },
  };
}

function buildLinkSuggestionAction(
  entityType: DocumentEntityType,
  candidate: { entityId: string; confidence: number | null },
  sequence: number,
): PlannedDocumentActionInput {
  const semanticAction = SEMANTIC_LINK_BY_ENTITY[entityType];
  return {
    actionType: 'SUGGEST_TASK',
    requirement: 'OPTIONAL',
    targetEntityType: entityType,
    targetEntityId: null,
    sequence,
    inputPayload: {
      semanticAction,
      requiresConfirmation: true,
      candidateEntityId: candidate.entityId,
      candidateConfidence: candidate.confidence,
      note: 'Entity link is created only after explicit operator confirmation.',
    },
    previewPayload: {
      semanticAction,
      wouldLink: entityType,
      requiresConfirmation: true,
      candidateEntityId: candidate.entityId,
    },
  };
}

function buildSuggestionAction(
  semanticAction: FinanceSemanticAction,
  sequence: number,
  payload: Record<string, unknown>,
): PlannedDocumentActionInput {
  return {
    actionType: 'SUGGEST_TASK',
    requirement: 'OPTIONAL',
    sequence,
    inputPayload: {
      semanticAction,
      ...payload,
    },
    previewPayload: {
      semanticAction,
      wouldSuggest: semanticAction,
      ...payload,
    },
  };
}

function buildArchiveOnlyAction(
  ctx: DocumentActionPlannerBuildContext,
  sequence: number,
): PlannedDocumentActionInput {
  return {
    actionType: 'ARCHIVE_ONLY',
    requirement: 'INFORMATIONAL',
    targetEntityType: ctx.vehicleEntityId ? 'VEHICLE' : null,
    targetEntityId: ctx.vehicleEntityId,
    sequence,
    inputPayload: {
      semanticAction: FINANCE_SEMANTIC_ACTIONS.ARCHIVE_ONLY,
      reason: 'payment_proof_archive_only',
      confirmedFieldKeys: Object.keys(ctx.input.confirmedData).sort(),
    },
    previewPayload: {
      semanticAction: FINANCE_SEMANTIC_ACTIONS.ARCHIVE_ONLY,
      wouldArchiveOnly: true,
      reason: 'payment_proof_archive_only',
    },
  };
}

function buildExistingInvoiceLinkAction(
  candidate: { entityId: string; confidence: number | null; invoiceNumber: string | null },
  sequence: number,
): PlannedDocumentActionInput {
  return {
    actionType: 'SUGGEST_TASK',
    requirement: 'OPTIONAL',
    sequence,
    inputPayload: {
      semanticAction: FINANCE_SEMANTIC_ACTIONS.LINK_EXISTING_INVOICE,
      requiresConfirmation: true,
      candidateEntityId: candidate.entityId || null,
      referencedInvoiceNumber: candidate.invoiceNumber,
      candidateConfidence: candidate.confidence,
      note: 'Payment reminder should be linked to an existing invoice after confirmation.',
    },
    previewPayload: {
      semanticAction: FINANCE_SEMANTIC_ACTIONS.LINK_EXISTING_INVOICE,
      wouldLink: 'INVOICE',
      requiresConfirmation: true,
      candidateEntityId: candidate.entityId || null,
      referencedInvoiceNumber: candidate.invoiceNumber,
    },
  };
}

export function buildFinancePlannerActions(
  ctx: DocumentActionPlannerBuildContext,
): PlannedDocumentActionInput[] {
  const mode = resolveFinanceDocumentMode(ctx.input);
  const assessment = assessFinanceDraftRequirements(ctx.input);
  const actions: PlannedDocumentActionInput[] = [];
  let sequence = 0;

  if (mode === FINANCE_DOCUMENT_MODES.PAYMENT_PROOF) {
    sequence += 1;
    actions.push(buildArchiveOnlyAction(ctx, sequence));
    sequence += 1;
    actions.push(
      buildSuggestionAction(FINANCE_SEMANTIC_ACTIONS.SUGGEST_PAYMENT_REVIEW, sequence, {
        reason: 'payment_proof_review',
      }),
    );
    return actions;
  }

  if (mode === FINANCE_DOCUMENT_MODES.PAYMENT_REMINDER) {
    const invoiceCandidate = findExistingInvoiceCandidate(ctx.input);
    if (invoiceCandidate) {
      sequence += 1;
      actions.push(buildExistingInvoiceLinkAction(invoiceCandidate, sequence));
    }
    if (hasNonEmptyField(ctx.input.confirmedData, 'dueDate')) {
      sequence += 1;
      actions.push(
        buildSuggestionAction(FINANCE_SEMANTIC_ACTIONS.SUGGEST_DUE_DATE_TASK, sequence, {
          dueDate: ctx.input.confirmedData.dueDate,
        }),
      );
    }
    sequence += 1;
    actions.push(
      buildSuggestionAction(FINANCE_SEMANTIC_ACTIONS.SUGGEST_PAYMENT_REVIEW, sequence, {
        reason: 'payment_reminder_review',
      }),
    );
  } else if (assessment.canCreateCreditNoteDraft) {
    sequence += 1;
    actions.push(
      buildFinanceDraftAction(ctx, FINANCE_SEMANTIC_ACTIONS.CREATE_CREDIT_NOTE_DRAFT, sequence),
    );
  } else if (assessment.canCreateInvoiceDraft) {
    sequence += 1;
    actions.push(
      buildFinanceDraftAction(ctx, FINANCE_SEMANTIC_ACTIONS.CREATE_INVOICE_DRAFT, sequence),
    );
  }

  for (const entityType of LINK_ENTITY_TYPES) {
    const candidate = findUnconfirmedLinkCandidate(ctx.input, entityType);
    if (!candidate) continue;
    sequence += 1;
    actions.push(buildLinkSuggestionAction(entityType, candidate, sequence));
  }

  if (
    mode !== FINANCE_DOCUMENT_MODES.PAYMENT_REMINDER &&
    assessment.planOutcome === FINANCE_PLAN_OUTCOMES.DRAFT_ONLY
  ) {
    sequence += 1;
    actions.push(
      buildSuggestionAction(FINANCE_SEMANTIC_ACTIONS.SUGGEST_PAYMENT_REVIEW, sequence, {
        reason: 'finance_draft_requires_review',
        planOutcome: assessment.planOutcome,
      }),
    );
  }

  if (
    hasNonEmptyField(ctx.input.confirmedData, 'dueDate') &&
    mode !== FINANCE_DOCUMENT_MODES.PAYMENT_REMINDER
  ) {
    sequence += 1;
    actions.push(
      buildSuggestionAction(FINANCE_SEMANTIC_ACTIONS.SUGGEST_DUE_DATE_TASK, sequence, {
        dueDate: ctx.input.confirmedData.dueDate,
      }),
    );
  }

  return actions;
}

export function resolveFinanceFollowUpCandidateTypes(
  mode: FinanceDocumentMode,
  planOutcome: FinancePlanOutcome,
): DocumentFollowUpCandidateType[] {
  const followUps: DocumentFollowUpCandidateType[] = ['MANUAL_REVIEW'];
  if (mode === FINANCE_DOCUMENT_MODES.PAYMENT_REMINDER || planOutcome === FINANCE_PLAN_OUTCOMES.DRAFT_ONLY) {
    followUps.push('CREATE_TASK');
  }
  if (mode === FINANCE_DOCUMENT_MODES.INCOMING_INVOICE && planOutcome === FINANCE_PLAN_OUTCOMES.READY) {
    followUps.push('REQUEST_CUSTOMER_INFO');
  }
  return [...new Set(followUps)].sort();
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
    return `Finance plan blocked: missing amount semantics.`;
  }
  if (planOutcome === FINANCE_PLAN_OUTCOMES.DRAFT_ONLY) {
    return `Finance plan draft-only: missing invoice number or unclear amount/tax semantics.`;
  }
  if (mode === FINANCE_DOCUMENT_MODES.CREDIT_NOTE) {
    return `Credit note plan: ${actionCount} action(s) including credit note draft preview.`;
  }
  return `Incoming invoice plan: ${actionCount} action(s) including invoice draft preview.`;
}

export function extractFinanceSemanticAction(
  payload: Record<string, unknown> | null | undefined,
): FinanceSemanticAction | null {
  const value = payload?.semanticAction;
  if (typeof value !== 'string') return null;
  return Object.values(FINANCE_SEMANTIC_ACTIONS).includes(value as FinanceSemanticAction)
    ? (value as FinanceSemanticAction)
    : null;
}

export function stripFinanceDraftActions(
  actions: PlannedDocumentActionInput[],
): PlannedDocumentActionInput[] {
  return actions.filter((action) => {
    const semantic = extractFinanceSemanticAction(
      (action.previewPayload ?? action.inputPayload) as Record<string, unknown>,
    );
    return (
      semantic !== FINANCE_SEMANTIC_ACTIONS.CREATE_INVOICE_DRAFT &&
      semantic !== FINANCE_SEMANTIC_ACTIONS.CREATE_CREDIT_NOTE_DRAFT
    );
  });
}
