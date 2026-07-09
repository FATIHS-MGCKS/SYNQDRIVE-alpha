import {
  chromeTabBarClass,
  chromeTabTriggerClass,
  CHROME_TAB_BAR_SCROLL_CLASS,
} from '../../../components/patterns/chrome-tab-bar';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import { ADMINISTRATION_TAB_ORDER, type SettingsTab } from './settingsTypes';

const TAB_LABEL_KEYS: Record<SettingsTab, TranslationKey> = {
  company: 'adminTab.company',
  account: 'adminTab.account',
  users: 'adminTab.users',
  billing: 'adminTab.billing',
  'data-authorization': 'adminTab.dataAuthorization',
  'legal-documents': 'adminTab.legalDocuments',
  'rental-rules': 'adminTab.rentalRules',
};

interface AdministrationTabBarProps {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}

export function AdministrationTabBar({ activeTab, onTabChange }: AdministrationTabBarProps) {
  const { t } = useLanguage();

  return (
    <div
      className={chromeTabBarClass('p-1')}
      role="tablist"
      aria-label={t('nav.administration')}
    >
      <div className={CHROME_TAB_BAR_SCROLL_CLASS}>
        {ADMINISTRATION_TAB_ORDER.map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabChange(tab)}
              className={chromeTabTriggerClass(isActive)}
            >
              <span className="truncate">{t(TAB_LABEL_KEYS[tab])}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
