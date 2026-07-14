import { describe, expect, it } from 'vitest';

import { capabilityToGate, documentGatesFromPanel, olderVersions, shouldPollDocumentsPanel } from './invoiceDocuments.mapper';
import type { InvoiceDocumentsPanel } from './invoiceDocumentTypes';

const cap = (allowed: boolean, reason: string | null = null) => ({ allowed, reason });

function samplePanel(overrides: Partial<InvoiceDocumentsPanel> = {}): InvoiceDocumentsPanel {
  return {
    panelState: 'ACTIVE',
    activeDocument: {
      id: 'doc-1',
      fileName: 'rechnung.pdf',
      documentType: 'BOOKING_INVOICE',
      documentTypeLabel: 'Rechnung',
      version: 2,
      isActive: true,
      status: 'GENERATED',
      statusLabel: 'Erzeugt',
      createdAt: '2026-07-14T10:00:00Z',
      createdByName: 'Admin',
      sizeBytes: 12000,
      sizeLabel: '12 KB',
      capabilities: {
        preview: cap(true),
        download: cap(true),
      },
    },
    versions: [
      {
        id: 'doc-1',
        fileName: 'rechnung.pdf',
        documentType: 'BOOKING_INVOICE',
        documentTypeLabel: 'Rechnung',
        version: 2,
        isActive: true,
        status: 'GENERATED',
        statusLabel: 'Erzeugt',
        createdAt: '2026-07-14T10:00:00Z',
        createdByName: 'Admin',
        sizeBytes: 12000,
        sizeLabel: '12 KB',
        capabilities: { preview: cap(true), download: cap(true) },
      },
      {
        id: 'doc-0',
        fileName: 'rechnung-v1.pdf',
        documentType: 'BOOKING_INVOICE',
        documentTypeLabel: 'Rechnung',
        version: 1,
        isActive: false,
        status: 'GENERATED',
        statusLabel: 'Erzeugt',
        createdAt: '2026-07-13T10:00:00Z',
        createdByName: 'Admin',
        sizeBytes: 11000,
        sizeLabel: '11 KB',
        capabilities: { preview: cap(true), download: cap(true) },
      },
    ],
    generation: { status: 'idle', lastAttemptAt: null, errorMessage: null },
    capabilities: {
      preview: cap(true),
      download: cap(true),
      sendEmail: cap(true),
      generate: cap(false, 'PDF ist bereits vorhanden'),
      regenerate: cap(true),
      retry: cap(false, 'Kein fehlgeschlagener Versuch'),
    },
    deliveryHistory: [],
    hasIncomingAttachment: false,
    ...overrides,
  };
}

describe('invoiceDocuments.mapper', () => {
  it('maps backend capabilities to action gates', () => {
    const gates = documentGatesFromPanel(samplePanel());
    expect(gates?.sendEmail).toEqual({ allowed: true });
    expect(gates?.generatePdf).toEqual({
      allowed: false,
      reason: 'PDF ist bereits vorhanden',
    });
  });

  it('capabilityToGate preserves disabled reasons', () => {
    expect(capabilityToGate(cap(false, 'Nur Administratoren'))).toEqual({
      allowed: false,
      reason: 'Nur Administratoren',
    });
  });

  it('olderVersions excludes active document', () => {
    const older = olderVersions(samplePanel());
    expect(older).toHaveLength(1);
    expect(older[0]?.id).toBe('doc-0');
  });

  it('shouldPollDocumentsPanel only when generating', () => {
    expect(shouldPollDocumentsPanel(samplePanel({ panelState: 'GENERATING' }))).toBe(true);
    expect(shouldPollDocumentsPanel(samplePanel({ panelState: 'ACTIVE' }))).toBe(false);
    expect(shouldPollDocumentsPanel(null)).toBe(false);
  });
});
