import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TenantInvoiceListItemDto, TenantInvoicePaymentHistoryDto } from '../../types/billing.types';
import {
  hasPaymentProblem,
  mapInvoiceStatusFilter,
  resolvePaymentStatusLabel,
  resolveTenantInvoiceStatusLabel,
  summarizeFailedAttempt,
  tenantInvoiceStatusLabels,
} from './tenant-invoices.utils';

const billingDir = resolve(import.meta.dirname);

function buildInvoice(
  partial: Partial<TenantInvoiceListItemDto> = {},
): TenantInvoiceListItemDto {
  return {
    id: 'inv-1',
    invoiceNumber: 'RE-2026-0001',
    invoiceNumberLabel: 'RE-2026-0001',
    invoiceDate: '2026-07-01T00:00:00.000Z',
    periodStart: '2026-07-01T00:00:00.000Z',
    periodEnd: '2026-07-31T00:00:00.000Z',
    status: 'OPEN',
    statusLabel: 'Offen',
    netAmount: { cents: 10000, currency: 'EUR', formatted: '100,00 €' },
    taxAmount: { cents: 1900, currency: 'EUR', formatted: '19,00 €' },
    grossAmount: { cents: 11900, currency: 'EUR', formatted: '119,00 €' },
    amountDue: { cents: 11900, currency: 'EUR', formatted: '119,00 €' },
    amountRemaining: { cents: 11900, currency: 'EUR', formatted: '119,00 €' },
    dueDate: '2026-07-15T00:00:00.000Z',
    paidAt: null,
    hasHostedInvoice: true,
    hasPdf: false,
    ...partial,
  };
}

describe('tenant invoices utils', () => {
  it('uses backend status labels including void as storniert', () => {
    expect(resolveTenantInvoiceStatusLabel({ statusLabel: 'Storniert', status: 'VOID' })).toBe(
      'Storniert',
    );
    expect(tenantInvoiceStatusLabels.VOID).toBe('Storniert');
  });

  it('maps payment failed label without internal codes', () => {
    expect(resolvePaymentStatusLabel('FAILED')).toBe('Zahlung fehlgeschlagen');
    expect(resolvePaymentStatusLabel('PARTIALLY_REFUNDED')).toBe('Teilweise erstattet');
    expect(resolvePaymentStatusLabel('REFUNDED')).toBe('Erstattet');
  });

  it('detects payment problems from failed attempts', () => {
    const history: TenantInvoicePaymentHistoryDto = {
      invoiceId: 'inv-1',
      currency: 'EUR',
      amountRemaining: { cents: 5000, currency: 'EUR', formatted: '50,00 €' },
      payments: [],
      failedAttempts: [
        {
          attemptNumber: 1,
          status: 'FAILED',
          statusLabel: 'Fehlgeschlagen',
          safeReason: 'Karte wurde abgelehnt.',
          attemptedAt: '2026-07-10T00:00:00.000Z',
          nextRetryAt: null,
        },
      ],
      refunds: [],
      creditNotes: [],
    };
    expect(hasPaymentProblem(history)).toBe(true);
    expect(summarizeFailedAttempt(history.failedAttempts[0])).toBe('Karte wurde abgelehnt.');
  });

  it('supports pdf and hosted invoice flags', () => {
    const withPdf = buildInvoice({ hasPdf: true, hasHostedInvoice: false });
    const withHosted = buildInvoice({ hasPdf: false, hasHostedInvoice: true });
    expect(withPdf.hasPdf).toBe(true);
    expect(withHosted.hasHostedInvoice).toBe(true);
  });

  it('maps overdue filter for server-side query', () => {
    expect(mapInvoiceStatusFilter('OVERDUE')).toBe('OVERDUE');
    expect(mapInvoiceStatusFilter('all')).toBeUndefined();
  });

  it('does not invent invoice numbers', () => {
    const invoice = buildInvoice({ invoiceNumber: null, invoiceNumberLabel: 'Noch nicht finalisiert' });
    expect(invoice.invoiceNumberLabel).not.toMatch(/^RE-/);
  });

  it('uses responsive invoice table layout and backend document urls', () => {
    const sectionSource = readFileSync(resolve(billingDir, 'TenantInvoicesSection.tsx'), 'utf8');
    const detailSource = readFileSync(resolve(billingDir, 'useBillingInvoiceDetail.ts'), 'utf8');
    expect(sectionSource).toContain('min-w-[1080px]');
    expect(detailSource).toContain('orgInvoiceHosted');
    expect(detailSource).toContain('orgInvoicePdf');
  });
});
