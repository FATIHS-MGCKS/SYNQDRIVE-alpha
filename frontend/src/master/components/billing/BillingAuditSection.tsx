import { useMemo } from 'react';
import type { AdminBillingAuditLogDto } from '../../types/admin-billing.types';
import { BillingAuditLogTab } from './BillingAuditLogTab';
import { MasterBillingSubTabBar } from './MasterBillingSubTabBar';
import {
  MASTER_BILLING_AUDIT_TABS,
  parseMasterBillingSubTab,
  type MasterBillingAuditTab,
} from './master-billing-navigation';

interface BillingAuditSectionProps {
  activeSubTab: string | null;
  onSubTabChange: (tab: MasterBillingAuditTab) => void;
}

const AUDIT_ENTITY_FILTERS: Record<MasterBillingAuditTab, string[] | null> = {
  contracts: ['BillingSubscription', 'BillingSubscriptionItem'],
  pricing: ['BillingPriceBook', 'BillingPriceVersion', 'BillingPriceTier'],
  payments: ['BillingPayment', 'BillingInvoice', 'BillingPaymentMethod'],
  system: null,
};

function matchesAuditTab(log: AdminBillingAuditLogDto, tab: MasterBillingAuditTab): boolean {
  const entities = AUDIT_ENTITY_FILTERS[tab];
  if (!entities) return true;
  return entities.some((entity) => log.entityType.includes(entity));
}

interface BillingAuditSectionBodyProps {
  activeSubTab: MasterBillingAuditTab;
}

function BillingAuditSectionBody({ activeSubTab }: BillingAuditSectionBodyProps) {
  const description = useMemo(() => {
    switch (activeSubTab) {
      case 'contracts':
        return 'Vertrags- und Aboänderungen über alle Organisationen.';
      case 'pricing':
        return 'Preisbuch-, Versions- und Staffeländerungen.';
      case 'payments':
        return 'Zahlungs-, Rechnungs- und Zahlungsmethodenänderungen.';
      case 'system':
        return 'Systemweite Billing-Änderungen und technische Eingriffe.';
      default:
        return '';
    }
  }, [activeSubTab]);

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-muted-foreground">{description}</p>
      <BillingAuditLogTab filterPredicate={(log) => matchesAuditTab(log, activeSubTab)} />
    </div>
  );
}

export function BillingAuditSection({ activeSubTab, onSubTabChange }: BillingAuditSectionProps) {
  const subTab = parseMasterBillingSubTab(
    activeSubTab,
    MASTER_BILLING_AUDIT_TABS.map((tab) => tab.id),
    'contracts',
  );

  return (
    <div className="space-y-4" data-testid="master-billing-audit-section">
      <div>
        <h2 className="text-[15px] font-semibold text-foreground">Audit</h2>
        <p className="text-[12px] text-muted-foreground mt-1 max-w-3xl">
          Vertrags-, Preis-, Zahlungs- und Systemänderungen im Master-Bereich nachvollziehen.
        </p>
      </div>

      <MasterBillingSubTabBar
        tabs={MASTER_BILLING_AUDIT_TABS}
        activeTab={subTab}
        onTabChange={onSubTabChange}
        ariaLabel="Audit Unterbereiche"
        testIdPrefix="master-billing-audit"
      />

      <BillingAuditSectionBody activeSubTab={subTab} />
    </div>
  );
}
