import { useMemo } from 'react';
import { cn } from '../../../../components/ui/utils';
import { SkeletonRows } from '../../../../components/patterns';
import { panelShellClass } from '../dashboardShell';
import type { DashboardViewModel } from '../dashboardTypes';
import type { TranslationKey } from '../../../i18n/translations/en';
import type { Locale } from '../../../i18n/LanguageContext';
import { NOTIFICATION_PANEL_TYPO } from '../notifications/notificationPanelTypography';
import { AttentionScopedList, type AttentionScopedListHandlers } from './AttentionScopedList';
import type { DashboardAttentionLayout } from './OperationsAttentionPanel';

interface FleetReadinessAttentionPanelProps {
  vm: DashboardViewModel;
  handlers: AttentionScopedListHandlers;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  locale: Locale;
  layout?: DashboardAttentionLayout;
  referenceNowMs: number;
}

function FleetSummaryHeader({
  vm,
  t,
}: {
  vm: DashboardViewModel;
  t: FleetReadinessAttentionPanelProps['t'];
}) {
  const fleetSummary = vm.dashboardAttention?.fleetSummary;
  const summary = fleetSummary?.summary;

  if (fleetSummary?.loading) {
    return (
      <div className="mt-2 px-0.5" aria-busy>
        <SkeletonRows rows={1} />
      </div>
    );
  }

  if (fleetSummary?.error || !summary) {
    return (
      <p className="mt-2 text-[12px] text-muted-foreground">
        {t('dashboardAttention.fleetSummary.unavailable')}
      </p>
    );
  }

  const readyPercentLabel =
    summary.readyPercent != null
      ? t('dashboardAttention.fleetSummary.readyPercent', { percent: summary.readyPercent })
      : null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
      <span className="tabular-nums">
        {t('dashboardAttention.fleetSummary.ready', {
          ready: summary.ready,
          total: summary.total,
        })}
      </span>
      {readyPercentLabel ? (
        <span className="tabular-nums font-medium text-foreground">{readyPercentLabel}</span>
      ) : null}
      {summary.notReady > 0 ? (
        <span className="tabular-nums">
          {t('dashboardAttention.fleetSummary.notReady', { count: summary.notReady })}
        </span>
      ) : null}
      {summary.unevaluable > 0 ? (
        <span className="tabular-nums">
          {t('dashboardAttention.fleetSummary.unevaluable', { count: summary.unevaluable })}
        </span>
      ) : null}
      {summary.unknown > 0 ? (
        <span className="tabular-nums">
          {t('dashboardAttention.fleetSummary.unknown', { count: summary.unknown })}
        </span>
      ) : null}
    </div>
  );
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
