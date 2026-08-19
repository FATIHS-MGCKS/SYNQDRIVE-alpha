import {
  chromeTabBarClass,
  chromeTabTriggerClass,
  CHROME_TAB_BAR_SCROLL_CLASS,
} from '../../../../components/patterns/chrome-tab-bar';
import { useLanguage } from '../../../i18n/LanguageContext';
import { getAccountSections, type AccountSection } from './account-utils';

interface AccountSectionTabBarProps {
  activeSection: AccountSection;
  onSectionChange: (section: AccountSection) => void;
}

export function AccountSectionTabBar({
  activeSection,
  onSectionChange,
}: AccountSectionTabBarProps) {
  const { t, locale } = useLanguage();
  const sections = getAccountSections(locale);

  return (
    <div
      className={chromeTabBarClass('p-1')}
      role="tablist"
      aria-label={t('settings.account.sections.ariaLabel')}
    >
      <div className={CHROME_TAB_BAR_SCROLL_CLASS}>
        {sections.map((section) => {
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
