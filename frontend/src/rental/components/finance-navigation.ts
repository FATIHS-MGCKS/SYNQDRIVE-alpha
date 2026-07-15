export type FinanceTab = 'invoices' | 'price-tariffs' | 'customer-payments';

export const FINANCE_VIEW_PARAM = 'view';
export const LEGACY_BILLING_SECTION_PARAM = 'billingSection';
export const LEGACY_BILLING_CUSTOMER_PAYMENTS_SECTION = 'customer-payments';

const FINANCE_VIEWS = new Set<string>(['invoices', 'price-tariffs', 'customer-payments', 'financial-insights']);

export function isFinanceView(view: string): view is FinanceTab | 'financial-insights' {
  return FINANCE_VIEWS.has(view);
}

export function isLegacyBillingCustomerPaymentsUrl(search = ''): boolean {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return params.get(LEGACY_BILLING_SECTION_PARAM) === LEGACY_BILLING_CUSTOMER_PAYMENTS_SECTION;
}

export function parseFinanceViewFromUrl(search = ''): FinanceTab | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);

  if (isLegacyBillingCustomerPaymentsUrl(search)) {
    return 'customer-payments';
  }

  const view = params.get(FINANCE_VIEW_PARAM);
  if (view === 'customer-payments' || view === 'invoices' || view === 'price-tariffs') {
    return view;
  }

  return null;
}

export function stripLegacyBillingCustomerPaymentsParams(search = ''): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  let changed = false;

  if (params.get(LEGACY_BILLING_SECTION_PARAM) === LEGACY_BILLING_CUSTOMER_PAYMENTS_SECTION) {
    params.delete(LEGACY_BILLING_SECTION_PARAM);
    changed = true;
  }

  if (params.get('settingsTab') === 'billing' && changed) {
    params.delete('settingsTab');
  }

  const query = params.toString();
  if (!changed) return search.startsWith('?') || search.includes('=') ? (query ? `?${query}` : '') : search;
  return query ? `?${query}` : '';
}

export function buildCustomerPaymentsReturnUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}?${FINANCE_VIEW_PARAM}=customer-payments`;
}
