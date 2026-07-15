export type MasterBillingSection =
  | 'overview'
  | 'organizations'
  | 'pricing'
  | 'invoices-payments'
  | 'system-sync'
  | 'audit';

export type MasterBillingInvoicesPaymentsTab =
  | 'invoices'
  | 'payment-methods'
  | 'payment-attempts'
  | 'refunds'
  | 'credit-notes';

export type MasterBillingSystemSyncTab =
  | 'stripe-api'
  | 'webhooks'
  | 'reconciliation'
  | 'resend'
  | 'outbox';

export type MasterBillingAuditTab =
  | 'contracts'
  | 'pricing'
  | 'payments'
  | 'system';

export const MASTER_BILLING_SECTION_PARAM = 'masterBilling';
export const MASTER_BILLING_SUB_TAB_PARAM = 'masterBillingTab';
export const MASTER_BILLING_ORG_PARAM = 'orgId';

export const MASTER_BILLING_SECTIONS: Array<{ id: MasterBillingSection; label: string }> = [
  { id: 'overview', label: 'Übersicht' },
  { id: 'organizations', label: 'Unternehmen & Verträge' },
  { id: 'pricing', label: 'Tarife & Preise' },
  { id: 'invoices-payments', label: 'Rechnungen & Zahlungen' },
  { id: 'system-sync', label: 'System & Synchronisation' },
  { id: 'audit', label: 'Audit' },
];

export const MASTER_BILLING_INVOICES_PAYMENTS_TABS: Array<{
  id: MasterBillingInvoicesPaymentsTab;
  label: string;
}> = [
  { id: 'invoices', label: 'Rechnungen' },
  { id: 'payment-methods', label: 'Zahlungsmethoden' },
  { id: 'payment-attempts', label: 'Zahlungsversuche' },
  { id: 'refunds', label: 'Refunds' },
  { id: 'credit-notes', label: 'Credit Notes' },
];

export const MASTER_BILLING_SYSTEM_SYNC_TABS: Array<{ id: MasterBillingSystemSyncTab; label: string }> =
  [
    { id: 'stripe-api', label: 'Stripe API' },
    { id: 'webhooks', label: 'Webhooks' },
    { id: 'reconciliation', label: 'Reconciliation' },
    { id: 'resend', label: 'Resend' },
    { id: 'outbox', label: 'Outbox' },
  ];

export const MASTER_BILLING_AUDIT_TABS: Array<{ id: MasterBillingAuditTab; label: string }> = [
  { id: 'contracts', label: 'Verträge' },
  { id: 'pricing', label: 'Preise' },
  { id: 'payments', label: 'Zahlungen' },
  { id: 'system', label: 'System' },
];

const SECTION_IDS = new Set(MASTER_BILLING_SECTIONS.map((section) => section.id));

export function parseMasterBillingSection(value: string | null | undefined): MasterBillingSection {
  if (value && SECTION_IDS.has(value as MasterBillingSection)) {
    return value as MasterBillingSection;
  }
  return 'overview';
}

export function parseMasterBillingSubTab<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  if (value && allowed.includes(value as T)) {
    return value as T;
  }
  return fallback;
}

export interface MasterBillingLocationState {
  section: MasterBillingSection;
  subTab: string | null;
  orgId: string | null;
}

export function readMasterBillingLocation(search = ''): MasterBillingLocationState {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return {
    section: parseMasterBillingSection(params.get(MASTER_BILLING_SECTION_PARAM)),
    subTab: params.get(MASTER_BILLING_SUB_TAB_PARAM),
    orgId: params.get(MASTER_BILLING_ORG_PARAM),
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

  if (input.orgId === null) {
    params.delete(MASTER_BILLING_ORG_PARAM);
  } else if (input.orgId) {
    params.set(MASTER_BILLING_ORG_PARAM, input.orgId);
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

export function defaultSubTabForSection(section: MasterBillingSection): string | null {
  switch (section) {
    case 'invoices-payments':
      return 'invoices';
    case 'system-sync':
      return 'stripe-api';
    case 'audit':
      return 'contracts';
    default:
      return null;
  }
}

export function sectionNeedsCoreData(section: MasterBillingSection): boolean {
  return section === 'overview' || section === 'organizations' || section === 'invoices-payments';
}
