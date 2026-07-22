import { cn } from '../../../components/ui/utils';
import {
  chromeTabBarClass,
  chromeTabTriggerClass,
  CHROME_TAB_BAR_SCROLL_CLASS,
} from '../../../components/patterns/chrome-tab-bar';
import { useRovingTablist } from '../../../hooks/useRovingTablist';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import {
  ADMIN_TAB_ID,
  ADMIN_TAB_PANEL_ID,
  ADMINISTRATION_TAB_ORDER,
} from './administration-a11y';
import type { SettingsTab } from './settingsTypes';

const TAB_LABEL_KEYS: Record<SettingsTab, TranslationKey> = {
  company: 'adminTab.company',
  account: 'adminTab.account',
  users: 'adminTab.users',
  billing: 'adminTab.billing',
  'data-authorization': 'adminTab.dataAuthorization',
  'legal-documents': 'adminTab.legalDocuments',
  'email-versand': 'adminTab.emailVersand',
  'rental-rules': 'adminTab.rentalRules',
};

interface AdministrationTabBarProps {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}

export function AdministrationTabBar({ activeTab, onTabChange }: AdministrationTabBarProps) {
  const { t } = useLanguage();

  const { getTabProps } = useRovingTablist({
    items: ADMINISTRATION_TAB_ORDER,
    activeId: activeTab,
    onActivate: onTabChange,
    getItemId: (tab) => ADMIN_TAB_ID[tab],
    getPanelId: (tab) => ADMIN_TAB_PANEL_ID[tab],
    orientation: 'horizontal',
  });

  return (
    <div
      className={chromeTabBarClass('p-1')}
      role="tablist"
      aria-label={t('nav.administration')}
      aria-orientation="horizontal"
    >
      <div className={CHROME_TAB_BAR_SCROLL_CLASS}>
        {ADMINISTRATION_TAB_ORDER.map((tab, index) => {
          const isActive = activeTab === tab;
          const tabProps = getTabProps(tab, index);
          const { ref, onKeyDown, onFocus, ...restTabProps } = tabProps;

          return (
            <button
              key={tab}
              type="button"
              {...restTabProps}
              ref={ref}
              onKeyDown={onKeyDown}
              onFocus={onFocus}
              className={cn(
                chromeTabTriggerClass(isActive),
                'min-h-11 focus-visible:ring-2 focus-visible:ring-[var(--brand-soft)] focus-visible:ring-offset-2 motion-reduce:transition-none',
              )}
            >
              <span className="truncate">{t(TAB_LABEL_KEYS[tab])}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
