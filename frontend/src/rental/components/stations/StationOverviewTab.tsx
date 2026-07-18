import { useMemo, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  CalendarClock,
  Car,
  Clock,
  MapPin,
  Settings2,
  Wrench,
} from 'lucide-react';
import type { Station, StationSummaryReadModel } from '../../../lib/api';
import {
  MetricCard,
  StatusChip,
  EmptyState,
} from '../../../components/patterns';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import type { StationDetailTab } from './station-detail-navigation';
import {
  buildStationOverviewDecisionModel,
  type StationOverviewDecisionModel,
  type StationOverviewMetricValue,
} from '../../lib/station-overview-decision.utils';
import { cn } from '../../../components/ui/utils';

interface StationOverviewTabProps {
  station: Station;
  summary: StationSummaryReadModel | null;
  summaryLoading?: boolean;
  onNavigateTab: (tab: StationDetailTab) => void;
}

export function StationOverviewTab({
  station: _station,
  summary,
  summaryLoading = false,
  onNavigateTab,
}: StationOverviewTabProps) {
  const { t, locale } = useLanguage();
  const model = useMemo(
    () => buildStationOverviewDecisionModel(summary, { locale }),
    [summary, locale],
  );

  if (summaryLoading && !model) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <MetricCard key={index} label="…" value="—" loading />
        ))}
      </div>
    );
  }

  if (!model) {
    return (
      <EmptyState
        icon={<MapPin className="w-8 h-8" />}
        title={t('stations.detail.overviewEmptyTitle')}
        description={t('stations.detail.overviewEmptyDescription')}
      />
    );
  }

  const openingLabel =
    model.openingStatusLabel ??
    (model.openingStatus
      ? t(`stations.openingStatus.${model.openingStatus}` as const)
      : t('stations.openingStatus.UNKNOWN'));
  const capacityLabel = model.capacityKnown && model.capacityStatus
    ? t(`stations.capacityStatus.${model.capacityStatus}` as const)
    : t('stations.card.capacityUnknown');

  return (
    <div className="space-y-4 animate-fade-up">
      {model.partialDataIncomplete ? (
        <div className="rounded-xl border border-[color:var(--status-watch)]/35 bg-[color:var(--status-watch)]/[0.04] px-4 py-3 text-sm text-muted-foreground">
          {t('stations.detail.overviewPartialData')}
        </div>
      ) : null}

      <section className="surface-premium p-4 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{t('stations.detail.overviewOpeningTitle')}</h3>
            <div className="flex flex-wrap gap-2">
              <StatusChip tone={model.openingTone}>
                <Clock className="mr-0.5 inline h-3 w-3" />
                {openingLabel}
              </StatusChip>
              <StatusChip tone={model.capacityTone}>{capacityLabel}</StatusChip>
            </div>
            {model.nextOpeningWindowLabel ? (
              <p className="text-xs text-muted-foreground">
                {t('stations.detail.overviewNextWindow')}: {model.nextOpeningWindowLabel}
              </p>
            ) : model.openingStatus === 'OPEN' ? (
              <p className="text-xs text-muted-foreground">{t('stations.detail.overviewCurrentlyOpen')}</p>
            ) : (
              <p className="text-xs text-muted-foreground">{t('stations.detail.overviewNoNextWindow')}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('operations')}
            className="text-xs font-semibold text-[color:var(--brand)] hover:underline shrink-0"
          >
            {t('stations.detail.overviewOpenOperations')}
          </button>
        </div>
      </section>

      <section className="space-y-2">
        <SectionHeading title={t('stations.detail.overviewOnSiteTitle')} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <OverviewMetric
            label={t('stations.detail.overviewOnSite')}
            metric={model.onSite}
            icon={<MapPin className="w-4 h-4" />}
            onClick={() => onNavigateTab('fleet')}
            t={t}
          />
          <OverviewMetric
            label={t('stations.detail.overviewReadyForRent')}
            metric={model.readyForRent}
            icon={<Car className="w-4 h-4" />}
            status={metricToneForCount(model.readyForRent, 'success')}
            onClick={() => onNavigateTab('fleet')}
            t={t}
          />
          <OverviewMetric
            label={t('stations.detail.overviewBlockedMaintenance')}
            metric={model.blockedOrMaintenance}
            icon={<Wrench className="w-4 h-4" />}
            status={metricToneForCount(model.blockedOrMaintenance, 'watch', true)}
            onClick={() => onNavigateTab('fleet')}
            t={t}
          />
        </div>
      </section>

      <section className="space-y-2">
        <SectionHeading
          title={t('stations.detail.overviewTodayTitle')}
          actionLabel={t('stations.detail.openSchedule')}
          onAction={() => onNavigateTab('schedule')}
        />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <OverviewMetric
            label={t('stations.card.pickups')}
            metric={model.pickupsToday}
            icon={<CalendarClock className="w-4 h-4" />}
            onClick={() => onNavigateTab('schedule')}
            t={t}
          />
          <OverviewMetric
            label={t('stations.card.returns')}
            metric={model.returnsToday}
            icon={<CalendarClock className="w-4 h-4" />}
            onClick={() => onNavigateTab('schedule')}
            t={t}
          />
          <OverviewMetric
            label={t('stations.detail.overviewOverdueReturns')}
            metric={model.overdueReturns}
            icon={<AlertTriangle className="w-4 h-4" />}
            status={metricToneForCount(model.overdueReturns, 'critical', true)}
            onClick={() => onNavigateTab('schedule')}
            t={t}
          />
          <OverviewMetric
            label={t('stations.detail.overviewExpectedTransfers')}
            metric={model.expectedTransfers}
            icon={<ArrowRightLeft className="w-4 h-4" />}
            onClick={() => onNavigateTab('schedule')}
            t={t}
          />
        </div>
        {model.operationsQuiet ? (
          <p className="text-xs text-muted-foreground px-1">{t('stations.detail.overviewTodayQuiet')}</p>
        ) : null}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ProblemPanel
          title={t('stations.detail.overviewConfigurationProblems')}
          emptyTitle={t('stations.detail.overviewConfigurationClear')}
          emptyDescription={t('stations.detail.overviewConfigurationClearHint')}
          problems={model.configurationProblems}
          icon={<Settings2 className="w-4 h-4" />}
          onOpen={() => onNavigateTab('operations')}
          openLabel={t('stations.detail.overviewOpenOperations')}
          t={t}
        />
        <ProblemPanel
          title={t('stations.detail.overviewOperationalProblems')}
          emptyTitle={t('stations.detail.overviewOperationalClear')}
          emptyDescription={t('stations.detail.overviewOperationalClearHint')}
          problems={model.operationalWarnings}
          vehicleSignals={model.vehicleSignals}
          icon={<AlertTriangle className="w-4 h-4" />}
          onOpen={() => onNavigateTab('fleet')}
          openLabel={t('stations.detail.overviewOpenFleet')}
          t={t}
        />
      </section>
    </div>
  );
}

