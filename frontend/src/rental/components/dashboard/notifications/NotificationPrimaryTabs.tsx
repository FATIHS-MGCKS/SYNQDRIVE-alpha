import { cn } from '../../../../components/ui/utils';
import { NOTIFICATION_PANEL_TYPO } from './notificationPanelTypography';
import {
  NOTIFICATION_PRIMARY_TABS,
  type NotificationPrimaryTab,
} from './notificationPanelTypes';
import type { useLanguage } from '../../../i18n/LanguageContext';

const TAB_LABEL_KEYS: Record<NotificationPrimaryTab, string> = {
  all: 'notification.tab.all',
  critical: 'notification.tab.critical',
  warning: 'notification.tab.warning',
  resolved: 'notification.tab.resolved',
};

function tabBadgeClass(tab: NotificationPrimaryTab, count: number): string {
  if (count <= 0) return 'bg-muted/50 text-muted-foreground';
  if (tab === 'critical') {
    return 'bg-[color:color-mix(in_srgb,var(--status-critical)_14%,transparent)] text-[color:var(--status-critical)]';
  }
  if (tab === 'warning') {
    return 'bg-[color:color-mix(in_srgb,var(--status-watch)_14%,transparent)] text-[color:var(--status-watch)]';
  }
  if (tab === 'resolved') {
    return 'bg-[color:color-mix(in_srgb,var(--status-success)_12%,transparent)] text-[color:var(--status-success)]';
  }
  return 'bg-[color:color-mix(in_srgb,var(--brand)_10%,transparent)] text-[color:var(--brand)]';
}

export function NotificationPrimaryTabs({
  activeTab,
  counts,
  t,
  onSelect,
}: {
  activeTab: NotificationPrimaryTab;
  counts: Record<NotificationPrimaryTab, number>;
  t: ReturnType<typeof useLanguage>['t'];
  onSelect: (tab: NotificationPrimaryTab) => void;
}) {
  return (
    <div
      className="sq-tab-bar flex w-full items-center p-1"
      role="tablist"
      aria-label={t('notification.tab.all')}
    >
      <div className="flex min-w-0 flex-1 flex-nowrap gap-1 overflow-x-auto scrollbar-thin [scrollbar-width:thin] [-webkit-overflow-scrolling:touch]">
        {NOTIFICATION_PRIMARY_TABS.map((tab) => {
          const isActive = activeTab === tab;
          const count = counts[tab] ?? 0;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelect(tab)}
              className={cn(
                'inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[calc(var(--radius-md)-2px)] px-3 py-2 transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                NOTIFICATION_PANEL_TYPO.tab,
                isActive
                  ? 'surface-premium text-foreground shadow-[var(--shadow-1)]'
                  : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
              )}
            >
              <span>{t(TAB_LABEL_KEYS[tab] as never)}</span>
              <span
                className={cn(NOTIFICATION_PANEL_TYPO.tabBadge, tabBadgeClass(tab, count))}
                aria-label={`${count}`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
