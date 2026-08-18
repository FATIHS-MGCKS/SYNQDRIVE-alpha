import type { MasterBillingSection } from './master-billing-navigation';
import { MASTER_BILLING_SECTIONS } from './master-billing-navigation';
import { MasterPageTabs } from '../../shell';

interface MasterBillingSectionTabBarProps {
  activeSection: MasterBillingSection;
  onSectionChange: (section: MasterBillingSection) => void;
}

export function MasterBillingSectionTabBar({
  activeSection,
  onSectionChange,
}: MasterBillingSectionTabBarProps) {
  return (
    <MasterPageTabs
      tabs={MASTER_BILLING_SECTIONS.map((section) => ({
        id: section.id,
        label: section.label,
      }))}
      activeId={activeSection}
      onChange={onSectionChange}
      ariaLabel="Master-Abrechnung Bereiche"
      testIdPrefix="master-billing-section"
    />
  );
}
