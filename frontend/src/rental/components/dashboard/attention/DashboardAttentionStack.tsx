import { useMemo } from 'react';
import { cn } from '../../../../components/ui/utils';
import type { DashboardViewModel } from '../dashboardTypes';
import type { TranslationKey } from '../../../i18n/translations/en';
import type { Locale } from '../../../i18n/LanguageContext';
import { FleetReadinessAttentionPanel } from './FleetReadinessAttentionPanel';
import { OperationsAttentionPanel, type DashboardAttentionLayout } from './OperationsAttentionPanel';
import type { AttentionScopedListHandlers } from './AttentionScopedList';

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
  const isSidebar = layout === 'sidebar';
  const referenceNowMs = useMemo(
    () => Date.now(),
    [
      vm.dashboardAttention?.operations.items,
      vm.dashboardAttention?.fleetReadiness.items,
      vm.isRefreshing,
    ],
  );

  if (!vm.dashboardAttention?.splitActive) return null;

  return (
    <div
      className={cn(
        'flex w-full min-w-0 flex-col gap-3',
        isSidebar && 'h-full max-h-full min-h-0 overflow-hidden',
      )}
      aria-label={t('dashboardAttention.stackLabel')}
    >
      <OperationsAttentionPanel
        vm={vm}
        handlers={handlers}
        t={t}
        locale={locale}
        layout={layout}
        referenceNowMs={referenceNowMs}
      />
      <FleetReadinessAttentionPanel
        vm={vm}
        handlers={handlers}
        t={t}
        locale={locale}
        layout={layout}
        referenceNowMs={referenceNowMs}
      />
    </div>
  );
}