function SectionHeading({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-0.5">
      <h3 className="text-sm font-semibold">{title}</h3>
      {actionLabel && onAction ? (
        <button type="button" onClick={onAction} className="text-xs font-semibold text-[color:var(--brand)] hover:underline">
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function OverviewMetric({
  label,
  metric,
  icon,
  status,
  onClick,
  t,
}: {
  label: string;
  metric: StationOverviewMetricValue;
  icon: ReactNode;
  status?: 'success' | 'watch' | 'critical';
  onClick?: () => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}) {
  const interactive = metric.known && onClick != null;
  return (
    <MetricCard
      label={label}
      value={metric.display}
      icon={icon}
      status={status}
      onClick={interactive ? onClick : undefined}
      hint={!metric.known ? t('stations.detail.overviewMetricUnknown') : undefined}
      className={cn(!metric.known && 'opacity-90')}
    />
  );
}

function ProblemPanel({
  title,
  emptyTitle,
  emptyDescription,
  problems,
  vehicleSignals = [],
  icon,
  onOpen,
  openLabel,
  t,
}: {
  title: string;
  emptyTitle: string;
  emptyDescription: string;
  problems: StationOverviewDecisionModel['configurationProblems'];
  vehicleSignals?: StationOverviewDecisionModel['vehicleSignals'];
  icon: ReactNode;
  onOpen: () => void;
  openLabel: string;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}) {
  const hasProblems = problems.length > 0 || vehicleSignals.length > 0;

  return (
    <div className="surface-premium p-4 space-y-3 h-full">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold inline-flex items-center gap-2">
          {icon}
          {title}
        </h3>
        {hasProblems ? (
          <button type="button" onClick={onOpen} className="text-xs font-semibold text-[color:var(--brand)] hover:underline">
            {openLabel}
          </button>
        ) : null}
      </div>

      {!hasProblems ? (
        <EmptyState compact title={emptyTitle} description={emptyDescription} />
      ) : (
        <ul className="space-y-2">
          {problems.map((problem) => (
            <li key={problem.code} className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
              <StatusChip tone={problemSeverityTone(problem.severity)} className="mb-1">
                {humanizeProblemCode(problem.code)}
              </StatusChip>
              <p className="text-xs text-muted-foreground mt-1">{problem.message}</p>
            </li>
          ))}
          {vehicleSignals.map((signal) => (
            <li key={signal.id} className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
              <StatusChip tone={signal.tone}>
                {t(`stations.detail.overviewVehicleSignal.${signal.message}` as TranslationKey, {
                  count: signal.count,
                })}
              </StatusChip>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function humanizeProblemCode(code: string): string {
  return code.replace(/^STATION_/, '').replaceAll('_', ' ');
}

function problemSeverityTone(severity: 'info' | 'warning' | 'error'): 'critical' | 'watch' | 'neutral' {
  if (severity === 'error') return 'critical';
  if (severity === 'warning') return 'watch';
  return 'neutral';
}

function metricToneForCount(
  metric: StationOverviewMetricValue,
  positiveTone: 'success' | 'watch' | 'critical',
  onlyWhenPositive = false,
): 'success' | 'watch' | 'critical' | undefined {
  if (!metric.known || metric.numeric == null) return undefined;
  if (metric.numeric <= 0) return onlyWhenPositive ? undefined : undefined;
  return positiveTone;
}
