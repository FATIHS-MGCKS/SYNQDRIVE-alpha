import { INVOICE_TYPE_MAP } from './invoice-detail.constants';
import {
  canCancelInvoice,
  canIssue,
  canMarkSent,
  canRecordPayment,
  displayNumber,
  isOutgoing,
} from './invoiceFormatters';
import type { Invoice } from './invoiceTypes';
import type { InvoiceActionGate, InvoiceDetailDto } from './invoiceDetailTypes';
import { documentGatesFromPanel } from './invoiceDocuments.mapper';
import type { InvoiceDocumentsPanel } from './invoiceDocumentTypes';
import { buildInvoiceRelationsDto } from './invoiceRelations.mapper';
import type { InvoiceRelationsEnrichment, InvoiceRelationsPermissions } from './invoiceRelations.mapper';
import {
  rentalInvoiceDetailHeaderFormatAmount,
  rentalInvoiceDetailHeaderFormatDate,
  rentalInvoiceDetailHeaderGateReason,
  rentalInvoiceDetailHeaderStatusLabel,
  rentalInvoiceDetailHeaderTypeLabel,
} from '../../lib/rental-invoice-detail-header-i18n';

export interface BuildInvoiceDetailDtoContext {
  locale?: string;
  canManageEmail: boolean;
  canManageFinance?: boolean;
  relationsEnrichment?: InvoiceRelationsEnrichment;
  relationsPermissions?: InvoiceRelationsPermissions;
  documentsPanel?: InvoiceDocumentsPanel | null;
}

function gate(allowed: boolean, reason?: string): InvoiceActionGate {
  return allowed ? { allowed: true } : { allowed: false, reason };
}

