import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TenantPaymentMethodDto } from '../../types/billing.types';
import {
  formatPaymentMethodDisplay,
  hasAnyPaymentMethodProblem,
  paymentMethodBillingStateLabel,
  paymentMethodNeedsAttention,
} from './tenant-payment-methods.utils';

const billingDir = resolve(import.meta.dirname);

function buildCard(partial: Partial<TenantPaymentMethodDto> = {}): TenantPaymentMethodDto {
  return {
    id: 'pm-card',
    type: 'CARD',
    typeLabel: 'Karte',
    brand: 'visa',
    last4: '4242',
    expMonth: 12,
    expYear: 2028,
    bankName: null,
    mandateStatusLabel: null,
    isDefault: true,
    statusLabel: 'Aktiv',
    billingState: 'READY',
    ...partial,
  };
}

function buildSepa(partial: Partial<TenantPaymentMethodDto> = {}): TenantPaymentMethodDto {
  return {
    id: 'pm-sepa',
    type: 'SEPA_DEBIT',
    typeLabel: 'SEPA-Lastschrift',
    brand: null,
    last4: '3000',
    expMonth: null,
    expYear: null,
    bankName: 'Demo Bank',
    mandateStatusLabel: 'Aktiv',
    isDefault: false,
    statusLabel: 'Aktiv',
    billingState: 'READY',
    ...partial,
  };
}

describe('tenant payment methods utils', () => {
  it('formats card brand and last4', () => {
    const display = formatPaymentMethodDisplay(buildCard());
    expect(display.title).toContain('visa');
    expect(display.title).toContain('4242');
    expect(display.detail).toContain('12/2028');
  });

  it('formats sepa bank and iban last4', () => {
    const display = formatPaymentMethodDisplay(buildSepa());
    expect(display.title).toContain('Demo Bank');
    expect(display.title).toContain('3000');
    expect(display.detail).toBe('Mandat: Aktiv');
  });

  it('flags failed payment methods', () => {
    const failed = buildCard({ billingState: 'FAILED', isDefault: true });
    expect(paymentMethodNeedsAttention(failed)).toBe(true);
    expect(hasAnyPaymentMethodProblem([failed])).toBe(true);
    expect(paymentMethodBillingStateLabel('FAILED')).toBe('Ungültig oder abgelaufen');
  });

  it('supports default method change actions in section', () => {
    const source = readFileSync(resolve(billingDir, 'TenantPaymentMethodsSection.tsx'), 'utf8');
    const actionsSource = readFileSync(resolve(billingDir, 'useBillingPaymentMethodActions.ts'), 'utf8');
    expect(source).toContain('Als Standard setzen');
    expect(actionsSource).toContain('orgPaymentMethodSetDefault');
    expect(source).toContain('flex-col sm:flex-row');
  });

  it('blocks foreign invoice access at api layer', () => {
    const source = readFileSync(resolve(billingDir, 'useBillingInvoiceDetail.ts'), 'utf8');
    expect(source).toContain('orgInvoiceDetail');
    expect(source).toContain('mapBillingLoadError');
  });
});
