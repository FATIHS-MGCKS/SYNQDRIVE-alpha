// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@iconify/react', () => ({
  Icon: () => null,
  disableCache: vi.fn(),
}));

import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import { buildInvoiceDetailDto } from './invoices/invoiceDetail.mapper';
import { InvoiceDetailHeader } from './invoices/InvoiceDetailHeader';
import {
  rentalInvoiceDetailHeaderFormatAmount,
  rentalInvoiceDetailHeaderGateReason,
  rentalInvoiceDetailHeaderStatusLabel,
  rentalInvoiceDetailHeaderTypeLabel,
  ridh,
} from '../lib/rental-invoice-detail-header-i18n';
import type { Invoice } from './invoices/invoiceTypes';

const P250_ENFORCE_CLEAN_EXACT = [
  'rental/components/invoices/InvoiceDetailHeader.tsx',
  'rental/components/invoices/InvoiceHeaderMoreMenu.tsx',
  'rental/components/invoices/invoiceDetail.mapper.ts',
  'rental/components/invoices/invoiceUtils.ts',
  'rental/lib/rental-invoice-detail-header-i18n.ts',
];

const INVOICE_NUMBER_RAW = 'RE-2026-00421';

const theme = {
  card: 'card',
  tp: 'text-foreground',
  ts: 'text-muted-foreground',
  inputCls: 'input',
  isDarkMode: false,
};

const ALL_STATUSES = [
  'DRAFT',
  'ISSUED',
  'SENT',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
  'CANCELLED',
  'CREDITED',
  'VOID',
  'UPLOADED',
  'NEEDS_REVIEW',
  'APPROVED',
  'BOOKED',
  'REJECTED',
] as const;

const ALL_TYPES = [
  'OUTGOING_BOOKING',
  'OUTGOING_MANUAL',
  'OUTGOING_FINAL',
  'INCOMING_VENDOR',
  'INCOMING_UPLOADED',
] as const;

function isP250EnforceCleanPath(relPath: string): boolean {
  return P250_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p250ScopedFindings() {
  return inventory.findings.filter((finding) => isP250EnforceCleanPath(finding.file));
}

function sampleInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv_internal_p250',
    invoiceNumber: 421,
    invoiceNumberDisplay: INVOICE_NUMBER_RAW,
    type: 'OUTGOING_BOOKING',
    customerId: 'cust-1',
    vendorId: null,
    vendorName: null,
    bookingId: 'book-1',
    vehicleId: 'veh-1',
    title: 'Mietrechnung',
    description: '',
    lineItems: null,
    subtotalCents: 10000,
    taxCents: 1900,
    totalCents: 123456,
    paidCents: 1234,
    outstandingCents: 122222,
    currency: 'EUR',
    invoiceDate: '2026-07-01',
    dueDate: '2026-07-15',
    status: 'ISSUED',
    templateId: null,
    imageUrl: null,
    extractedData: null,
    notes: '',
    paidAt: null,
    createdAt: '2026-07-01T10:00:00Z',
    generatedDocumentId: 'doc-1',
    tasks: [],
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

function LocaleSwitchHarness({ children }: { children: ReactNode }) {
  const { locale, setLocale } = useLanguage();
  return createElement(
    'div',
    null,
    createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'toggle-locale',
        onClick: () => setLocale(locale === 'de' ? 'en' : 'de'),
      },
      'toggle-locale',
    ),
    children,
  );
}

function LocaleAwareHeaderHarness({ invoice }: { invoice: Invoice }) {
  const { locale } = useLanguage();
  const detail = buildDetail(invoice, locale as 'de' | 'en');
  return createElement(InvoiceDetailHeader, {
    detail,
    viewportWidth: 1280,
    ...theme,
  });
}

function buildDetail(invoice: Invoice, locale: 'de' | 'en' = 'de') {
  return buildInvoiceDetailDto(invoice, {
    locale,
    canManageEmail: true,
    canManageFinance: true,
  });
}

