import { formatInvoiceDocumentDateTime } from '../../lib/invoice-documents-i18n';
import type { InvoiceActionGate } from './invoiceDetailTypes';
import type {
  InvoiceDocumentCapability,
  InvoiceDocumentsPanel,
} from './invoiceDocumentTypes';

export function capabilityToGate(cap: InvoiceDocumentCapability): InvoiceActionGate {
  return cap.allowed ? { allowed: true } : { allowed: false, reason: cap.reason ?? undefined };
}

export function documentGatesFromPanel(panel: InvoiceDocumentsPanel | null | undefined): {
  viewPdf: InvoiceActionGate;
  generatePdf: InvoiceActionGate;
  sendEmail: InvoiceActionGate;
  regeneratePdf: InvoiceActionGate;
} | null {
  if (!panel) return null;
  const { capabilities: c } = panel;
  return {
    viewPdf: capabilityToGate(c.preview),
    generatePdf: capabilityToGate(c.generate),
    sendEmail: capabilityToGate(c.sendEmail),
    regeneratePdf: capabilityToGate(c.regenerate),
  };
}

export function formatDateTime(iso: string | null | undefined, locale: string): string {
  return formatInvoiceDocumentDateTime(locale, iso);
}

export function olderVersions(panel: InvoiceDocumentsPanel): InvoiceDocumentsPanel['versions'] {
  return panel.versions.filter((v) => !v.isActive);
}

export function shouldPollDocumentsPanel(panel: InvoiceDocumentsPanel | null): boolean {
  return panel?.panelState === 'GENERATING';
}
