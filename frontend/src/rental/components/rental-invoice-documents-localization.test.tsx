// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@iconify/react', () => ({
  Icon: () => null,
  disableCache: vi.fn(),
}));

const { mockPreview, mockDownload, mockGenerate, mockSendEmail, mockRetryGeneration, mockRetryDelivery } =
  vi.hoisted(() => ({
    mockPreview: vi.fn(),
    mockDownload: vi.fn(),
    mockGenerate: vi.fn(),
    mockSendEmail: vi.fn(),
    mockRetryGeneration: vi.fn(),
    mockRetryDelivery: vi.fn(),
  }));

import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import { InvoiceDocuments } from './invoices/InvoiceDocuments';
import type { InvoiceDocumentsPanel } from './invoices/invoiceDocumentTypes';
import { formatInvoiceDocumentDateTime } from '../lib/invoice-documents-i18n';

const P223_ENFORCE_CLEAN_EXACT = [
  'rental/components/invoices/InvoiceDocuments.tsx',
  'rental/lib/invoice-documents-i18n.ts',
  'rental/components/invoices/invoiceDocuments.mapper.ts',
];

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

const FIXED_ISO = '2026-07-14T10:00:00.000Z';

function isP223EnforceCleanPath(relPath: string): boolean {
  return P223_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p223ScopedFindings() {
  return inventory.findings.filter((finding) => isP223EnforceCleanPath(finding.file));
}

function sampleActivePanel(overrides: Partial<InvoiceDocumentsPanel> = {}): InvoiceDocumentsPanel {
  return {
    panelState: 'ACTIVE',
    activeDocument: {
      id: 'doc-1',
      fileName: 'rechnung-FSM-2026-0042.pdf',
      documentType: 'BOOKING_INVOICE',
      documentTypeLabel: 'Rechnung',
      version: 2,
      isActive: true,
      status: 'GENERATED',
      statusLabel: 'Erzeugt',
      createdAt: FIXED_ISO,
      createdByName: 'Admin User',
      sizeBytes: 12000,
      sizeLabel: '12 KB',
      capabilities: {
        preview: cap(true),
        download: cap(true),
      },
    },
    versions: [],
    generation: { status: 'idle', lastAttemptAt: null, errorMessage: null },
    capabilities: baseCapabilities,
    deliveryHistory: [],
    hasIncomingAttachment: false,
    ...overrides,
  };
}

function renderWithLocale(locale: 'de' | 'en', ui: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  window.localStorage.setItem('synqdrive.locale', locale);
  act(() => {
    root.render(createElement(LanguageProvider, null, ui));
  });
  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function renderDocuments(locale: 'de' | 'en', panel: InvoiceDocumentsPanel | null, loading = false) {
  return renderWithLocale(
    locale,
    createElement(InvoiceDocuments, {
      panel,
      loading,
      generating: false,
      sendingEmail: false,
      retryingEmailId: null,
      onPreview: mockPreview,
      onDownload: mockDownload,
      onGenerate: mockGenerate,
      onSendEmail: mockSendEmail,
      onRetryGeneration: mockRetryGeneration,
      onRetryDelivery: mockRetryDelivery,
      ...theme,
    }),
  );
}

describe('rental Invoice Documents panel localization (P2.2.23)', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  describe('enforce-clean inventory', () => {
    it('reports zero P223 scoped findings', () => {
      expect(p223ScopedFindings()).toHaveLength(0);
    });
  });

  describe('presentation adapter', () => {
    it('formats dates with locale-aware output', () => {
      const deFormatted = formatInvoiceDocumentDateTime('de', FIXED_ISO);
      const enFormatted = formatInvoiceDocumentDateTime('en', FIXED_ISO);
      expect(deFormatted).not.toBe(enFormatted);
      expect(deFormatted).toMatch(/14/);
      expect(enFormatted).toMatch(/14/);
    });

    it('uses empty value key for missing timestamps', () => {
      expect(formatInvoiceDocumentDateTime('en', null)).toBe('—');
      expect(formatInvoiceDocumentDateTime('de', null)).toBe('—');
    });
  });

  describe('EN render', () => {
    it('shows English panel title and actions for active document', () => {
      const view = renderDocuments('en', sampleActivePanel());
      cleanup = view.cleanup;
      const text = view.container.textContent ?? '';
      expect(text).toContain('Documents');
      expect(text).toContain('Preview');
      expect(text).toContain('Download');
      expect(text).toContain('Send by email');
      expect(text).toContain('Delivery history');
      expect(text).toContain('rechnung-FSM-2026-0042.pdf');
      expect(text).toContain('Erzeugt');
      expect(text).not.toContain('Dokumente');
      expect(text).not.toMatch(/invoices\.documents\./);
    });
  });

  describe('DE render', () => {
    it('shows German panel title and actions for active document', () => {
      const view = renderDocuments('de', sampleActivePanel());
      cleanup = view.cleanup;
      const text = view.container.textContent ?? '';
      expect(text).toContain('Dokumente');
      expect(text).toContain('Vorschau');
      expect(text).toContain('Herunterladen');
      expect(text).toContain('Per E-Mail senden');
      expect(text).toContain('Versandhistorie');
      expect(text).toContain('rechnung-FSM-2026-0042.pdf');
      expect(text).not.toContain('Documents');
    });
  });

  describe('empty state', () => {
    it('localizes empty panel in EN and DE', () => {
      const emptyPanel: InvoiceDocumentsPanel = {
        panelState: 'EMPTY',
        activeDocument: null,
        versions: [],
        generation: { status: 'idle', lastAttemptAt: null, errorMessage: null },
        capabilities: baseCapabilities,
        deliveryHistory: [],
        hasIncomingAttachment: false,
      };

      const enView = renderDocuments('en', emptyPanel);
      expect(enView.container.textContent).toContain('No PDF has been generated');
      expect(enView.container.textContent).toContain('Generate PDF');
      enView.cleanup();

      const deView = renderDocuments('de', emptyPanel);
      cleanup = deView.cleanup;
      expect(deView.container.textContent).toContain('Für diese Rechnung wurde noch kein PDF erzeugt');
      expect(deView.container.textContent).toContain('PDF erzeugen');
    });
  });

  describe('runtime locale switch', () => {
    it('switches locale at runtime without stale labels', async () => {
      const enView = renderDocuments('en', sampleActivePanel());
      await act(async () => {});
      expect(enView.container.textContent).toContain(en['invoices.documents.title']);
      enView.cleanup();

      const deView = renderDocuments('de', sampleActivePanel());
      cleanup = deView.cleanup;
      await act(async () => {});
      expect(deView.container.textContent).toContain(de['invoices.documents.title']);
      expect(deView.container.textContent).not.toContain(en['invoices.documents.title']);
    });

    it('updates labels on same mount EN → DE', async () => {
      function LocaleSwitchButton({ target }: { target: 'de' | 'en' }) {
        const { setLocale } = useLanguage();
        return createElement(
          'button',
          {
            type: 'button',
            'data-testid': `switch-locale-${target}`,
            onClick: () => setLocale(target),
          },
          target.toUpperCase(),
        );
      }

      const view = renderWithLocale(
        'en',
        createElement(
          'div',
          null,
          createElement(LocaleSwitchButton, { target: 'de' }),
          createElement(InvoiceDocuments, {
            panel: sampleActivePanel(),
            loading: false,
            generating: false,
            sendingEmail: false,
            retryingEmailId: null,
            onPreview: mockPreview,
            onDownload: mockDownload,
            onGenerate: mockGenerate,
            onSendEmail: mockSendEmail,
            onRetryGeneration: mockRetryGeneration,
            onRetryDelivery: mockRetryDelivery,
            ...theme,
          }),
        ),
      );
      cleanup = view.cleanup;
      await act(async () => {});
      expect(view.container.textContent).toContain(en['invoices.documents.title']);

      const switchBtn = document.querySelector('[data-testid="switch-locale-de"]') as HTMLButtonElement;
      await act(async () => {
        switchBtn.click();
      });

      expect(view.container.textContent).toContain(de['invoices.documents.title']);
      expect(view.container.textContent).toContain('rechnung-FSM-2026-0042.pdf');
      expect(view.container.textContent).not.toContain(en['invoices.documents.title']);
    });
  });

  describe('callbacks and machine values', () => {
    it('preserves document ID on preview callback', () => {
      const view = renderDocuments('en', sampleActivePanel());
      cleanup = view.cleanup;
      const previewBtn = Array.from(view.container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Preview'),
      );
      expect(previewBtn).toBeTruthy();
      act(() => previewBtn?.click());
      expect(mockPreview).toHaveBeenCalledWith('doc-1');
    });

    it('preserves backend status labels and filenames under EN', () => {
      const view = renderDocuments('en', sampleActivePanel());
      cleanup = view.cleanup;
      const text = view.container.textContent ?? '';
      expect(text).toContain('rechnung-FSM-2026-0042.pdf');
      expect(text).toContain('Erzeugt');
      expect(text).toContain('Rechnung');
      expect(text).toContain('12 KB');
    });
  });

  describe('loading state', () => {
    it('shows localized loading copy', () => {
      const enView = renderDocuments('en', null, true);
      expect(enView.container.textContent).toContain('Loading documents');
      enView.cleanup();

      const deView = renderDocuments('de', null, true);
      cleanup = deView.cleanup;
      expect(deView.container.textContent).toContain('Dokumente werden geladen');
    });
  });
});
