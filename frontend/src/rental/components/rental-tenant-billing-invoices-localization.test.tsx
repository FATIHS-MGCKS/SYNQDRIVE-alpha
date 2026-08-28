// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@iconify/react', () => ({
  Icon: () => null,
  disableCache: vi.fn(),
}));

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import type { TranslationKey } from '../../i18n/translations/en';
import { BillingTab } from './billing/BillingTab';
import { TenantInvoicesSection } from './billing/TenantInvoicesSection';
import {
  resolveTenantInvoiceMachineStatus,
  resolveTenantInvoiceStatusLabel,
  resolveTenantInvoiceStatusTone,
  resolveTenantPaymentStatusLabel,
} from '../lib/rental-tenant-billing-i18n';
import type { TenantInvoiceListItemDto } from '../types/billing.types';

const P256_ENFORCE_CLEAN_EXACT = [
  'rental/components/billing/TenantInvoicesSection.tsx',
  'rental/components/billing/TenantInvoiceDetailDrawer.tsx',
  'rental/components/billing/tenant-invoices.utils.ts',
  'rental/components/billing/useBillingInvoiceDetail.ts',
];

const RAW_INVOICE_NUMBER = 'INV-X7-2026-0042';
const RAW_STATUS_LABEL = 'Provider Invoice Status X7';
const RAW_LINE_DESCRIPTION = 'Provider Line X7';
const RAW_PAYMENT_PROVIDER = 'Provider Payment X7';
const RAW_PAYMENT_STATUS = 'Provider Payment Status X7';
const RAW_FAILURE_REASON = 'Provider Failure Reason X7';
const PROVIDER_FORMATTED = '1.234,56 € PROVIDER-X7';
const DOCUMENT_URL = 'https://provider.example/x7/invoice.pdf?token=raw-x7';

const invoiceQuery = {
  page: 2,
  pageSize: 20,
  sort: '-invoiceDate',
  status: 'OPEN',
  search: RAW_INVOICE_NUMBER,
};

const setQuery = vi.fn();
const reloadInvoices = vi.fn();

const translate =
  (dict: Record<string, string>) =>
  (key: TranslationKey, vars?: Record<string, string | number>) => {
    let text = dict[key] ?? key;
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, String(v));
      });
    }
    return text;
  };

const tDe = translate(de);
const tEn = translate(en);

function money(cents: number, formatted: string) {
  return { cents, currency: 'EUR', formatted };
}

function buildInvoice(
  partial: Partial<TenantInvoiceListItemDto> = {},
): TenantInvoiceListItemDto {
  return {
    id: 'invoice-x7',
    invoiceNumber: RAW_INVOICE_NUMBER,
    invoiceNumberLabel: RAW_INVOICE_NUMBER,
    invoiceDate: '2026-07-01T00:00:00.000Z',
    periodStart: '2026-07-01T00:00:00.000Z',
    periodEnd: '2026-07-31T00:00:00.000Z',
    status: 'OPEN',
    statusLabel: RAW_STATUS_LABEL,
    netAmount: money(100000, PROVIDER_FORMATTED),
    taxAmount: money(19000, '190,00 €'),
    grossAmount: money(119000, PROVIDER_FORMATTED),
    amountDue: money(119000, PROVIDER_FORMATTED),
    amountRemaining: money(119000, PROVIDER_FORMATTED),
    dueDate: '2026-07-15T00:00:00.000Z',
    paidAt: null,
    hasHostedInvoice: true,
    hasPdf: true,
    ...partial,
  };
}

const invoices = [buildInvoice()];

