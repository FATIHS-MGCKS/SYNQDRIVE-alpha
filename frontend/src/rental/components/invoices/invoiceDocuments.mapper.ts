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

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function olderVersions(panel: InvoiceDocumentsPanel): InvoiceDocumentsPanel['versions'] {
  return panel.versions.filter((v) => !v.isActive);
}

export function shouldPollDocumentsPanel(panel: InvoiceDocumentsPanel | null): boolean {
  return panel?.panelState === 'GENERATING';
}
