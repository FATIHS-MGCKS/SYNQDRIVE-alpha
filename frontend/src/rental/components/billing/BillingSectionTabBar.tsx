import {
  chromeTabBarClass,
  chromeTabTriggerClass,
  CHROME_TAB_BAR_SCROLL_CLASS,
} from '../../../components/patterns/chrome-tab-bar';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';

export type BillingSectionTab = 'subscription' | 'customer-payments';

const TAB_ORDER: BillingSectionTab[] = ['subscription', 'customer-payments'];

const TAB_LABEL_KEYS: Record<BillingSectionTab, TranslationKey> = {
  subscription: 'billing.section.subscription',
  'customer-payments': 'billing.section.customerPayments',
};

interface BillingSectionTabBarProps {
  activeTab: BillingSectionTab;
  onTabChange: (tab: BillingSectionTab) => void;
}

export function BillingSectionTabBar({ activeTab, onTabChange }: BillingSectionTabBarProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-muted-foreground leading-relaxed max-w-3xl">
        {t('billing.section.separationHint')}
      </p>
      <div
        className={chromeTabBarClass('p-1')}
        role="tablist"
        aria-label={t('billing.section.tablistAria')}
      >
        <div className={CHROME_TAB_BAR_SCROLL_CLASS}>
          {TAB_ORDER.map((tab) => {
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
    </div>
  );
}
