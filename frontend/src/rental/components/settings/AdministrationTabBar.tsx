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
      className="sq-tab-bar p-1 flex items-center w-full"
      role="tablist"
      aria-label={t('nav.administration')}
    >
      <div className="flex flex-nowrap gap-0.5 flex-1 min-w-0 overflow-x-auto scrollbar-thin [scrollbar-width:thin]">
        {ADMINISTRATION_TAB_ORDER.map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabChange(tab)}
              className={`min-w-0 shrink-0 px-3.5 py-1.5 rounded-[calc(var(--radius-md)-2px)] text-[11px] leading-[16.2px] font-semibold tracking-[-0.003em] whitespace-nowrap transition-all duration-200 ${
                isActive
                  ? 'bg-card text-foreground shadow-[var(--shadow-1)]'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/60'
              }`}
            >
              <span className="truncate">{t(TAB_LABEL_KEYS[tab])}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
