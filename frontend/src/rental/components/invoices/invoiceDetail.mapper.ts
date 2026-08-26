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
  rentalInvoiceDetailPrimaryFormatAmount,
  rentalInvoiceDetailPrimaryFormatDate,
  rentalInvoiceDetailPrimaryGateReason,
  rentalInvoiceDetailPrimaryStatusLabel,
  rentalInvoiceDetailPrimaryTypeLabel,
} from '../../lib/rental-invoice-detail-primary-i18n';

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
    isDraft ? undefined : rentalInvoiceDetailPrimaryGateReason(locale, 'issueNotDraft'),
  );

  const viewPdfGate = gate(
    hasPdf,
    hasGeneratedPdf
      ? undefined
      : hasAttachment
        ? undefined
        : rentalInvoiceDetailPrimaryGateReason(locale, 'noPdfYet'),
  );

  let generateReason: string | undefined;
  if (hasGeneratedPdf) {
    generateReason = rentalInvoiceDetailPrimaryGateReason(locale, 'pdfAlreadyExists');
  } else if (!outgoing) {
    generateReason = rentalInvoiceDetailPrimaryGateReason(locale, 'pdfOutgoingOnly');
  } else if (isDraft) {
    generateReason = rentalInvoiceDetailPrimaryGateReason(locale, 'issueBeforePdf');
  } else if (terminal) {
    generateReason = rentalInvoiceDetailPrimaryGateReason(locale, 'pdfTerminalState');
  } else if (!regenerateDocumentType) {
    generateReason = rentalInvoiceDetailPrimaryGateReason(locale, 'pdfTypeUnavailable');
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
    emailReason = rentalInvoiceDetailPrimaryGateReason(locale, 'emailAdminOnly');
  } else if (!outgoing) {
    emailReason = rentalInvoiceDetailPrimaryGateReason(locale, 'emailOutgoingOnly');
  } else if (isDraft) {
    emailReason = rentalInvoiceDetailPrimaryGateReason(locale, 'issueFirst');
  } else if (!hasGeneratedPdf) {
    emailReason = rentalInvoiceDetailPrimaryGateReason(locale, 'emailNeedsPdf');
  }

  const sendEmailGate = gate(
    ctx.canManageEmail && outgoing && !isDraft && hasGeneratedPdf,
    emailReason,
  );

  const regeneratePdfGate = gate(
    Boolean(regenerateDocumentType && hasGeneratedPdf && !isDraft && !terminal),
    !regenerateDocumentType
      ? rentalInvoiceDetailPrimaryGateReason(locale, 'regenerateBookingOnly')
      : !hasGeneratedPdf
        ? rentalInvoiceDetailPrimaryGateReason(locale, 'generatePdfFirst')
        : isDraft
          ? rentalInvoiceDetailPrimaryGateReason(locale, 'issueFirst')
          : undefined,
  );

  const markSentGate = gate(
    canMarkSent(invoice.status, invoice.type),
    outgoing
      ? rentalInvoiceDetailPrimaryGateReason(locale, 'markSentState')
      : rentalInvoiceDetailPrimaryGateReason(locale, 'outgoingOnly'),
  );

  const recordPaymentGate = gate(
    canFinance,
    !canRecordPayment(invoice.status)
      ? rentalInvoiceDetailPrimaryGateReason(locale, 'paymentStatusBlocked')
      : outstanding <= 0
        ? rentalInvoiceDetailPrimaryGateReason(locale, 'noOutstandingAmount')
        : undefined,
  );

  const editGate = gate(
    ['DRAFT', 'NEEDS_REVIEW'].includes(invoice.status),
    rentalInvoiceDetailPrimaryGateReason(locale, 'editDraftOrReview'),
  );

  const cancelGate = gate(
    (ctx.canManageFinance !== false) &&
      canCancelInvoice(invoice.status, paidCents, invoice.totalCents),
    ctx.canManageFinance === false
      ? rentalInvoiceDetailPrimaryGateReason(locale, 'cancelNoPermission')
      : rentalInvoiceDetailPrimaryGateReason(locale, 'cancelStatusBlocked'),
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
      typeLabel: rentalInvoiceDetailPrimaryTypeLabel(locale, invoice.type) || ty.label,
      status: invoice.status,
      statusLabel: rentalInvoiceDetailPrimaryStatusLabel(locale, invoice.status),
      currency,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
    },
    amounts: {
      totalCents: invoice.totalCents,
      paidCents,
      outstandingCents: outstanding,
      totalFormatted: rentalInvoiceDetailPrimaryFormatAmount(locale, invoice.totalCents, currency),
      paidFormatted: rentalInvoiceDetailPrimaryFormatAmount(locale, paidCents, currency),
      outstandingFormatted: rentalInvoiceDetailPrimaryFormatAmount(locale, outstanding, currency),
      invoiceDateFormatted: rentalInvoiceDetailPrimaryFormatDate(locale, invoice.invoiceDate),
      dueDateFormatted: rentalInvoiceDetailPrimaryFormatDate(locale, invoice.dueDate),
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
      locale,
    ),
  };
}
