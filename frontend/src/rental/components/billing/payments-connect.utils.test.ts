import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import {
  extractConnectErrorCode,
  formatConnectReturnUrl,
  formatRequirementLabel,
  mapConnectStatusToUiState,
} from './payments-connect.utils';
import type { ConnectStatusDto } from '../../types/payments-connect.types';

const billingDir = resolve(__dirname);

const baseStatus: ConnectStatusDto = {
  onboardingStatus: 'ONBOARDING',
  detailsSubmitted: false,
  chargesEnabled: false,
  payoutsEnabled: false,
  disabledReason: null,
  requirementsCurrentlyDue: ['external_account'],
  requirementsPastDue: [],
  bankAccountLast4: null,
  country: 'DE',
  defaultCurrency: 'EUR',
  lastSyncedAt: null,
};

describe('mapConnectStatusToUiState', () => {
  it('maps NOT_STARTED when no status', () => {
    expect(mapConnectStatusToUiState(null)).toBe('NOT_STARTED');
  });

  it('maps FEATURE_DISABLED from error code', () => {
    expect(mapConnectStatusToUiState(null, 'PAYMENTS_FEATURE_DISABLED')).toBe('FEATURE_DISABLED');
  });

  it('maps ACTIVE', () => {
    expect(
      mapConnectStatusToUiState({
        ...baseStatus,
        onboardingStatus: 'ACTIVE',
        chargesEnabled: true,
        payoutsEnabled: true,
      }),
    ).toBe('ACTIVE');
  });

  it('maps RESTRICTED and DISABLED', () => {
    expect(
      mapConnectStatusToUiState({ ...baseStatus, onboardingStatus: 'RESTRICTED' }),
    ).toBe('RESTRICTED');
    expect(
      mapConnectStatusToUiState({ ...baseStatus, onboardingStatus: 'DISABLED' }),
    ).toBe('DISABLED');
    expect(
      mapConnectStatusToUiState({ ...baseStatus, onboardingStatus: 'REJECTED' }),
    ).toBe('DISABLED');
  });

  it('maps ONBOARDING for pending states', () => {
    expect(mapConnectStatusToUiState(baseStatus)).toBe('ONBOARDING');
    expect(
      mapConnectStatusToUiState({ ...baseStatus, onboardingStatus: 'PENDING' }),
    ).toBe('ONBOARDING');
  });
});

describe('extractConnectErrorCode', () => {
  it('detects feature disabled and not configured', () => {
    expect(extractConnectErrorCode(new Error('PAYMENTS_FEATURE_DISABLED'))).toBe(
      'PAYMENTS_FEATURE_DISABLED',
    );
    expect(extractConnectErrorCode(new Error('CONNECT_NOT_CONFIGURED'))).toBe(
      'CONNECT_NOT_CONFIGURED',
    );
  });

  it('detects provider and mode errors', () => {
    expect(extractConnectErrorCode(new Error('CONNECT_PROVIDER_ERROR: timeout'))).toBe(
      'CONNECT_PROVIDER_ERROR',
    );
    expect(extractConnectErrorCode(new Error('STRIPE_MODE_MISMATCH'))).toBe('STRIPE_MODE_MISMATCH');
  });
});

describe('formatRequirementLabel', () => {
  it('humanizes stripe requirement keys', () => {
    expect(formatRequirementLabel('external_account')).toBe('External Account');
    expect(formatRequirementLabel('individual.verification.document')).toContain('Individual');
  });
});

describe('formatConnectReturnUrl', () => {
  it('includes billing customer-payments section param', () => {
    vi.stubGlobal('window', {
      location: {
        origin: 'https://app.synqdrive.eu',
        pathname: '/rental/settings',
      },
    });
    const url = formatConnectReturnUrl();
    expect(url).toContain('billingSection=customer-payments');
    expect(url).toContain('settingsTab=billing');
    vi.unstubAllGlobals();
  });
});

describe('billing customer payments i18n', () => {
  const keys = [
    'billing.section.subscription',
    'billing.section.customerPayments',
    'billing.customerPayments.setupCta',
    'billing.customerPayments.continueCta',
    'billing.customerPayments.state.active',
    'billing.customerPayments.state.disabled',
    'billing.customerPayments.state.featureDisabled',
    'billing.customerPayments.chargesDisabledHint',
    'billing.customerPayments.payoutsDisabledHint',
    'bookingPayment.success.checkoutReady',
    'bookingPayment.success.paid',
    'bookingPayment.success.expired',
  ] as const;

  it('defines DE and EN labels for customer payments', () => {
    for (const key of keys) {
      expect(en[key]).toBeTruthy();
      expect(de[key]).toBeTruthy();
      expect(en[key]).not.toBe(key);
      expect(de[key]).not.toBe(key);
    }
  });
});

describe('CustomerPaymentsTab layout', () => {
  it('uses responsive layout utilities', () => {
    const source = readFileSync(resolve(billingDir, 'CustomerPaymentsTab.tsx'), 'utf8');
    expect(source).toContain('sm:flex-row');
    expect(source).toContain('grid-cols-1 sm:grid-cols-2');
    expect(source).toContain('data-testid="customer-payments-tab"');
    expect(source).toContain('chargesDisabledHint');
    expect(source).toContain('payoutsDisabledHint');
    expect(source).toContain("hasPermission('payments-connect', 'read')");
    expect(source).toContain("hasPermission('payments-connect', 'manage')");
  });
});

describe('BillingTab subscription section', () => {
  it('renders tenant subscription sub-tabs and overview', () => {
    const source = readFileSync(resolve(billingDir, 'BillingTab.tsx'), 'utf8');
    expect(source).toContain('TenantSubscriptionTabBar');
    expect(source).toContain('TenantBillingOverviewTab');
    expect(source).toContain('TenantBillingTariffVehiclesTab');
    expect(source).toContain('TenantBillingAddOnsTab');
    expect(source).toContain('TenantBillingInvoicesTab');
    expect(source).toContain('TenantBillingPaymentMethodTab');
    expect(source).toContain("section === 'customer-payments'");
    expect(source).toContain('CustomerPaymentsTab');

    const invoicesTabSource = readFileSync(
      resolve(billingDir, 'TenantBillingInvoicesTab.tsx'),
      'utf8',
    );
    expect(invoicesTabSource).toContain('BillingInvoiceSection');
  });
});
