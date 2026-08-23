import { SkeletonRows } from '../../../../components/patterns';
import type { DashboardViewModel } from '../dashboardTypes';
import type { TranslationKey } from '../../../i18n/translations/en';

export function FleetSummaryHeader({
  vm,
  t,
}: {
  vm: DashboardViewModel;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
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
