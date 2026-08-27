export type TenantSubscriptionSubTab =
  | 'overview'
  | 'tariff-vehicles'
  | 'addons'
  | 'invoices'
  | 'payment-method';

export const TENANT_SUBSCRIPTION_SUB_TAB_IDS: TenantSubscriptionSubTab[] = [
  'overview',
  'tariff-vehicles',
  'addons',
  'invoices',
  'payment-method',
];

/** @deprecated Use TENANT_SUBSCRIPTION_SUB_TAB_IDS + resolveTenantBillingTabLabel */
export const TENANT_SUBSCRIPTION_SUB_TABS: Array<{ id: TenantSubscriptionSubTab; label: string }> =
  TENANT_SUBSCRIPTION_SUB_TAB_IDS.map((id) => ({ id, label: id }));

export const TENANT_BILLING_SUB_TAB_PARAM = 'billingSubTab';

export function parseTenantSubscriptionSubTab(
  value: string | null | undefined,
): TenantSubscriptionSubTab {
  if (value && TENANT_SUBSCRIPTION_SUB_TAB_IDS.includes(value as TenantSubscriptionSubTab)) {
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
