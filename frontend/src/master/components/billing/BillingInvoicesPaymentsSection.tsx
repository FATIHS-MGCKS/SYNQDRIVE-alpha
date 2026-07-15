import type { AdminOrgBillingRowDto } from '../../types/admin-billing.types';
import { EmptyState } from '../../../components/patterns/states';
import { BillingInvoicesTab } from './BillingInvoicesTab';
import { BillingPaymentMethodsTab } from './BillingPaymentMethodsTab';
import { MasterBillingSubTabBar } from './MasterBillingSubTabBar';
import {
  MASTER_BILLING_INVOICES_PAYMENTS_TABS,
  parseMasterBillingSubTab,
  type MasterBillingInvoicesPaymentsTab,
} from './master-billing-navigation';

interface BillingInvoicesPaymentsSectionProps {
  organizations: AdminOrgBillingRowDto[];
  activeSubTab: string | null;
  onSubTabChange: (tab: MasterBillingInvoicesPaymentsTab) => void;
}

const PLACEHOLDER_COPY: Record<
  Exclude<MasterBillingInvoicesPaymentsTab, 'invoices' | 'payment-methods'>,
  { title: string; description: string }
> = {
  'payment-attempts': {
    title: 'Zahlungsversuche',
    description:
      'Übersicht über fehlgeschlagene und wiederholte Zahlungsversuche folgt in einem späteren Schritt.',
  },
  refunds: {
    title: 'Refunds',
    description: 'Rückerstattungen und Teilrefunds werden hier master-seitig nachverfolgt.',
  },
  'credit-notes': {
    title: 'Credit Notes',
    description: 'Gutschriften und Korrekturrechnungen werden in diesem Bereich gebündelt.',
  },
};

export function BillingInvoicesPaymentsSection({
  organizations,
  activeSubTab,
  onSubTabChange,
}: BillingInvoicesPaymentsSectionProps) {
  const subTab = parseMasterBillingSubTab(
    activeSubTab,
    MASTER_BILLING_INVOICES_PAYMENTS_TABS.map((tab) => tab.id),
    'invoices',
  );

  return (
    <div className="space-y-4" data-testid="master-billing-invoices-payments-section">
      <div>
        <h2 className="text-[15px] font-semibold text-foreground">Rechnungen & Zahlungen</h2>
        <p className="text-[12px] text-muted-foreground mt-1 max-w-3xl">
          Rechnungen, Zahlungsmethoden, Versuche, Refunds und Credit Notes für alle Organisationen.
        </p>
      </div>

      <MasterBillingSubTabBar
        tabs={MASTER_BILLING_INVOICES_PAYMENTS_TABS}
        activeTab={subTab}
        onTabChange={onSubTabChange}
        ariaLabel="Rechnungen und Zahlungen Unterbereiche"
        testIdPrefix="master-billing-invoices-payments"
      />

      {subTab === 'invoices' ? <BillingInvoicesTab /> : null}
      {subTab === 'payment-methods' ? (
        <BillingPaymentMethodsTab organizations={organizations} />
      ) : null}
      {subTab !== 'invoices' && subTab !== 'payment-methods' ? (
        <EmptyState
          compact
          title={PLACEHOLDER_COPY[subTab].title}
          description={PLACEHOLDER_COPY[subTab].description}
        />
      ) : null}
    </div>
  );
}
