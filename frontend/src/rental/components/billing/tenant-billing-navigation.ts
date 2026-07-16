export type TenantSubscriptionSubTab =
  | 'overview'
  | 'tariff-vehicles'
  | 'addons'
  | 'invoices'
  | 'payment-method';

export const TENANT_SUBSCRIPTION_SUB_TABS: Array<{ id: TenantSubscriptionSubTab; label: string }> =
  [
    { id: 'overview', label: 'Übersicht' },
    { id: 'tariff-vehicles', label: 'Tarif & Fahrzeuge' },
    { id: 'addons', label: 'Zusatzmodule' },
    { id: 'invoices', label: 'Rechnungen' },
    { id: 'payment-method', label: 'Zahlungsmethode' },
  ];

export const TENANT_BILLING_SUB_TAB_PARAM = 'billingSubTab';

export function parseTenantSubscriptionSubTab(
  value: string | null | undefined,
): TenantSubscriptionSubTab {
  const allowed = TENANT_SUBSCRIPTION_SUB_TABS.map((tab) => tab.id);
  if (value && allowed.includes(value as TenantSubscriptionSubTab)) {
    return value as TenantSubscriptionSubTab;
  }
  return 'overview';
}

export function readTenantBillingSubTab(search = ''): TenantSubscriptionSubTab {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return parseTenantSubscriptionSubTab(params.get(TENANT_BILLING_SUB_TAB_PARAM));
}

export function buildTenantBillingSubTabSearch(
  subTab: TenantSubscriptionSubTab,
  baseSearch = '',
): string {
  const params = new URLSearchParams(baseSearch.startsWith('?') ? baseSearch.slice(1) : baseSearch);
  params.set(TENANT_BILLING_SUB_TAB_PARAM, subTab);
  const query = params.toString();
  return query ? `?${query}` : '';
}
