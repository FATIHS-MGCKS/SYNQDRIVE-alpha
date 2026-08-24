// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

const FILENAME_FIXTURE = 'Fahrzeugschein_KS-FS-1234_2026.pdf';
const BOOKING_ID_FIXTURE = 'bk-p238-test-1';
const DOC_ID_FIXTURE = 'doc-rental-contract-1';
const CUSTOMER_ID_FIXTURE = 'cust-p238-1';
const DYNAMIC_DAMAGE_TITLE = 'Schaden Frontstoßstange — Unfallbericht XY-99';

const mockListForBooking = vi.fn();
const mockOpenDocument = vi.fn();
const mockListCustomerDocuments = vi.fn();

const BUNDLE_VIEW = {
  bundle: {
    id: 'bundle-1',
    bookingId: BOOKING_ID_FIXTURE,
    status: 'COMPLETE' as const,
    generatedAt: '2026-07-14T10:00:00.000Z',
    lastError: null,
  },
  documents: [
    {
      id: DOC_ID_FIXTURE,
      documentType: 'RENTAL_CONTRACT',
      origin: 'GENERATED',
      status: 'READY',
      title: 'Mietvertrag',
      documentNumber: 'MV-2026-001',
      fileName: FILENAME_FIXTURE,
      mimeType: 'application/pdf',
      sizeBytes: 204800,
      bookingId: BOOKING_ID_FIXTURE,
      invoiceId: null,
      legalVersionLabel: '2.1',
      generatedAt: '2026-07-14T10:00:00.000Z',
      createdAt: '2026-07-14T10:00:00.000Z',
    },
    {
      id: 'doc-damage-1',
      documentType: 'DAMAGE_REPORT_CUSTOM',
      origin: 'GENERATED',
      status: 'READY',
      title: DYNAMIC_DAMAGE_TITLE,
      documentNumber: null,
      fileName: 'damage-report.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 102400,
      bookingId: BOOKING_ID_FIXTURE,
      invoiceId: null,
      legalVersionLabel: null,
      generatedAt: '2026-07-15T08:00:00.000Z',
      createdAt: '2026-07-15T08:00:00.000Z',
    },
  ],
  legal: { termsAttached: true, withdrawalAttached: true, missing: [] },
  missingLegalDocuments: [],
  warnings: [],
};

vi.mock('../../lib/api', () => ({
  api: {
    documents: {
      listForBooking: (...args: unknown[]) => mockListForBooking(...args),
      open: (...args: unknown[]) => mockOpenDocument(...args),
    },
    customers: {
      customerDocuments: {
        list: (...args: unknown[]) => mockListCustomerDocuments(...args),
      },
    },
  },
}));

import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import { OperatorBookingDocumentsPanel } from './OperatorBookingDocumentsPanel';
import {
  buildOperatorDocumentSlots,
  deriveDocumentAvailability,
} from './operatorBookingDocuments.utils';
import {
  formatOperatorDocumentMeta,
  operatorBookingDocumentAvailabilityLabel,
  operatorBookingDocumentSlotLabel,
  operatorBookingDocumentsSectionTitle,
} from '../lib/operator-booking-documents-i18n';

const P238_ENFORCE_CLEAN_EXACT = [
  'operator/documents/OperatorBookingDocumentsPanel.tsx',
  'operator/documents/operatorBookingDocuments.utils.ts',
  'operator/lib/operator-booking-documents-i18n.ts',
];

