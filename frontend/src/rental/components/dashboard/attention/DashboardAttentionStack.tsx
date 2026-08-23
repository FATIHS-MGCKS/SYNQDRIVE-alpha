import { useMemo, useState } from 'react';
import { cn } from '../../../../components/ui/utils';
import { panelShellClass } from '../dashboardShell';
import type { DashboardViewModel } from '../dashboardTypes';
import type { TranslationKey } from '../../../i18n/translations/en';
import type { Locale } from '../../../i18n/LanguageContext';
import { NOTIFICATION_PANEL_TYPO } from '../notifications/notificationPanelTypography';
import { countAtomicActions } from '../actionQueueGrouping';
import { DashboardAttentionScopeTabs } from './DashboardAttentionScopeTabs';
import { FleetSummaryHeader } from './FleetSummaryHeader';
import { AttentionScopedList, type AttentionScopedListHandlers } from './AttentionScopedList';
import type { DashboardAttentionScope } from './dashboardAttentionScope';

export type DashboardAttentionLayout = 'default' | 'sidebar';

interface DashboardAttentionStackProps {
  vm: DashboardViewModel;
  handlers: AttentionScopedListHandlers;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  locale: Locale;
  layout?: DashboardAttentionLayout;
}

export function DashboardAttentionStack({
  vm,
  handlers,
  t,
  locale,
  layout = 'default',
}: DashboardAttentionStackProps) {
  const [activeScope, setActiveScope] = useState<DashboardAttentionScope>('operations');
  const isSidebar = layout === 'sidebar';
  const attention = vm.dashboardAttention;
  const referenceNowMs = useMemo(
    () => Date.now(),
    [
      attention?.operations.items,
      attention?.fleetReadiness.items,
      vm.isRefreshing,
    ],
  );

  if (!attention?.splitActive) return null;

  const operations = attention.operations;
  const fleetReadiness = attention.fleetReadiness;
  const operationsCount = countAtomicActions(operations.entries);
  const fleetCount = countAtomicActions(fleetReadiness.entries);
  const activeProjection = activeScope === 'operations' ? operations : fleetReadiness;

  const itemsById = useMemo(() => {
    const map = new Map<string, import('../dashboardTypes').ActionQueueItem>();
    for (const item of activeProjection.items) map.set(item.id, item);
    return map;
  }, [activeProjection.items]);

  return (
    <section
      data-testid="dashboard-attention-stack"
      className={cn(
        panelShellClass('tertiary'),
        'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
        isSidebar && 'max-lg:max-h-[min(480px,55vh)]',
        !isSidebar && 'max-lg:max-h-[min(480px,60vh)]',
      )}
      aria-label={t('notification.panelTitle')}
    >
      <div className="shrink-0 border-b border-border/35 px-3.5 py-2.5">
        <h2 className={NOTIFICATION_PANEL_TYPO.boxTitle}>{t('notification.panelTitle')}</h2>

        <div className="mt-2.5">
          <DashboardAttentionScopeTabs
            activeScope={activeScope}
            operationsCount={operationsCount}
            fleetCount={fleetCount}
            t={t}
            onChange={setActiveScope}
          />
        </div>

        {activeScope === 'operations' ? (
          <p className={cn(NOTIFICATION_PANEL_TYPO.meta, 'mt-2 text-muted-foreground')}>
            {t('dashboardAttention.operations.subtitle')}
          </p>
        ) : (
          <>
            <p className={cn(NOTIFICATION_PANEL_TYPO.meta, 'mt-2 text-muted-foreground')}>
              {t('dashboardAttention.fleetReadiness.subtitle')}
            </p>
            <FleetSummaryHeader vm={vm} t={t} />
          </>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <AttentionScopedList
          key={activeScope}
          entries={activeProjection.entries}
          itemsById={itemsById}
          loading={activeProjection.loading}
          error={!!activeProjection.error}
          errorCode={activeProjection.errorCode}
          emptyVariant="none-active"
          vm={vm}
          handlers={handlers}
          mutations={activeProjection.mutations}
          t={t}
          locale={locale}
          referenceNowMs={referenceNowMs}
          onLoadMore={activeProjection.mutations.loadMore}
          hasMore={activeProjection.mutations.hasMore}
        />
      </div>
    </section>
  );
}