vi.mock('./billing/useBillingSubscriptionOverview', () => ({
  useBillingSubscriptionOverview: () => ({
    overview: null,
    summary: { stripeConfigured: true, stripePortalPrepared: true },
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

vi.mock('./billing/useBillingTariffVehicles', () => ({
  useBillingTariffVehicles: () => ({ reloadAll: vi.fn() }),
}));

vi.mock('./billing/useBillingInvoices', () => ({
  useBillingInvoices: () => ({
    invoices,
    loading: false,
    error: null,
    meta: { page: 2, totalPages: 3, total: 50, pageSize: 20 },
    query: invoiceQuery,
    setQuery,
    reload: reloadInvoices,
  }),
}));

vi.mock('./billing/useBillingPaymentMethods', () => ({
  useBillingPaymentMethods: () => ({
    data: { configured: true, paymentMethods: [] },
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

vi.mock('./billing/useBillingStripeActions', () => ({
  useBillingStripeActions: () => ({
    canUseStripePayments: true,
    loading: false,
    error: null,
    openCustomerPortal: vi.fn(),
  }),
}));

vi.mock('./billing/useBillingInvoiceDetail', () => ({
  useBillingInvoiceDetail: () => ({
    detail: {
      ...buildInvoice(),
      amountPaid: null,
      voidedAt: null,
      lines: [
        {
          description: RAW_LINE_DESCRIPTION,
          quantity: 2,
          unitAmount: money(50000, '500,00 €'),
          netAmount: money(100000, PROVIDER_FORMATTED),
          taxAmount: money(19000, '190,00 €'),
          grossAmount: money(119000, PROVIDER_FORMATTED),
          periodStart: '2026-07-01T00:00:00.000Z',
          periodEnd: '2026-07-31T00:00:00.000Z',
        },
      ],
    },
    payments: {
      invoiceId: 'invoice-x7',
      currency: 'EUR',
      amountRemaining: money(119000, PROVIDER_FORMATTED),
      payments: [
        {
          amount: money(119000, PROVIDER_FORMATTED),
          status: 'FAILED',
          statusLabel: RAW_PAYMENT_STATUS,
          providerLabel: RAW_PAYMENT_PROVIDER,
          succeededAt: null,
          failedAt: '2026-07-10T00:00:00.000Z',
          refundedAmount: null,
          remainingAmount: money(119000, PROVIDER_FORMATTED),
          attempts: [],
          refunds: [],
        },
      ],
      failedAttempts: [
        {
          attemptNumber: 1,
          status: 'FAILED',
          statusLabel: RAW_PAYMENT_STATUS,
          safeReason: RAW_FAILURE_REASON,
          attemptedAt: '2026-07-10T00:00:00.000Z',
          nextRetryAt: null,
        },
      ],
      refunds: [],
      creditNotes: [],
    },
    detailLoading: false,
    paymentsLoading: false,
    detailError: null,
    paymentsError: null,
    reloadDetail: vi.fn(),
    reloadPayments: vi.fn(),
    openHostedInvoice: vi.fn(async () => DOCUMENT_URL),
    openInvoicePdf: vi.fn(async () => DOCUMENT_URL),
  }),
  useInvoiceDocumentAction: () => ({
    loadingHosted: false,
    loadingPdf: false,
    error: null,
    clearError: vi.fn(),
    openHosted: vi.fn(),
    openPdf: vi.fn(),
  }),
}));

vi.mock('../RentalContext', () => ({
  useRentalOrg: () => ({
    orgId: 'org-1',
    hasPermission: () => true,
    loading: false,
  }),
}));

describe('P2.2.56 rental tenant billing invoices localization', () => {
  beforeEach(() => {
    setQuery.mockClear();
    window.history.replaceState(null, '', '/settings?settingsTab=billing&billingSubTab=invoices');
  });

  it('has zero P256 enforce-clean scanner debt on active paths', () => {
    const scoped = inventory.findings.filter((f) => P256_ENFORCE_CLEAN_EXACT.includes(f.file));
    expect(scoped).toHaveLength(0);
  });

  it('certifies dead legacy invoice components remain untouched', () => {
    const legacySection = readFileSync(
      resolve(import.meta.dirname, 'billing/BillingInvoiceSection.tsx'),
      'utf8',
    );
    const legacyDrawer = readFileSync(
      resolve(import.meta.dirname, 'billing/BillingInvoiceDetailDrawer.tsx'),
      'utf8',
    );
    expect(legacySection).toContain('Rechnungen konnten nicht geladen werden');
    expect(legacyDrawer).toContain('Detailansicht mit Positionen');
  });

  it('uses machine-based invoice status tone with equivalent mapping', () => {
    expect(resolveTenantInvoiceStatusTone('DRAFT')).toBe('sq-tone-neutral');
    expect(resolveTenantInvoiceStatusTone('OPEN')).toBe('sq-tone-warning');
    expect(resolveTenantInvoiceStatusTone('OVERDUE')).toBe('sq-tone-critical');
    expect(resolveTenantInvoiceStatusTone('PAID')).toBe('sq-tone-success');
    expect(resolveTenantInvoiceStatusTone('VOID')).toBe('sq-tone-neutral');
    expect(resolveTenantInvoiceStatusTone('UNCOLLECTIBLE')).toBe('sq-tone-critical');
  });

  it('preserves raw statusLabel precedence and overdue machine derivation', () => {
    expect(
      resolveTenantInvoiceStatusLabel(
        { status: 'OPEN', statusLabel: RAW_STATUS_LABEL, dueDate: '2099-01-01T00:00:00.000Z' },
        tEn,
      ),
    ).toBe(RAW_STATUS_LABEL);
    expect(
      resolveTenantInvoiceMachineStatus({
        status: 'OPEN',
        dueDate: '2020-01-01T00:00:00.000Z',
      }),
    ).toBe('OVERDUE');
    expect(
      resolveTenantInvoiceStatusLabel(
        { status: 'OPEN', statusLabel: '', dueDate: '2020-01-01T00:00:00.000Z' },
        tEn,
      ),
    ).toBe('Overdue');
  });

  it('localizes list chrome in EN while preserving raw invoice fields in DOM', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    function EnListSurface() {
      const { setLocale } = useLanguage();
      return createElement(
        'div',
        null,
        createElement('button', {
          type: 'button',
          'data-testid': 'locale-en',
          onClick: () => setLocale('en'),
        }),
        createElement(TenantInvoicesSection, {
          orgId: 'org-1',
          invoices,
          meta: { page: 2, totalPages: 3, total: 50, limit: 20 },
          query: invoiceQuery,
          loading: false,
          error: null,
          onQueryChange: setQuery,
          onRetry: reloadInvoices,
          canWrite: true,
        }),
      );
    }

    await act(async () => {
      root.render(createElement(LanguageProvider, null, createElement(EnListSurface)));
    });

    await act(async () => {
      container.querySelector('[data-testid="locale-en"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });

    expect(container.textContent).toContain('Invoices');
    expect(container.textContent).toContain(RAW_INVOICE_NUMBER);
    expect(container.textContent).toContain(RAW_STATUS_LABEL);
    expect(container.textContent).toContain(PROVIDER_FORMATTED);

    root.unmount();
    container.remove();
  });

  it('preserves list query state across locale switch without business callbacks', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    function LocaleHarness() {
      const { setLocale } = useLanguage();
      return createElement(
        'div',
        null,
        createElement('button', {
          type: 'button',
          'data-testid': 'locale-de',
          onClick: () => setLocale('de'),
        }),
        createElement('button', {
          type: 'button',
          'data-testid': 'locale-en',
          onClick: () => setLocale('en'),
        }),
        createElement(BillingTab),
      );
    }

    await act(async () => {
      root.render(createElement(LanguageProvider, null, createElement(LocaleHarness)));
    });

    setQuery.mockClear();

    await act(async () => {
      container.querySelector('[data-testid="locale-en"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    await act(async () => {
      container.querySelector('[data-testid="locale-de"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });

    expect(setQuery).not.toHaveBeenCalled();
    expect(container.textContent).toContain(RAW_INVOICE_NUMBER);
    expect(container.textContent).toContain(PROVIDER_FORMATTED);

    root.unmount();
    container.remove();
  });

  it('keeps drawer open with raw detail fields across locale switch', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    function LocaleHarness() {
      const { setLocale } = useLanguage();
      return createElement(
        'div',
        null,
        createElement('button', {
          type: 'button',
          'data-testid': 'locale-en',
          onClick: () => setLocale('en'),
        }),
        createElement(TenantInvoicesSection, {
          orgId: 'org-1',
          invoices,
          meta: { page: 2, totalPages: 3, total: 50, limit: 20 },
          query: invoiceQuery,
          loading: false,
          error: null,
          onQueryChange: setQuery,
          onRetry: reloadInvoices,
          canWrite: true,
        }),
      );
    }

    await act(async () => {
      root.render(createElement(LanguageProvider, null, createElement(LocaleHarness)));
    });

    await act(async () => {
      container.querySelector('[data-testid="tenant-invoices-table"] tbody tr')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });

    const bodyText = document.body.textContent ?? '';
    expect(bodyText).toContain(RAW_INVOICE_NUMBER);
    expect(bodyText).toContain(RAW_LINE_DESCRIPTION);
    expect(bodyText).toContain(RAW_PAYMENT_PROVIDER);
    expect(bodyText).toContain(RAW_PAYMENT_STATUS);
    expect(bodyText).toContain(RAW_FAILURE_REASON);

    setQuery.mockClear();

    await act(async () => {
      container.querySelector('[data-testid="locale-en"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });

    const bodyTextEn = document.body.textContent ?? '';
    expect(setQuery).not.toHaveBeenCalled();
    expect(bodyTextEn).toContain('Invoice details and payment history');
    expect(bodyTextEn).toContain(RAW_INVOICE_NUMBER);
    expect(bodyTextEn).toContain(RAW_LINE_DESCRIPTION);
    expect(bodyTextEn).toContain(PROVIDER_FORMATTED);
    expect(
      resolveTenantPaymentStatusLabel('FAILED', RAW_PAYMENT_STATUS, tEn),
    ).toBe(RAW_PAYMENT_STATUS);

    root.unmount();
    container.remove();
  });
});