function renderHeader(locale: 'de' | 'en', invoice = sampleInvoice()) {
  const detail = buildDetail(invoice, locale);
  const callbacks = {
    onViewPdf: vi.fn(),
    onIssue: vi.fn(),
    onRegeneratePdf: vi.fn(),
    onMarkSentExternally: vi.fn(),
    onRecordPayment: vi.fn(),
    onEdit: vi.fn(),
    onCancel: vi.fn(),
  };
  const view = renderWithLocale(
    locale,
    createElement(InvoiceDetailHeader, {
      detail,
      viewportWidth: 1280,
      ...callbacks,
      ...theme,
    }),
  );
  return { ...view, detail, callbacks };
}

describe('rental Invoice Detail Header localization (P2.2.50)', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it('has zero P250 enforce-clean scanner debt', () => {
    expect(p250ScopedFindings()).toHaveLength(0);
  });

  it('renders English header chrome without raw keys', () => {
    const view = renderHeader('en');
    cleanup = view.cleanup;
    const text = view.container.textContent ?? '';
    expect(text).toContain(INVOICE_NUMBER_RAW);
    expect(text).toContain(en['invoices.list.col.total']);
    expect(text).toContain(en['invoicePayment.summary.paid']);
    expect(text).toContain(en['invoicePayment.summary.outstanding']);
    expect(text).toContain(en['invoices.list.sort.dueDate']);
    expect(text).toContain(en['invoices.create.field.invoiceDate']);
    expect(text).not.toMatch(/rental\.invoice\.detail\.header\./);
  });

  it('renders German header chrome', () => {
    const view = renderHeader('de');
    cleanup = view.cleanup;
    const text = view.container.textContent ?? '';
    expect(text).toContain(de['invoices.list.col.total']);
    expect(text).toContain(de['invoicePayment.summary.paid']);
    expect(text).toContain(de['invoicePayment.summary.outstanding']);
    expect(text).not.toContain(en['invoices.list.col.total']);
  });

  it('uses business void wording in DE — not common.cancel (Abbrechen)', () => {
    expect(ridh('de', 'rental.invoice.detail.header.menu.voidInvoice')).toBe(
      de['rental.invoice.detail.header.menu.voidInvoice'],
    );
    expect(ridh('de', 'rental.invoice.detail.header.menu.voidInvoice')).toBe('Stornieren');
    expect(ridh('de', 'rental.invoice.detail.header.menu.voidInvoice')).not.toBe(de['common.cancel']);
  });

  it('uses Void invoice wording in EN menu labels', () => {
    expect(ridh('en', 'rental.invoice.detail.header.menu.voidInvoice')).toBe(
      en['rental.invoice.detail.header.menu.voidInvoice'],
    );
    expect(ridh('en', 'rental.invoice.detail.header.menu.voidInvoice')).toBe('Void invoice');
  });

  it('localizes all invoice statuses without leaking machine codes', () => {
    for (const status of ALL_STATUSES) {
      const enLabel = rentalInvoiceDetailHeaderStatusLabel('en', status);
      const deLabel = rentalInvoiceDetailHeaderStatusLabel('de', status);
      expect(enLabel).toBe(en[`invoices.list.status.${status}`]);
      expect(deLabel).toBe(de[`invoices.list.status.${status}`]);
      expect(enLabel).not.toBe(status);
      expect(deLabel).not.toBe(status);
    }
  });

  it('localizes all invoice types via canonical list keys', () => {
    for (const type of ALL_TYPES) {
      const enLabel = rentalInvoiceDetailHeaderTypeLabel('en', type);
      const deLabel = rentalInvoiceDetailHeaderTypeLabel('de', type);
      expect(enLabel).toBe(en[`invoices.list.type.${type}`]);
      expect(deLabel).toBe(de[`invoices.list.type.${type}`]);
    }
  });

  it('preserves outstanding formula when outstandingCents is omitted from calculation path', () => {
    const invoice = sampleInvoice({
      outstandingCents: 0,
      totalCents: 5000,
      paidCents: 1234,
    });
    const detail = buildInvoiceDetailDto(
      { ...invoice, outstandingCents: undefined as unknown as number },
      { locale: 'en', canManageEmail: true, canManageFinance: true },
    );
    expect(detail.amounts.outstandingCents).toBe(3766);
    expect(detail.amounts.totalCents).toBe(5000);
    expect(detail.amounts.paidCents).toBe(1234);
    expect(detail.core.currency).toBe('EUR');
  });

  it('preserves explicit outstandingCents when provided', () => {
    const invoice = sampleInvoice({ outstandingCents: 0, totalCents: 5000, paidCents: 0 });
    const detail = buildDetail(invoice, 'en');
    expect(detail.amounts.outstandingCents).toBe(0);
  });

  it('formats money with locale presentation only', () => {
    expect(rentalInvoiceDetailHeaderFormatAmount('de', 0, 'EUR')).toMatch(/0/);
    expect(rentalInvoiceDetailHeaderFormatAmount('en', 1234, 'EUR')).toMatch(/12/);
    expect(rentalInvoiceDetailHeaderFormatAmount('de', 123456, 'EUR')).toMatch(/1/);
    const deFmt = rentalInvoiceDetailHeaderFormatAmount('de', 123456, 'EUR');
    const enFmt = rentalInvoiceDetailHeaderFormatAmount('en', 123456, 'EUR');
    expect(deFmt).not.toBe(enFmt);
  });

  it('localizes gate reasons without changing eligibility', () => {
    const draftDetail = buildDetail(sampleInvoice({ status: 'DRAFT' }), 'en');
    const issuedDetail = buildDetail(sampleInvoice({ status: 'ISSUED' }), 'en');
    expect(draftDetail.actions.issue.allowed).toBe(true);
    expect(issuedDetail.actions.issue.allowed).toBe(false);
    expect(issuedDetail.actions.issue.reason).toBe(
      rentalInvoiceDetailHeaderGateReason('en', 'issueNotDraft'),
    );
    expect(ridh('de', 'rental.invoice.detail.header.gate.issueNotDraft')).toBe(
      de['rental.invoice.detail.header.gate.issueNotDraft'],
    );
  });

  it('preserves invoice number raw display', () => {
    const view = renderHeader('en');
    cleanup = view.cleanup;
    expect(view.container.textContent).toContain(INVOICE_NUMBER_RAW);
    expect(view.detail.core.invoiceNumberDisplay).toBe(INVOICE_NUMBER_RAW);
  });

  it('preserves header presentation across same-mount locale switch', async () => {
    const invoice = sampleInvoice({ status: 'ISSUED' });
    const view = renderWithLocale(
      'de',
      createElement(
        'div',
        null,
        createElement(LocaleSwitchHarness, {
          children: createElement(LocaleAwareHeaderHarness, { invoice }),
        }),
      ),
    );
    cleanup = view.cleanup;
    expect(view.container.textContent).toContain(INVOICE_NUMBER_RAW);
    expect(view.container.textContent).toContain(de['invoices.list.col.total']);

    await act(async () => {
      (view.container.querySelector('[data-testid="toggle-locale"]') as HTMLButtonElement)?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });

    const text = view.container.textContent ?? '';
    expect(text).toContain(INVOICE_NUMBER_RAW);
    expect(text).toContain(en['invoices.list.col.total']);
    expect(text).not.toContain(de['invoices.list.col.total']);
  });

  it('preserves edit action eligibility for draft invoices', () => {
    const detail = buildDetail(sampleInvoice({ status: 'DRAFT' }), 'en');
    expect(detail.actions.edit.allowed).toBe(true);
    expect(ridh('en', 'common.edit')).toBe(en['common.edit']);
  });

  it('preserves raw dates and OVERDUE machine status', () => {
    const invoice = sampleInvoice({ status: 'OVERDUE', dueDate: '2026-07-15' });
    const detail = buildDetail(invoice, 'en');
    expect(detail.core.status).toBe('OVERDUE');
    expect(detail.core.dueDate).toBe('2026-07-15');
    expect(detail.core.invoiceDate).toBe('2026-07-01');
    expect(detail.core.statusLabel).toBe(en['invoices.list.status.OVERDUE']);
  });

  it('does not use common.cancel for void menu label in component source', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const dir = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(dir, 'invoices/InvoiceHeaderMoreMenu.tsx'), 'utf8');
    expect(source).toContain('rental.invoice.detail.header.menu.voidInvoice');
    expect(source).not.toContain("ridh(locale, 'common.cancel')");
  });
});
