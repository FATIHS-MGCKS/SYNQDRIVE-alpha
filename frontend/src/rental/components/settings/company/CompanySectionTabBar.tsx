import {
  chromeTabBarClass,
  chromeTabTriggerClass,
  CHROME_TAB_BAR_SCROLL_CLASS,
} from '../../../../components/patterns/chrome-tab-bar';
import { COMPANY_SECTIONS, type CompanySection } from './company-utils';

interface CompanySectionTabBarProps {
  activeSection: CompanySection;
  onSectionChange: (section: CompanySection) => void;
}

export function CompanySectionTabBar({
  activeSection,
  onSectionChange,
}: CompanySectionTabBarProps) {
  return (
    <div
      className={chromeTabBarClass('p-1')}
      role="tablist"
      aria-label="Unternehmensbereiche"
    >
      <div className={CHROME_TAB_BAR_SCROLL_CLASS}>
        {COMPANY_SECTIONS.map((section) => {
          const isActive = activeSection === section.id;
          return (
            <button
              key={section.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSectionChange(section.id)}
              className={chromeTabTriggerClass(isActive)}
            >
              <span className="truncate">{section.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
