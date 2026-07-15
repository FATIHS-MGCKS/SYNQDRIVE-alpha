import {
  chromeTabBarClass,
  chromeTabTriggerClass,
  CHROME_TAB_BAR_SCROLL_CLASS,
} from '../../../components/patterns/chrome-tab-bar';
import type { MasterBillingSection } from './master-billing-navigation';
import { MASTER_BILLING_SECTIONS } from './master-billing-navigation';

interface MasterBillingSectionTabBarProps {
  activeSection: MasterBillingSection;
  onSectionChange: (section: MasterBillingSection) => void;
}

export function MasterBillingSectionTabBar({
  activeSection,
  onSectionChange,
}: MasterBillingSectionTabBarProps) {
  return (
    <div
      className={chromeTabBarClass('p-1')}
      role="tablist"
      aria-label="Master-Abrechnung Bereiche"
      data-testid="master-billing-section-tabbar"
    >
      <div className={CHROME_TAB_BAR_SCROLL_CLASS}>
        {MASTER_BILLING_SECTIONS.map((section) => {
          const isActive = activeSection === section.id;
          return (
            <button
              key={section.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-testid={`master-billing-section-${section.id}`}
              onClick={() => onSectionChange(section.id)}
              className={chromeTabTriggerClass(isActive, 'max-sm:px-3')}
            >
              <span className="truncate">{section.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