export function buildInvoiceDetailDto(
  invoice: Invoice,
  ctx: BuildInvoiceDetailDtoContext,
): InvoiceDetailDto {
  const locale = ctx.locale ?? 'de';
  const ty = INVOICE_TYPE_MAP[invoice.type] || INVOICE_TYPE_MAP.OUTGOING_MANUAL;
  const paidCents = invoice.paidCents ?? 0;
  const outstanding =
    invoice.outstandingCents ?? Math.max(0, invoice.totalCents - paidCents);
  const currency = invoice.currency || 'EUR';
  const outgoing = isOutgoing(invoice.type);
  const hasPanelDocument = Boolean(ctx.documentsPanel?.activeDocument);
  const hasGeneratedPdf = hasPanelDocument || Boolean(invoice.generatedDocumentId);
  const hasAttachment = ctx.documentsPanel?.hasIncomingAttachment ?? Boolean(invoice.imageUrl);
  const hasPdf = hasGeneratedPdf || hasAttachment;
  const bookingId = invoice.bookingId;
  const supportsPdfGeneration =
    outgoing &&
    (invoice.type === 'OUTGOING_BOOKING' ||
      invoice.type === 'OUTGOING_MANUAL' ||
      invoice.type === 'OUTGOING_FINAL');
  const regenerateDocumentType =
    bookingId && invoice.type === 'OUTGOING_BOOKING' ? 'BOOKING_INVOICE' : supportsPdfGeneration ? 'INVOICE' : null;
  const terminal = ['CANCELLED', 'VOID', 'CREDITED', 'REJECTED'].includes(invoice.status);
  const isDraft = invoice.status === 'DRAFT';
  const canFinance =
    ctx.canManageFinance !== false &&
    canRecordPayment(invoice.status) &&
    outstanding > 0 &&
    invoice.status !== 'PAID';

  const issueGate = gate(
    canIssue(invoice.status, invoice.type),
    isDraft ? undefined : rentalInvoiceDetailHeaderGateReason(locale, 'issueNotDraft'),
  );

  const viewPdfGate = gate(
    hasPdf,
    hasGeneratedPdf
      ? undefined
      : hasAttachment
        ? undefined
        : rentalInvoiceDetailHeaderGateReason(locale, 'noPdfYet'),
  );

  let generateReason: string | undefined;
  if (hasGeneratedPdf) {
    generateReason = rentalInvoiceDetailHeaderGateReason(locale, 'pdfAlreadyExists');
  } else if (!outgoing) {
    generateReason = rentalInvoiceDetailHeaderGateReason(locale, 'pdfOutgoingOnly');
  } else if (isDraft) {
    generateReason = rentalInvoiceDetailHeaderGateReason(locale, 'issueBeforePdf');
  } else if (terminal) {
    generateReason = rentalInvoiceDetailHeaderGateReason(locale, 'pdfTerminalState');
  } else if (!regenerateDocumentType) {
    generateReason = rentalInvoiceDetailHeaderGateReason(locale, 'pdfTypeUnavailable');
  }

  const generatePdfGate = gate(
    !hasGeneratedPdf &&
      outgoing &&
      !isDraft &&
      !terminal &&
      Boolean(regenerateDocumentType),
    generateReason,
  );

  let emailReason: string | undefined;
  if (!ctx.canManageEmail) {
    emailReason = rentalInvoiceDetailHeaderGateReason(locale, 'emailAdminOnly');
  } else if (!outgoing) {
    emailReason = rentalInvoiceDetailHeaderGateReason(locale, 'emailOutgoingOnly');
  } else if (isDraft) {
    emailReason = rentalInvoiceDetailHeaderGateReason(locale, 'issueFirst');
  } else if (!hasGeneratedPdf) {
    emailReason = rentalInvoiceDetailHeaderGateReason(locale, 'emailNeedsPdf');
  }

  const sendEmailGate = gate(
    ctx.canManageEmail && outgoing && !isDraft && hasGeneratedPdf,
    emailReason,
  );

  const regeneratePdfGate = gate(
    Boolean(regenerateDocumentType && hasGeneratedPdf && !isDraft && !terminal),
    !regenerateDocumentType
      ? rentalInvoiceDetailHeaderGateReason(locale, 'regenerateBookingOnly')
      : !hasGeneratedPdf
        ? rentalInvoiceDetailHeaderGateReason(locale, 'generatePdfFirst')
        : isDraft
          ? rentalInvoiceDetailHeaderGateReason(locale, 'issueFirst')
          : undefined,
  );

  const markSentGate = gate(
    canMarkSent(invoice.status, invoice.type),
    outgoing
      ? rentalInvoiceDetailHeaderGateReason(locale, 'markSentState')
      : rentalInvoiceDetailHeaderGateReason(locale, 'outgoingOnly'),
  );

  const recordPaymentGate = gate(
    canFinance,
    !canRecordPayment(invoice.status)
      ? rentalInvoiceDetailHeaderGateReason(locale, 'paymentStatusBlocked')
      : outstanding <= 0
        ? rentalInvoiceDetailHeaderGateReason(locale, 'noOutstandingAmount')
        : undefined,
  );

  const editGate = gate(
    ['DRAFT', 'NEEDS_REVIEW'].includes(invoice.status),
    rentalInvoiceDetailHeaderGateReason(locale, 'editDraftOrReview'),
  );

  const cancelGate = gate(
    (ctx.canManageFinance !== false) &&
      canCancelInvoice(invoice.status, paidCents, invoice.totalCents),
    ctx.canManageFinance === false
      ? rentalInvoiceDetailHeaderGateReason(locale, 'cancelNoPermission')
      : rentalInvoiceDetailHeaderGateReason(locale, 'cancelStatusBlocked'),
  );

  const copyIdGate = gate(true);

  const panelGates = documentGatesFromPanel(ctx.documentsPanel);
  const resolvedViewPdf = panelGates?.viewPdf ?? viewPdfGate;
  const resolvedGeneratePdf = panelGates?.generatePdf ?? generatePdfGate;
  const resolvedSendEmail = panelGates?.sendEmail ?? sendEmailGate;
  const resolvedRegeneratePdf = panelGates?.regeneratePdf ?? regeneratePdfGate;

  const actions = {
    view_pdf: resolvedViewPdf,
    generate_pdf: resolvedGeneratePdf,
    send_email: resolvedSendEmail,
    regenerate_pdf: resolvedRegeneratePdf,
    mark_sent_externally: markSentGate,
    record_payment: recordPaymentGate,
    edit: editGate,
    cancel: cancelGate,
    copy_internal_id: copyIdGate,
    issue: issueGate,
  };

  return {
    core: {
      invoiceId: invoice.id,
      invoiceNumberDisplay: displayNumber(invoice, locale),
      title: invoice.title,
      type: invoice.type,
      typeLabel: rentalInvoiceDetailHeaderTypeLabel(locale, invoice.type) || ty.label,
      status: invoice.status,
      statusLabel: rentalInvoiceDetailHeaderStatusLabel(locale, invoice.status),
      currency,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
    },
    amounts: {
      totalCents: invoice.totalCents,
      paidCents,
      outstandingCents: outstanding,
      totalFormatted: rentalInvoiceDetailHeaderFormatAmount(locale, invoice.totalCents, currency),
      paidFormatted: rentalInvoiceDetailHeaderFormatAmount(locale, paidCents, currency),
      outstandingFormatted: rentalInvoiceDetailHeaderFormatAmount(locale, outstanding, currency),
      invoiceDateFormatted: rentalInvoiceDetailHeaderFormatDate(locale, invoice.invoiceDate),
      dueDateFormatted: rentalInvoiceDetailHeaderFormatDate(locale, invoice.dueDate),
    },
    document: {
      hasPdf,
      generatedDocumentId: invoice.generatedDocumentId ?? null,
      bookingId,
      regenerateDocumentType,
      attachmentUrl: invoice.imageUrl,
    },
    permissions: {
      canManageEmail: ctx.canManageEmail,
      canManageFinance: ctx.canManageFinance !== false,
      canEditMetadata: editGate.allowed,
    },
    actions,
    primary: {
      viewPdf: resolvedViewPdf,
      generatePdf: resolvedGeneratePdf,
      sendEmail: resolvedSendEmail,
    },
    relations: buildInvoiceRelationsDto(
      invoice,
      ctx.relationsEnrichment,
      ctx.relationsPermissions,
    ),
  };
}
