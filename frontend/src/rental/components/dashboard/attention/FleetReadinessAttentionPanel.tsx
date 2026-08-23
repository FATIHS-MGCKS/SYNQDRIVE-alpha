import { useMemo } from 'react';
import { cn } from '../../../../components/ui/utils';
import { panelShellClass } from '../dashboardShell';
import type { DashboardViewModel } from '../dashboardTypes';
import type { TranslationKey } from '../../../i18n/translations/en';
import type { Locale } from '../../../i18n/LanguageContext';
import { NOTIFICATION_PANEL_TYPO } from '../notifications/notificationPanelTypography';
import { AttentionScopedList, type AttentionScopedListHandlers } from './AttentionScopedList';
import { FleetSummaryHeader } from './FleetSummaryHeader';
import type { DashboardAttentionLayout } from './DashboardAttentionStack';

interface FleetReadinessAttentionPanelProps {
  vm: DashboardViewModel;
  handlers: AttentionScopedListHandlers;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  locale: Locale;
  layout?: DashboardAttentionLayout;
  referenceNowMs: number;
}

export function FleetReadinessAttentionPanel({
  vm,
  handlers,
  t,
  locale,
  layout = 'default',
  referenceNowMs,
}: FleetReadinessAttentionPanelProps) {
  const attention = vm.dashboardAttention;
  const fleetReadiness = attention?.fleetReadiness;
  const isSidebar = layout === 'sidebar';

  const itemsById = useMemo(() => {
    const map = new Map<string, import('../dashboardTypes').ActionQueueItem>();
    for (const item of fleetReadiness?.items ?? []) map.set(item.id, item);
    return map;
  }, [fleetReadiness?.items]);

  if (!fleetReadiness) return null;

  return (
    <section
      className={cn(
        panelShellClass('tertiary'),
        'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
        isSidebar && 'max-lg:max-h-[min(240px,30vh)]',
      )}
      aria-label={t('dashboardAttention.fleetReadiness.title')}
    >
      <div className="shrink-0 border-b border-border/35 px-3.5 py-2.5">
        <h2 className={NOTIFICATION_PANEL_TYPO.boxTitle}>{t('dashboardAttention.fleetReadiness.title')}</h2>
        <p className={cn(NOTIFICATION_PANEL_TYPO.meta, 'mt-0.5 text-muted-foreground')}>
          {t('dashboardAttention.fleetReadiness.subtitle')}
        </p>
        <FleetSummaryHeader vm={vm} t={t} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <AttentionScopedList
          entries={fleetReadiness.entries}
          itemsById={itemsById}
          loading={fleetReadiness.loading}
          error={!!fleetReadiness.error}
          errorCode={fleetReadiness.errorCode}
          emptyVariant="none-active"
          vm={vm}
          handlers={handlers}
          mutations={fleetReadiness.mutations}
          t={t}
          locale={locale}
          referenceNowMs={referenceNowMs}
          onLoadMore={fleetReadiness.mutations.loadMore}
          hasMore={fleetReadiness.mutations.hasMore}
        />
      </div>
    </section>
  );
}
