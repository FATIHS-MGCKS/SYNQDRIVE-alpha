import { useMemo } from 'react';
import { cn } from '../../../../components/ui/utils';
import { panelShellClass } from '../dashboardShell';
import type { DashboardViewModel } from '../dashboardTypes';
import type { TranslationKey } from '../../../i18n/translations/en';
import type { Locale } from '../../../i18n/LanguageContext';
import { NOTIFICATION_PANEL_TYPO } from '../notifications/notificationPanelTypography';
import { AttentionScopedList, type AttentionScopedListHandlers } from './AttentionScopedList';
import type { DashboardAttentionLayout } from './DashboardAttentionStack';

interface OperationsAttentionPanelProps {
  vm: DashboardViewModel;
  handlers: AttentionScopedListHandlers;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  locale: Locale;
  layout?: DashboardAttentionLayout;
  referenceNowMs: number;
}

export function OperationsAttentionPanel({
  vm,
  handlers,
  t,
  locale,
  layout = 'default',
  referenceNowMs,
}: OperationsAttentionPanelProps) {
  const attention = vm.dashboardAttention;
  const operations = attention?.operations;
  const isSidebar = layout === 'sidebar';

  const itemsById = useMemo(() => {
    const map = new Map<string, import('../dashboardTypes').ActionQueueItem>();
    for (const item of operations?.items ?? []) map.set(item.id, item);
    return map;
  }, [operations?.items]);

  if (!operations) return null;

  return (
    <section
      className={cn(
        panelShellClass('tertiary'),
        'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
        isSidebar && 'max-lg:max-h-[min(240px,30vh)]',
      )}
      aria-label={t('dashboardAttention.operations.title')}
    >
      <div className="shrink-0 border-b border-border/35 px-3.5 py-2.5">
        <h2 className={NOTIFICATION_PANEL_TYPO.boxTitle}>{t('dashboardAttention.operations.title')}</h2>
        <p className={cn(NOTIFICATION_PANEL_TYPO.meta, 'mt-0.5 text-muted-foreground')}>
          {t('dashboardAttention.operations.subtitle')}
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <AttentionScopedList
          entries={operations.entries}
          itemsById={itemsById}
          loading={operations.loading}
          error={!!operations.error}
          errorCode={operations.errorCode}
          emptyVariant="none-active"
          vm={vm}
          handlers={handlers}
          mutations={operations.mutations}
          t={t}
          locale={locale}
          referenceNowMs={referenceNowMs}
          onLoadMore={operations.mutations.loadMore}
          hasMore={operations.mutations.hasMore}
        />
      </div>
    </section>
  );
}
