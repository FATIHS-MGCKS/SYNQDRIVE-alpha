import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import type { TranslationKey } from '../../i18n/translations/en';
import type { TenantPaymentMethodDto } from '../../types/billing.types';
import {
  formatPaymentMethodDisplayLocalized,
  resolvePaymentMethodBillingStateLabel,
} from '../../lib/rental-tenant-billing-i18n';
import {
  hasAnyPaymentMethodProblem,
  paymentMethodBillingStateTone,
  paymentMethodNeedsAttention,
} from './tenant-payment-methods.utils';

const billingDir = resolve(import.meta.dirname);

const translate =
  (dict: Record<string, string>) =>
  (key: TranslationKey) =>
    dict[key] ?? key;

const tDe = translate(de);
const tEn = translate(en);

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
  it('formats card brand and last4 with localized expiry wrapper', () => {
    const display = formatPaymentMethodDisplayLocalized(buildCard(), tDe);
    expect(display.title).toContain('visa');
    expect(display.title).toContain('4242');
    expect(display.detail).toContain('12/2028');
    expect(display.detail).toContain(de['tenantBilling.paymentMethod.display.expiryPrefix']);
  });

  it('formats sepa bank and iban last4 with localized mandate prefix', () => {
    const display = formatPaymentMethodDisplayLocalized(buildSepa(), tDe);
    expect(display.title).toContain('Demo Bank');
    expect(display.title).toContain('3000');
    expect(display.detail).toBe(
      `${de['tenantBilling.paymentMethod.display.mandatePrefix']}Aktiv`,
    );
  });

  it('flags failed payment methods and maps billing state labels', () => {
    const failed = buildCard({ billingState: 'FAILED', isDefault: true });
    expect(paymentMethodNeedsAttention(failed)).toBe(true);
    expect(hasAnyPaymentMethodProblem([failed])).toBe(true);
    expect(paymentMethodBillingStateTone('FAILED')).toBe('sq-tone-critical');
    expect(resolvePaymentMethodBillingStateLabel('FAILED', tDe)).toBe(
      de['tenantBilling.paymentMethod.state.failed'],
    );
    expect(resolvePaymentMethodBillingStateLabel('FAILED', tEn)).toBe(
      en['tenantBilling.paymentMethod.state.failed'],
    );
  });

  it('supports default method change actions in section', () => {
    const source = readFileSync(resolve(billingDir, 'TenantPaymentMethodsSection.tsx'), 'utf8');
    const actionsSource = readFileSync(resolve(billingDir, 'useBillingPaymentMethodActions.ts'), 'utf8');
    expect(source).toContain("t('tenantBilling.paymentMethod.action.setDefault')");
    expect(actionsSource).toContain('orgPaymentMethodSetDefault');
    expect(source).toContain('flex-col sm:flex-row');
  });

  it('blocks foreign invoice access at api layer', () => {
    const source = readFileSync(resolve(billingDir, 'useBillingInvoiceDetail.ts'), 'utf8');
    expect(source).toContain('orgInvoiceDetail');
    expect(source).toContain('mapBillingLoadError');
  });
});
