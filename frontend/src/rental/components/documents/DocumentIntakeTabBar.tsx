import type { DocumentIntakeTab } from '../../lib/document-intake-navigation';
import type { TranslationKey } from '../../i18n/translations/en';
import {
  chromeTabBarClass,
  chromeTabTriggerClass,
} from '../../../components/patterns/chrome-tab-bar';

interface DocumentIntakeTabBarProps {
  activeTab: DocumentIntakeTab;
  onTabChange: (tab: DocumentIntakeTab) => void;
  reviewCount?: number;
  t: (key: TranslationKey) => string;
}

const TABS: Array<{ id: DocumentIntakeTab; labelKey: TranslationKey }> = [
  { id: 'upload', labelKey: 'docUpload.tab.upload' },
  { id: 'review', labelKey: 'docUpload.tab.review' },
  { id: 'archive', labelKey: 'docUpload.tab.archive' },
];

export function DocumentIntakeTabBar({
  activeTab,
  onTabChange,
  reviewCount = 0,
  t,
}: DocumentIntakeTabBarProps) {
  return (
    <nav
      className={chromeTabBarClass('mb-3 w-full min-w-0')}
      aria-label={t('docUpload.tab.navLabel')}
    >
      <div className="flex w-full min-w-0 flex-nowrap gap-0.5 overflow-x-auto scrollbar-thin [scrollbar-width:thin]">
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onTabChange(tab.id)}
              className={chromeTabTriggerClass(active, 'inline-flex items-center gap-1.5')}
            >
              <span>{t(tab.labelKey)}</span>
              {tab.id === 'review' && reviewCount > 0 ? (
                <span className="rounded-full bg-brand px-1.5 py-0.5 text-[9px] font-bold text-brand-foreground">
                  {reviewCount > 99 ? '99+' : reviewCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