function isP238EnforceCleanPath(relPath: string): boolean {
  return P238_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p238ScopedFindings() {
  return inventory.findings.filter((finding) => isP238EnforceCleanPath(finding.file));
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

function LocaleSwitchHarness() {
  const { locale, setLocale } = useLanguage();
  return createElement(
    'div',
    null,
    createElement(
      'button',
      { type: 'button', onClick: () => setLocale(locale === 'de' ? 'en' : 'de') },
      'toggle-locale',
    ),
    createElement(OperatorBookingDocumentsPanel, {
      orgId: 'org-1',
      bookingId: BOOKING_ID_FIXTURE,
    }),
  );
}

describe('operator booking documents panel localization (P2.2.38)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('has zero P238 enforce-clean scanner debt', () => {
    expect(p238ScopedFindings()).toHaveLength(0);
  });

  it('renders German section title and document type label', async () => {
    mockListForBooking.mockResolvedValue(BUNDLE_VIEW);
    mockListCustomerDocuments.mockResolvedValue([]);

    const { container, cleanup } = renderWithLocale(
      'de',
      createElement(OperatorBookingDocumentsPanel, {
        orgId: 'org-1',
        bookingId: BOOKING_ID_FIXTURE,
      }),
    );

    await vi.waitFor(() => {
      expect(container.textContent).toContain('Buchungsdokumente');
      expect(container.textContent).toContain('Mietvertrag');
      expect(container.textContent).toContain('MV-2026-001');
    });

    cleanup();
  });

  it('renders English section title and document type label', async () => {
    mockListForBooking.mockResolvedValue(BUNDLE_VIEW);
    mockListCustomerDocuments.mockResolvedValue([]);

    const { container, cleanup } = renderWithLocale(
      'en',
      createElement(OperatorBookingDocumentsPanel, {
        orgId: 'org-1',
        bookingId: BOOKING_ID_FIXTURE,
      }),
    );

    await vi.waitFor(() => {
      expect(container.textContent).toContain('Booking documents');
      expect(container.textContent).toContain('Rental contract');
      expect(container.textContent).toContain('MV-2026-001');
    });

    cleanup();
  });

  it('preserves filename and dynamic damage title across same-mount locale switch', async () => {
    mockListForBooking.mockResolvedValue(BUNDLE_VIEW);
    mockListCustomerDocuments.mockResolvedValue([]);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    window.localStorage.setItem('synqdrive.locale', 'de');

    act(() => {
      root.render(createElement(LanguageProvider, null, createElement(LocaleSwitchHarness)));
    });

    await vi.waitFor(() => {
      expect(container.textContent).toContain(DYNAMIC_DAMAGE_TITLE);
      expect(container.textContent).toContain('damage-report.pdf');
      expect(container.textContent).toContain('Buchungsdokumente');
    });

    const toggle = container.querySelector('button');
    expect(toggle).toBeTruthy();
    await act(async () => {
      toggle!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await vi.waitFor(() => {
      expect(container.textContent).toContain('Booking documents');
      expect(container.textContent).toContain(DYNAMIC_DAMAGE_TITLE);
      expect(container.textContent).toContain('damage-report.pdf');
    });

    act(() => root.unmount());
    container.remove();
  });

  it('maps availability machine values to localized labels without changing derivation', () => {
    expect(deriveDocumentAvailability('RENTAL_CONTRACT', BUNDLE_VIEW.documents[0], BUNDLE_VIEW.bundle)).toBe(
      'available',
    );
    expect(deriveDocumentAvailability('HANDOVER_PICKUP', null, {
      ...BUNDLE_VIEW.bundle,
      status: 'PENDING' as const,
    })).toBe(
      'generating',
    );
    expect(deriveDocumentAvailability('HANDOVER_PICKUP', null, null)).toBe('missing');

    expect(operatorBookingDocumentAvailabilityLabel('de', 'available')).toBe('Verfügbar');
    expect(operatorBookingDocumentAvailabilityLabel('en', 'missing')).toBe('Missing');
  });

  it('maps canonical document types to localized labels while preserving machine values in slots', () => {
    const slots = buildOperatorDocumentSlots(BUNDLE_VIEW);
    const rentalSlot = slots.find((slot) => slot.documentType === 'RENTAL_CONTRACT');
    expect(rentalSlot?.documentType).toBe('RENTAL_CONTRACT');
    expect(operatorBookingDocumentSlotLabel('en', 'RENTAL_CONTRACT')).toBe('Rental contract');
    expect(operatorBookingDocumentSlotLabel('de', 'RENTAL_CONTRACT')).toBe('Mietvertrag');
  });

  it('formats document meta with active locale without altering raw filename', () => {
    const doc = {
      ...BUNDLE_VIEW.documents[0],
      documentNumber: null,
    };
    const deMeta = formatOperatorDocumentMeta('de', doc);
    const enMeta = formatOperatorDocumentMeta('en', doc);
    expect(deMeta).toContain(FILENAME_FIXTURE);
    expect(enMeta).toContain(FILENAME_FIXTURE);
    expect(doc.fileName).toBe(FILENAME_FIXTURE);
  });

  it('keeps adapter titles aligned with dictionary keys', () => {
    expect(operatorBookingDocumentsSectionTitle('en', 'booking')).toBe('Booking documents');
    expect(operatorBookingDocumentsSectionTitle('de', 'booking')).toBe('Buchungsdokumente');
  });
});
