import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { InvoiceDocuments } from './InvoiceDocuments';
import type { InvoiceDocumentsPanel } from './invoiceDocumentTypes';

const theme = {
  card: 'card',
  tp: 'text-foreground',
  ts: 'text-muted-foreground',
  inputCls: 'input',
  isDarkMode: false,
};

const cap = (allowed: boolean, reason: string | null = null) => ({ allowed, reason });

const baseCapabilities = {
  preview: cap(true),
  download: cap(true),
  sendEmail: cap(true),
  generate: cap(true),
  regenerate: cap(false, 'Zuerst PDF erzeugen'),
  retry: cap(false, 'Kein fehlgeschlagener Versuch'),
};

describe('InvoiceDocuments component', () => {
  it('state B — shows empty message and generate action', () => {
    const panel: InvoiceDocumentsPanel = {
      panelState: 'EMPTY',
      activeDocument: null,
      versions: [],
      generation: { status: 'idle', lastAttemptAt: null, errorMessage: null },
      capabilities: baseCapabilities,
      deliveryHistory: [],
      hasIncomingAttachment: false,
    };

    const html = renderToStaticMarkup(
      <InvoiceDocuments
        panel={panel}
        loading={false}
        generating={false}
        sendingEmail={false}
        retryingEmailId={null}
        onPreview={() => undefined}
        onDownload={() => undefined}
        onGenerate={() => undefined}
        onSendEmail={() => undefined}
        onRetryGeneration={() => undefined}
        onRetryDelivery={() => undefined}
        {...theme}
      />,
    );

    expect(html).toContain('Für diese Rechnung wurde noch kein PDF erzeugt');
    expect(html).toContain('PDF erzeugen');
    expect(html).not.toContain('GENERATING');
    expect(html).not.toContain('BOOKING_INVOICE');
  });

  it('state A — shows active document metadata and actions', () => {
    const panel: InvoiceDocumentsPanel = {
      panelState: 'ACTIVE',
      activeDocument: {
        id: 'doc-active',
        fileName: 'rechnung-FSM.pdf',
        documentType: 'BOOKING_INVOICE',
        documentTypeLabel: 'Rechnung',
        version: 1,
        isActive: true,
        status: 'GENERATED',
        statusLabel: 'Erzeugt',
        createdAt: '2026-07-14T12:00:00Z',
        createdByName: 'Maria Admin',
        sizeBytes: 20480,
        sizeLabel: '20 KB',
        capabilities: { preview: cap(true), download: cap(true) },
      },
      versions: [],
      generation: { status: 'idle', lastAttemptAt: null, errorMessage: null },
      capabilities: {
        ...baseCapabilities,
        generate: cap(false, 'Bereits vorhanden'),
        regenerate: cap(true),
      },
      deliveryHistory: [],
      hasIncomingAttachment: false,
    };

    const html = renderToStaticMarkup(
      <InvoiceDocuments
        panel={panel}
        loading={false}
        generating={false}
        sendingEmail={false}
        retryingEmailId={null}
        onPreview={() => undefined}
        onDownload={() => undefined}
        onGenerate={() => undefined}
        onSendEmail={() => undefined}
        onRetryGeneration={() => undefined}
        onRetryDelivery={() => undefined}
        {...theme}
      />,
    );

    expect(html).toContain('rechnung-FSM.pdf');
    expect(html).toContain('Rechnung');
    expect(html).toContain('Maria Admin');
    expect(html).toContain('20 KB');
    expect(html).toContain('Aktive Version');
    expect(html).toContain('Per E-Mail senden');
    expect(html).not.toContain('BOOKING_INVOICE');
    expect(html).not.toContain('GENERATED');
  });

  it('state C — shows processing without duplicate generate', () => {
    const panel: InvoiceDocumentsPanel = {
      panelState: 'GENERATING',
      activeDocument: null,
      versions: [],
      generation: { status: 'processing', lastAttemptAt: null, errorMessage: null },
      capabilities: {
        ...baseCapabilities,
        generate: cap(false, 'PDF wird bereits erzeugt'),
      },
      deliveryHistory: [],
      hasIncomingAttachment: false,
    };

    const html = renderToStaticMarkup(
      <InvoiceDocuments
        panel={panel}
        loading={false}
        generating={false}
        sendingEmail={false}
        retryingEmailId={null}
        onPreview={() => undefined}
        onDownload={() => undefined}
        onGenerate={() => undefined}
        onSendEmail={() => undefined}
        onRetryGeneration={() => undefined}
        onRetryDelivery={() => undefined}
        {...theme}
      />,
    );

    expect(html).toContain('PDF wird erzeugt');
    expect(html).not.toContain('Für diese Rechnung wurde noch kein PDF erzeugt');
  });

  it('state D — shows user-facing error and retry', () => {
    const panel: InvoiceDocumentsPanel = {
      panelState: 'FAILED',
      activeDocument: null,
      versions: [],
      generation: {
        status: 'failed',
        lastAttemptAt: '2026-07-14T11:00:00Z',
        errorMessage: 'PDF konnte nicht erzeugt werden. Bitte erneut versuchen.',
      },
      capabilities: {
        ...baseCapabilities,
        retry: cap(true),
      },
      deliveryHistory: [],
      hasIncomingAttachment: false,
    };

    const html = renderToStaticMarkup(
      <InvoiceDocuments
        panel={panel}
        loading={false}
        generating={false}
        sendingEmail={false}
        retryingEmailId={null}
        onPreview={() => undefined}
        onDownload={() => undefined}
        onGenerate={() => undefined}
        onSendEmail={() => undefined}
        onRetryGeneration={() => undefined}
        onRetryDelivery={() => undefined}
        {...theme}
      />,
    );

    expect(html).toContain('PDF-Erzeugung fehlgeschlagen');
    expect(html).toContain('Bitte erneut versuchen');
    expect(html).toContain('Erneut versuchen');
    expect(html).not.toContain('stack');
    expect(html).not.toContain('Error:');
  });

  it('state E — lists collapsible older versions', () => {
    const panel: InvoiceDocumentsPanel = {
      panelState: 'ACTIVE',
      activeDocument: {
        id: 'doc-2',
        fileName: 'rechnung-v2.pdf',
        documentType: 'BOOKING_INVOICE',
        documentTypeLabel: 'Rechnung',
        version: 2,
        isActive: true,
        status: 'GENERATED',
        statusLabel: 'Erzeugt',
        createdAt: '2026-07-14T12:00:00Z',
        createdByName: 'Admin',
        sizeBytes: null,
        sizeLabel: null,
        capabilities: { preview: cap(true), download: cap(true) },
      },
      versions: [
        {
          id: 'doc-2',
          fileName: 'rechnung-v2.pdf',
          documentType: 'BOOKING_INVOICE',
          documentTypeLabel: 'Rechnung',
          version: 2,
          isActive: true,
          status: 'GENERATED',
          statusLabel: 'Erzeugt',
          createdAt: '2026-07-14T12:00:00Z',
          createdByName: 'Admin',
          sizeBytes: null,
          sizeLabel: null,
          capabilities: { preview: cap(true), download: cap(true) },
        },
        {
          id: 'doc-1',
          fileName: 'rechnung-v1.pdf',
          documentType: 'BOOKING_INVOICE',
          documentTypeLabel: 'Rechnung',
          version: 1,
          isActive: false,
          status: 'GENERATED',
          statusLabel: 'Erzeugt',
          createdAt: '2026-07-13T12:00:00Z',
          createdByName: 'Admin',
          sizeBytes: null,
          sizeLabel: null,
          capabilities: { preview: cap(true), download: cap(true) },
        },
      ],
      generation: { status: 'idle', lastAttemptAt: null, errorMessage: null },
      capabilities: baseCapabilities,
      deliveryHistory: [
        {
          id: 'mail-1',
          recipient: 'kunde@example.com',
          channelLabel: 'E-Mail',
          documentVersionLabel: 'rechnung-v2.pdf',
          sentAt: '2026-07-14T13:00:00Z',
          createdAt: '2026-07-14T13:00:00Z',
          triggeredByName: 'Admin',
          status: 'FAILED',
          statusLabel: 'Fehlgeschlagen',
          errorMessage: 'Empfänger nicht erreichbar',
          capabilities: { retry: cap(true) },
        },
      ],
      hasIncomingAttachment: false,
    };

    const html = renderToStaticMarkup(
      <InvoiceDocuments
        panel={panel}
        loading={false}
        generating={false}
        sendingEmail={false}
        retryingEmailId={null}
        onPreview={() => undefined}
        onDownload={() => undefined}
        onGenerate={() => undefined}
        onSendEmail={() => undefined}
        onRetryGeneration={() => undefined}
        onRetryDelivery={() => undefined}
        {...theme}
      />,
    );

    expect(html).toContain('Frühere Versionen (1)');
    expect(html).toContain('Versandhistorie');
    expect(html).toContain('kunde@example.com');
    expect(html).toContain('Fehlgeschlagen');
    expect(html).toContain('Empfänger nicht erreichbar');
    expect(html).not.toContain('FAILED');
  });
});
