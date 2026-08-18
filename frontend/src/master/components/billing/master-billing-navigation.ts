export type MasterBillingSection =
  | 'overview'
  | 'subscriptions'
  | 'invoices'
  | 'pricing'
  | 'reconciliation'
  | 'audit';

/** @deprecated Legacy section ids — mapped to canonical sections */
export type MasterBillingLegacySection =
  | 'organizations'
  | 'invoices-payments'
  | 'system-sync';

export type MasterBillingInvoicesTab = 'invoices';

export type MasterBillingReconciliationTab = 'drifts' | 'platform-sync' | 'webhooks';

export type MasterBillingAuditTab =
  | 'contracts'
  | 'pricing'
  | 'payments'
  | 'system';

export type MasterBillingPricingTab =
  | 'products'
  | 'versions'
  | 'tiers'
  | 'simulation'
  | 'stripe';

export const MASTER_BILLING_SECTION_PARAM = 'masterBilling';
export const MASTER_BILLING_SUB_TAB_PARAM = 'masterBillingTab';
export const MASTER_BILLING_ORG_PARAM = 'orgId';
export const MASTER_BILLING_SUBSCRIPTION_PARAM = 'subscriptionId';

export const MASTER_BILLING_SECTIONS: Array<{ id: MasterBillingSection; label: string }> = [
  { id: 'overview', label: 'Übersicht' },
  { id: 'subscriptions', label: 'Verträge' },
  { id: 'invoices', label: 'Rechnungen' },
  { id: 'pricing', label: 'Tarife & Preise' },
  { id: 'reconciliation', label: 'Abgleich' },
  { id: 'audit', label: 'Audit' },
];

export const MASTER_BILLING_RECONCILIATION_TABS: Array<{
  id: MasterBillingReconciliationTab;
  label: string;
}> = [
  { id: 'drifts', label: 'Abweichungen' },
  { id: 'platform-sync', label: 'Plattform-Sync' },
  { id: 'webhooks', label: 'Webhooks' },
];

export const MASTER_BILLING_AUDIT_TABS: Array<{ id: MasterBillingAuditTab; label: string }> = [
  { id: 'contracts', label: 'Verträge' },
  { id: 'pricing', label: 'Preise' },
  { id: 'payments', label: 'Zahlungen' },
  { id: 'system', label: 'System' },
];

export const MASTER_BILLING_PRICING_TABS: Array<{ id: MasterBillingPricingTab; label: string }> = [
  { id: 'products', label: 'Produkte' },
  { id: 'versions', label: 'Versionen' },
  { id: 'tiers', label: 'Staffeln' },
  { id: 'simulation', label: 'Simulation' },
  { id: 'stripe', label: 'Stripe' },
];

const SECTION_IDS = new Set(MASTER_BILLING_SECTIONS.map((section) => section.id));

const LEGACY_SECTION_MAP: Record<string, MasterBillingSection> = {
  organizations: 'subscriptions',
  'invoices-payments': 'invoices',
  'system-sync': 'reconciliation',
};

const LEGACY_SUB_TAB_MAP: Record<string, string> = {
  'stripe-api': 'platform-sync',
  reconciliation: 'drifts',
  'stripe-map': 'stripe',
};

export function normalizeMasterBillingSection(value: string | null | undefined): MasterBillingSection {
  if (!value) return 'overview';
  if (SECTION_IDS.has(value as MasterBillingSection)) {
    return value as MasterBillingSection;
  }
  return LEGACY_SECTION_MAP[value] ?? 'overview';
}

export function parseMasterBillingSection(value: string | null | undefined): MasterBillingSection {
  return normalizeMasterBillingSection(value);
}

export function parseMasterBillingSubTab<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  const normalized = value ? (LEGACY_SUB_TAB_MAP[value] ?? value) : value;
  if (normalized && allowed.includes(normalized as T)) {
    return normalized as T;
  }
  return fallback;
}

export interface MasterBillingLocationState {
  section: MasterBillingSection;
  subTab: string | null;
  orgId: string | null;
  subscriptionId: string | null;
}

export function readMasterBillingLocation(search = ''): MasterBillingLocationState {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const rawSection = params.get(MASTER_BILLING_SECTION_PARAM);
  const rawSubTab = params.get(MASTER_BILLING_SUB_TAB_PARAM);
  const legacyOrgId = params.get(MASTER_BILLING_ORG_PARAM);
  const subscriptionId = params.get(MASTER_BILLING_SUBSCRIPTION_PARAM) ?? legacyOrgId;

  return {
    section: normalizeMasterBillingSection(rawSection),
    subTab: rawSubTab ? (LEGACY_SUB_TAB_MAP[rawSubTab] ?? rawSubTab) : null,
    orgId: legacyOrgId,
    subscriptionId,
  };
}

export function buildMasterBillingSearch(
  input: Partial<MasterBillingLocationState> & { section?: MasterBillingSection },
  baseSearch = '',
): string {
  const params = new URLSearchParams(baseSearch.startsWith('?') ? baseSearch.slice(1) : baseSearch);

  if (input.section) {
    params.set(MASTER_BILLING_SECTION_PARAM, input.section);
  }

  if (input.subTab === null) {
    params.delete(MASTER_BILLING_SUB_TAB_PARAM);
  } else if (input.subTab) {
    params.set(MASTER_BILLING_SUB_TAB_PARAM, input.subTab);
  }

  if (input.subscriptionId === null) {
    params.delete(MASTER_BILLING_SUBSCRIPTION_PARAM);
    params.delete(MASTER_BILLING_ORG_PARAM);
  } else if (input.subscriptionId) {
    params.set(MASTER_BILLING_SUBSCRIPTION_PARAM, input.subscriptionId);
    params.delete(MASTER_BILLING_ORG_PARAM);
  }

  if (input.orgId === null) {
    params.delete(MASTER_BILLING_ORG_PARAM);
  } else if (input.orgId && !input.subscriptionId) {
    params.set(MASTER_BILLING_ORG_PARAM, input.orgId);
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

export function defaultSubTabForSection(section: MasterBillingSection): string | null {
  switch (section) {
    case 'invoices':
      return 'invoices';
    case 'reconciliation':
      return 'drifts';
    case 'audit':
      return 'contracts';
    case 'pricing':
      return 'products';
    default:
      return null;
  }
}

export function sectionNeedsOperationalData(section: MasterBillingSection): boolean {
  return section === 'overview' || section === 'subscriptions';
}

/** @deprecated use sectionNeedsOperationalData */
export function sectionNeedsCoreData(section: MasterBillingSection): boolean {
  return sectionNeedsOperationalData(section);
}
