import { INVOICE_TYPE_MAP } from './invoiceConstants';
import {
  STATUS_MAP,
  canIssue,
  canMarkSent,
  canRecordPayment,
  displayNumber,
  formatAmount,
  formatDate,
  isOutgoing,
} from './invoiceFormatters';
import type { Invoice } from './invoiceTypes';
import type { InvoiceActionGate, InvoiceDetailDto } from './invoiceDetailTypes';
import { buildInvoiceRelationsDto } from './invoiceRelations.mapper';
import type { InvoiceRelationsEnrichment, InvoiceRelationsPermissions } from './invoiceRelations.mapper';

export interface BuildInvoiceDetailDtoContext {
  canManageEmail: boolean;
  canManageFinance?: boolean;
  relationsEnrichment?: InvoiceRelationsEnrichment;
  relationsPermissions?: InvoiceRelationsPermissions;
}

function gate(allowed: boolean, reason?: string): InvoiceActionGate {
  return allowed ? { allowed: true } : { allowed: false, reason };
}

export function buildInvoiceDetailDto(
  invoice: Invoice,
  ctx: BuildInvoiceDetailDtoContext,
): InvoiceDetailDto {
  const ty = INVOICE_TYPE_MAP[invoice.type] || INVOICE_TYPE_MAP.OUTGOING_MANUAL;
  const st = STATUS_MAP[invoice.status] || STATUS_MAP.DRAFT;
  const paidCents = invoice.paidCents ?? 0;
  const outstanding =
    invoice.outstandingCents ?? Math.max(0, invoice.totalCents - paidCents);
  const currency = invoice.currency || 'EUR';
  const outgoing = isOutgoing(invoice.type);
  const hasGeneratedPdf = Boolean(invoice.generatedDocumentId);
  const hasAttachment = Boolean(invoice.imageUrl);
  const hasPdf = hasGeneratedPdf || hasAttachment;
  const bookingId = invoice.bookingId;
  const regenerateDocumentType =
    bookingId && invoice.type === 'OUTGOING_BOOKING' ? 'BOOKING_INVOICE' : null;
  const terminal = ['CANCELLED', 'VOID', 'CREDITED', 'REJECTED'].includes(invoice.status);
  const isDraft = invoice.status === 'DRAFT';
  const canFinance =
    ctx.canManageFinance !== false &&
    canRecordPayment(invoice.status) &&
    outstanding > 0 &&
    invoice.status !== 'PAID';

  const issueGate = gate(
    canIssue(invoice.status, invoice.type),
    isDraft ? undefined : 'Nur Entwürfe können ausgestellt werden',
  );

  const viewPdfGate = gate(
    hasPdf,
    hasGeneratedPdf
      ? undefined
      : hasAttachment
        ? undefined
        : 'Noch kein PDF vorhanden',
  );

  let generateReason: string | undefined;
  if (hasGeneratedPdf) {
    generateReason = 'PDF ist bereits vorhanden — „PDF neu erzeugen“ im Menü';
  } else if (!outgoing) {
    generateReason = 'PDF-Generierung nur für Ausgangsrechnungen';
  } else if (isDraft) {
    generateReason = 'Zuerst ausstellen, danach PDF erzeugen';
  } else if (terminal) {
    generateReason = 'Für stornierte oder abgeschlossene Sonderfälle nicht verfügbar';
  } else if (!regenerateDocumentType) {
    generateReason = 'PDF-Generierung ist derzeit nur für Buchungsrechnungen verfügbar';
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
    emailReason = 'Nur Administratoren können Rechnungen per E-Mail senden';
  } else if (!outgoing) {
    emailReason = 'E-Mail-Versand nur für Ausgangsrechnungen';
  } else if (isDraft) {
    emailReason = 'Zuerst ausstellen';
  } else if (!hasGeneratedPdf || !bookingId) {
    emailReason = 'E-Mail erfordert Buchung und generiertes PDF';
  }

  const sendEmailGate = gate(
    ctx.canManageEmail &&
      outgoing &&
      !isDraft &&
      Boolean(bookingId && hasGeneratedPdf),
    emailReason,
  );

  const regeneratePdfGate = gate(
    Boolean(regenerateDocumentType && hasGeneratedPdf && !isDraft && !terminal),
    !regenerateDocumentType
      ? 'Nur für Buchungsrechnungen mit PDF'
      : !hasGeneratedPdf
        ? 'Zuerst PDF erzeugen'
        : isDraft
          ? 'Zuerst ausstellen'
          : undefined,
  );

  const markSentGate = gate(
    canMarkSent(invoice.status, invoice.type),
    outgoing
      ? 'Bereits gesendet oder noch nicht ausgestellt'
      : 'Nur für Ausgangsrechnungen',
  );

  const recordPaymentGate = gate(
    canFinance,
    !canRecordPayment(invoice.status)
      ? 'Für diesen Status nicht möglich'
      : outstanding <= 0
        ? 'Kein offener Betrag'
        : undefined,
  );

  const editGate = gate(
    ['DRAFT', 'NEEDS_REVIEW'].includes(invoice.status),
    'Bearbeiten nur für Entwürfe oder Rechnungen in Prüfung',
  );

  const cancelGate = gate(false, 'Stornierung ist in dieser Version noch nicht freigeschaltet');

  const copyIdGate = gate(true);

  const actions = {
    view_pdf: viewPdfGate,
    generate_pdf: generatePdfGate,
    send_email: sendEmailGate,
    regenerate_pdf: regeneratePdfGate,
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
      invoiceNumberDisplay: displayNumber(invoice),
      title: invoice.title,
      type: invoice.type,
      typeLabel: ty.label,
      status: invoice.status,
      statusLabel: st.label,
      currency,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
    },
    amounts: {
      totalCents: invoice.totalCents,
      paidCents,
      outstandingCents: outstanding,
      totalFormatted: formatAmount(invoice.totalCents, currency),
      paidFormatted: formatAmount(paidCents, currency),
      outstandingFormatted: formatAmount(outstanding, currency),
      invoiceDateFormatted: formatDate(invoice.invoiceDate),
      dueDateFormatted: formatDate(invoice.dueDate),
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
      viewPdf: viewPdfGate,
      generatePdf: generatePdfGate,
      sendEmail: sendEmailGate,
    },
    relations: buildInvoiceRelationsDto(
      invoice,
      ctx.relationsEnrichment,
      ctx.relationsPermissions,
    ),
  };
}
