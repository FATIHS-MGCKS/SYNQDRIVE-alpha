import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/api', () => ({
  api: {
    invoices: {
      getDocumentsPanel: vi.fn(),
      generateDocument: vi.fn(),
      sendDocumentEmail: vi.fn(),
      retryDocumentEmail: vi.fn(),
    },
    documents: {
      open: vi.fn(),
    },
  },
}));

import { api } from '../../../lib/api';
import {
  fetchInvoiceDocumentsPanel,
  generateInvoiceDocument,
  openInvoiceDocument,
  retryInvoiceDocumentEmail,
  sendInvoiceDocumentEmail,
} from './invoiceDocuments.api';

const cap = (allowed: boolean, reason: string | null = null) => ({ allowed, reason });

const panelFixture = {
  panelState: 'ACTIVE' as const,
  activeDocument: {
    id: 'doc-1',
    fileName: 'rechnung.pdf',
    documentType: 'BOOKING_INVOICE',
    documentTypeLabel: 'Rechnung',
    version: 1,
    isActive: true,
    status: 'GENERATED',
    statusLabel: 'Erzeugt',
    createdAt: '2026-07-14T10:00:00Z',
    createdByName: null,
    sizeBytes: 1000,
    sizeLabel: '1 KB',
    capabilities: { preview: cap(true), download: cap(true) },
  },
  versions: [],
  generation: { status: 'idle' as const, lastAttemptAt: null, errorMessage: null },
  capabilities: {
    preview: cap(true),
    download: cap(true),
    sendEmail: cap(true),
    generate: cap(false),
    regenerate: cap(true),
    retry: cap(false),
  },
  deliveryHistory: [],
  hasIncomingAttachment: false,
};

describe('invoice documents integration flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.invoices.getDocumentsPanel).mockResolvedValue(panelFixture);
    vi.mocked(api.invoices.generateDocument).mockResolvedValue(panelFixture);
    vi.mocked(api.invoices.sendDocumentEmail).mockResolvedValue({ id: 'mail-1' } as never);
    vi.mocked(api.invoices.retryDocumentEmail).mockResolvedValue({ id: 'mail-1' } as never);
  });

  it('loads panel via invoice documents endpoint (no bookingId)', async () => {
    const panel = await fetchInvoiceDocumentsPanel('org-1', 'inv-1');
    expect(api.invoices.getDocumentsPanel).toHaveBeenCalledWith('org-1', 'inv-1');
    expect(panel.activeDocument?.id).toBe('doc-1');
  });

  it('generates PDF through invoice endpoint', async () => {
    await generateInvoiceDocument('org-1', 'inv-1', false);
    expect(api.invoices.generateDocument).toHaveBeenCalledWith('org-1', 'inv-1', false);
  });

  it('sends invoice email through invoice endpoint', async () => {
    await sendInvoiceDocumentEmail('org-1', 'inv-1', {
      toEmail: 'kunde@example.com',
      subject: 'Rechnung',
    });
    expect(api.invoices.sendDocumentEmail).toHaveBeenCalledWith('org-1', 'inv-1', {
      toEmail: 'kunde@example.com',
      subject: 'Rechnung',
    });
  });

  it('retries failed delivery through invoice endpoint', async () => {
    await retryInvoiceDocumentEmail('org-1', 'inv-1', 'mail-9');
    expect(api.invoices.retryDocumentEmail).toHaveBeenCalledWith('org-1', 'inv-1', 'mail-9');
  });

  it('opens signed document URL only at action time', () => {
    openInvoiceDocument('org-1', 'doc-1');
    expect(api.documents.open).toHaveBeenCalledWith('org-1', 'doc-1');
    expect(api.documents.open).toHaveBeenCalledTimes(1);
  });
});
