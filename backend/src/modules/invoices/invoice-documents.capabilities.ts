import { OrgInvoiceStatus, OrgInvoiceType } from '@prisma/client';
import { DOCUMENT_STATUS } from '@modules/documents/documents.constants';
import { isOutgoingInvoiceType } from './invoice-domain.util';

export interface InvoiceDocumentCapability {
  allowed: boolean;
  reason: string | null;
}

export interface InvoiceDocumentsCapabilityContext {
  invoiceType: OrgInvoiceType | string;
  invoiceStatus: OrgInvoiceStatus | string;
  isAdmin: boolean;
  isGenerating: boolean;
  hasActiveDocument: boolean;
  hasSendableDocument: boolean;
  hasIncomingAttachment: boolean;
  lastGenerationFailed: boolean;
  canGeneratePdf: boolean;
}

function cap(allowed: boolean, reason: string | null = null): InvoiceDocumentCapability {
  return { allowed, reason };
}

export function buildInvoiceDocumentCapabilities(
  ctx: InvoiceDocumentsCapabilityContext,
): {
  preview: InvoiceDocumentCapability;
  download: InvoiceDocumentCapability;
  sendEmail: InvoiceDocumentCapability;
  generate: InvoiceDocumentCapability;
  regenerate: InvoiceDocumentCapability;
  retry: InvoiceDocumentCapability;
} {
  const outgoing = isOutgoingInvoiceType(ctx.invoiceType);
  const terminal = ['CANCELLED', 'VOID', 'CREDITED', 'REJECTED'].includes(ctx.invoiceStatus);
  const isDraft = ctx.invoiceStatus === 'DRAFT';

  const preview = (() => {
    if (ctx.hasActiveDocument) return cap(true);
    if (ctx.hasIncomingAttachment) return cap(true);
    return cap(false, 'Noch kein Dokument vorhanden');
  })();

  const download = (() => {
    if (ctx.hasActiveDocument) return cap(true);
    if (ctx.hasIncomingAttachment) return cap(true);
    return cap(false, 'Noch kein Dokument vorhanden');
  })();

  const sendEmail = (() => {
    if (!outgoing) return cap(false, 'E-Mail-Versand nur für Ausgangsrechnungen');
    if (!ctx.isAdmin) return cap(false, 'Nur Administratoren können Rechnungen per E-Mail senden');
    if (isDraft) return cap(false, 'Zuerst ausstellen, danach per E-Mail senden');
    if (terminal) return cap(false, 'Für stornierte Rechnungen nicht verfügbar');
    if (!ctx.hasSendableDocument) return cap(false, 'PDF muss zuerst erzeugt werden');
    return cap(true);
  })();

  const generate = (() => {
    if (!outgoing) return cap(false, 'PDF-Erzeugung nur für Ausgangsrechnungen');
    if (!ctx.canGeneratePdf) return cap(false, 'PDF-Erzeugung für diesen Rechnungstyp nicht verfügbar');
    if (isDraft) return cap(false, 'Zuerst ausstellen, danach PDF erzeugen');
    if (terminal) return cap(false, 'Für abgeschlossene Sonderfälle nicht verfügbar');
    if (ctx.isGenerating) return cap(false, 'PDF wird bereits erzeugt');
    if (ctx.hasActiveDocument) {
      return cap(false, 'PDF ist bereits vorhanden — „Neue Version erzeugen“ verwenden');
    }
    return cap(true);
  })();

  const regenerate = (() => {
    if (!outgoing) return cap(false, 'PDF-Erzeugung nur für Ausgangsrechnungen');
    if (!ctx.canGeneratePdf) return cap(false, 'PDF-Erzeugung für diesen Rechnungstyp nicht verfügbar');
    if (isDraft) return cap(false, 'Zuerst ausstellen, danach PDF erzeugen');
    if (terminal) return cap(false, 'Für abgeschlossene Sonderfälle nicht verfügbar');
    if (ctx.isGenerating) return cap(false, 'PDF wird bereits erzeugt');
    if (!ctx.hasActiveDocument) return cap(false, 'Zuerst PDF erzeugen');
    return cap(true);
  })();

  const retry = (() => {
    if (!ctx.lastGenerationFailed) return cap(false, 'Kein fehlgeschlagener Versuch');
    if (ctx.isGenerating) return cap(false, 'PDF wird bereits erzeugt');
    if (!outgoing || !ctx.canGeneratePdf || isDraft || terminal) {
      return cap(false, 'Erneuter Versuch derzeit nicht möglich');
    }
    return cap(true);
  })();

  return { preview, download, sendEmail, generate, regenerate, retry };
}

export function isSendableDocumentStatus(status: string): boolean {
  return status === DOCUMENT_STATUS.GENERATED || status === DOCUMENT_STATUS.SENT;
}

export function isActiveDocumentStatus(status: string): boolean {
  return (
    status === DOCUMENT_STATUS.GENERATED ||
    status === DOCUMENT_STATUS.SENT ||
    status === DOCUMENT_STATUS.DRAFT
  );
}
