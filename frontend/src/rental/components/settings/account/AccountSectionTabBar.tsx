import {
  chromeTabBarClass,
  chromeTabTriggerClass,
  CHROME_TAB_BAR_SCROLL_CLASS,
} from '../../../../components/patterns/chrome-tab-bar';
import type { AccountSection } from './account-utils';

const SECTIONS: Array<{ id: AccountSection; label: string }> = [
  { id: 'profile', label: 'Profil' },
  { id: 'preferences', label: 'Arbeitspräferenzen' },
  { id: 'notifications', label: 'Benachrichtigungen' },
  { id: 'security', label: 'Sicherheit & Sitzungen' },
];

interface AccountSectionTabBarProps {
  activeSection: AccountSection;
  onSectionChange: (section: AccountSection) => void;
}

export function AccountSectionTabBar({
  activeSection,
  onSectionChange,
}: AccountSectionTabBarProps) {
  return (
    <div
      className={chromeTabBarClass('p-1')}
      role="tablist"
      aria-label="Kontobereiche"
    >
      <div className={CHROME_TAB_BAR_SCROLL_CLASS}>
        {SECTIONS.map((section) => {
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
