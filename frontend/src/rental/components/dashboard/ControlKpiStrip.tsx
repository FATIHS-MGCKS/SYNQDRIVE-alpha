import { Icon } from '../ui/Icon';
import { SkeletonMetricGrid } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import { resolveReadyForRentingKpiCounts, resolveTodaysOperationsKpiCounts } from './dashboardSliceAccess';
import {
  getKpiCardSurfaceClass,
  getKpiCardTone,
  getKpiIconTileClass,
  getKpiValueGradientClass,
  getKpiValueTone,
  getOperationalKpiVisualState,
  isReadySlice,
} from './dashboardKpiVisual';
import type { DashboardRuntimeModel, DashboardSlice, DashboardSliceId } from './runtime';
import type { DataFreshnessSummary } from './dashboardTypes';

interface ControlKpiStripProps {
  dashboardRuntime: DashboardRuntimeModel;
  activeSliceId?: DashboardSliceId | null;
  onSelectSlice: (sliceId: DashboardSliceId) => void;
  embedded?: boolean;
  locale?: string;
  dataFreshness?: DataFreshnessSummary;
}

/**
 * Visible KPI order in the dashboard strip. `due-soon` stays in runtime but is
 * not rendered here.
 */
const TOP_KPI_ORDER: DashboardSliceId[] = ['ready-to-rent', 'active-rented'];

const LOWER_KPI_ORDER: DashboardSliceId[] = [
  'overdue-returns',
  'blocked-maintenance',
  'overdue-pickups',
  'critical-alerts',
];

/** Visible strip order — 2×3 grid on desktop when parent is half-width. */
const VISIBLE_KPI_ORDER: DashboardSliceId[] = [...TOP_KPI_ORDER, ...LOWER_KPI_ORDER];

const KPI_ICONS: Record<DashboardSliceId, string> = {
  'ready-to-rent': 'check-circle',
  'active-rented': 'car',
  'due-soon': 'clock',
  'overdue-returns': 'alert-triangle',
  'overdue-pickups': 'alert-triangle',
  'blocked-maintenance': 'wrench',
  'critical-alerts': 'shield-alert',
};

function kpiStripGapClass(embedded: boolean): string {
  return embedded ? 'gap-3 sm:gap-3.5' : 'gap-1.5';
}

function kpiGridClass(embedded: boolean): string {
  return cn('grid grid-cols-2 items-stretch', kpiStripGapClass(embedded));
}

function kpiCardClass(
  slice: DashboardSlice,
  embedded: boolean,
  isActive: boolean,
  size: 'twin' | 'compact' | 'standard' = 'standard',
): string {
  const cardTone = getKpiCardTone(slice);
  const sizeClass =
    size === 'twin'
      ? embedded
        ? 'min-h-[120px]'
        : 'min-h-[108px]'
      : size === 'compact'
        ? embedded
          ? 'min-h-[88px]'
          : 'min-h-[80px]'
        : embedded
          ? 'min-h-[112px]'
          : 'min-h-[96px]';

  return cn(
    'surface-elevated sq-press group relative overflow-hidden border text-left transition-colors duration-200',
    'hover:border-border/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
    embedded ? 'rounded-2xl px-3 py-3' : 'rounded-lg px-2.5 py-2',
    sizeClass,
    getKpiCardSurfaceClass(cardTone, embedded),
    isActive && 'ring-2 ring-[color:var(--brand)]/55',
  );
}

function readyKpiLabels(locale?: string) {
  const de = locale === 'de';
  return {
    vehiclesReady: de ? 'Fahrzeuge bereit' : 'vehicles ready',
    available: de ? 'Verfügbar' : 'Available',
    notReady: de ? 'Nicht bereit' : 'Not ready',
  };
}

function operationsKpiLabels(locale?: string) {
  const de = locale === 'de';
  return {
    activeRentals: de ? 'aktive Vermietungen' : 'active rentals',
    pickupsToday: de ? 'Übergaben heute' : 'Pickups today',
    returnsToday: de ? 'Rückgaben heute' : 'Returns today',
  };
}

function formatKpiCount(value: number | null, disabled: boolean): string {
  if (disabled || value === null) return '—';
  return String(value);
}

/** Shared typography across all six operational KPI cards (matches Due soon / Overdue returns). */
const KPI_TITLE_CLASS = 'min-w-0 truncate text-[10.5px] font-medium tracking-[-0.01em] text-muted-foreground';
const KPI_NUMBER_CLASS = 'text-[21px] font-semibold tabular-nums leading-none tracking-[-0.03em]';
const KPI_SECONDARY_TEXT_CLASS = 'text-[10px] leading-snug text-muted-foreground';
const KPI_MAIN_LABEL_CLASS = cn('mt-1 text-center', KPI_SECONDARY_TEXT_CLASS);
const KPI_SEPARATOR_CLASS = 'mx-1.5 my-1.5 shrink-0 border-t border-border/30';
const KPI_FOOTER_GRID_CLASS = 'relative grid shrink-0 grid-cols-2 items-center';
const KPI_FOOTER_LABEL_CLASS = cn(
  'text-center whitespace-nowrap',
  KPI_SECONDARY_TEXT_CLASS,
);
const KPI_FOOTER_VALUE_CLASS = cn('mt-1 text-foreground', KPI_NUMBER_CLASS);
const KPI_FOOTER_DIVIDER_CLASS =
  'pointer-events-none absolute left-1/2 top-1/2 h-6 w-px -translate-x-1/2 -translate-y-1/2 bg-border/35';

interface KpiTwinFooterColumnProps {
  label: string;
  value: string;
  valueClassName?: string;
}

function KpiTwinFooterColumn({ label, value, valueClassName }: KpiTwinFooterColumnProps) {
  return (
    <div className="min-w-0 text-center">
      <p className={KPI_FOOTER_LABEL_CLASS}>{label}</p>
      <p className={cn(KPI_FOOTER_VALUE_CLASS, valueClassName)}>{value}</p>
    </div>
  );
}

interface ReadyForRentingKpiContentProps {
  slice: DashboardSlice;
  disabled: boolean;
  locale?: string;
}

function ReadyForRentingKpiContent({ slice, disabled, locale }: ReadyForRentingKpiContentProps) {
  const labels = readyKpiLabels(locale);
  const { readyCount, availableCount, notReadyCount } = resolveReadyForRentingKpiCounts(slice);
  const mainTone = getKpiValueTone(slice, 'main');
  const notReadyTone = getKpiValueTone(slice, 'footer-right', { notReadyCount });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-2">
        <p className={KPI_TITLE_CLASS}>{slice.title}</p>
        <div
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors',
            getKpiIconTileClass(slice),
          )}
        >
          <Icon name="check-circle" className="h-3 w-3" />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-1 py-1 text-center">
        <p className={cn(KPI_NUMBER_CLASS, getKpiValueGradientClass(mainTone, disabled))}>
          {formatKpiCount(readyCount, disabled)}
        </p>
        <p className={KPI_MAIN_LABEL_CLASS}>{labels.vehiclesReady}</p>
      </div>

      <div className={KPI_SEPARATOR_CLASS} role="separator" aria-hidden />

      <div className={KPI_FOOTER_GRID_CLASS}>
        <KpiTwinFooterColumn
          label={labels.available}
          value={formatKpiCount(availableCount, disabled)}
          valueClassName={getKpiValueGradientClass('neutral', disabled)}
        />
        <KpiTwinFooterColumn
          label={labels.notReady}
          value={formatKpiCount(notReadyCount, disabled)}
          valueClassName={getKpiValueGradientClass(notReadyTone, disabled)}
        />
        <div className={KPI_FOOTER_DIVIDER_CLASS} aria-hidden />
      </div>
    </div>
  );
}

function TodaysOperationsKpiContent({ slice, disabled, locale }: ReadyForRentingKpiContentProps) {
  const labels = operationsKpiLabels(locale);
  const { activeRentalsCount, pickupsToday, returnsToday } = resolveTodaysOperationsKpiCounts(slice);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-2">
        <p className={KPI_TITLE_CLASS}>{slice.title}</p>
        <div
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors',
            getKpiIconTileClass(slice),
          )}
        >
          <Icon name="car" className="h-3 w-3" />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-1 py-1 text-center">
        <p className={cn(KPI_NUMBER_CLASS, getKpiValueGradientClass('neutral', disabled))}>
          {formatKpiCount(activeRentalsCount, disabled)}
        </p>
        <p className={KPI_MAIN_LABEL_CLASS}>{labels.activeRentals}</p>
      </div>

      <div className={KPI_SEPARATOR_CLASS} role="separator" aria-hidden />

      <div className={KPI_FOOTER_GRID_CLASS}>
        <KpiTwinFooterColumn
          label={labels.pickupsToday}
          value={formatKpiCount(pickupsToday, disabled)}
          valueClassName={getKpiValueGradientClass('neutral', disabled)}
        />
        <KpiTwinFooterColumn
          label={labels.returnsToday}
          value={formatKpiCount(returnsToday, disabled)}
          valueClassName={getKpiValueGradientClass('neutral', disabled)}
        />
        <div className={KPI_FOOTER_DIVIDER_CLASS} aria-hidden />
      </div>
    </div>
  );
}

interface CompactKpiContentProps {
  slice: DashboardSlice;
  sliceId: DashboardSliceId;
  disabled: boolean;
  displayValue: string;
}

function CompactKpiContent({ slice, sliceId, disabled, displayValue }: CompactKpiContentProps) {
  const valueTone = getKpiValueTone(slice, 'compact');

  return (
    <div className="flex h-full items-start justify-between gap-2">
      <div className="min-w-0">
        <p className={KPI_TITLE_CLASS}>{slice.title}</p>
        <p className={cn('mt-1', KPI_NUMBER_CLASS, getKpiValueGradientClass(valueTone, disabled))}>
          {displayValue}
        </p>
        {slice.hint && (
          <p className={cn('mt-1 truncate', KPI_SECONDARY_TEXT_CLASS)}>{slice.hint}</p>
        )}
      </div>
      <div
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors',
          getKpiIconTileClass(slice),
        )}
      >
        <Icon name={KPI_ICONS[sliceId] as 'car'} className="h-3 w-3" />
      </div>
    </div>
  );
}

interface KpiStripButtonProps {
  id: DashboardSliceId;
  slice: DashboardSlice;
  embedded: boolean;
  locale?: string;
  activeSliceId?: DashboardSliceId | null;
  onSelectSlice: (sliceId: DashboardSliceId) => void;
}

function KpiStripButton({ id, slice, embedded, locale, activeSliceId, onSelectSlice }: KpiStripButtonProps) {
  const disabled = slice.count === null;
  const displayValue = disabled ? '—' : String(slice.count);
  const { isCritical } = getOperationalKpiVisualState(slice);
  const isActive = activeSliceId === id;
  const isReadyCard = isReadySlice(id);
  const isOperationsCard = id === 'active-rented';
  const isTwinCard = isReadyCard || isOperationsCard;
  const readyCounts = isReadyCard ? resolveReadyForRentingKpiCounts(slice) : null;
  const operationsCounts = isOperationsCard ? resolveTodaysOperationsKpiCounts(slice) : null;

  return (
    <button
      key={id}
      type="button"
      onClick={() => {
        if (!disabled) onSelectSlice(id);
      }}
      disabled={disabled}
      className={cn(
        kpiCardClass(slice, embedded, isActive, isTwinCard ? 'twin' : 'compact'),
        disabled && 'cursor-not-allowed opacity-60',
      )}
      aria-label={
        isReadyCard && readyCounts
          ? `${slice.title}: ${formatKpiCount(readyCounts.readyCount, disabled)} ready, ${formatKpiCount(readyCounts.availableCount, disabled)} available, ${formatKpiCount(readyCounts.notReadyCount, disabled)} not ready`
          : isOperationsCard && operationsCounts
            ? `${slice.title}: ${formatKpiCount(operationsCounts.activeRentalsCount, disabled)} active rentals, ${formatKpiCount(operationsCounts.pickupsToday, disabled)} pickups today, ${formatKpiCount(operationsCounts.returnsToday, disabled)} returns today`
            : `${slice.title}: ${displayValue}`
      }
      aria-pressed={isActive}
    >
      {isReadyCard ? (
        <ReadyForRentingKpiContent slice={slice} disabled={disabled} locale={locale} />
      ) : isOperationsCard ? (
        <TodaysOperationsKpiContent slice={slice} disabled={disabled} locale={locale} />
      ) : (
        <CompactKpiContent
          slice={slice}
          sliceId={id}
          disabled={disabled}
          displayValue={displayValue}
        />
      )}
      {isCritical && (
        <span
          className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[color:var(--status-critical)]"
          aria-hidden
        />
      )}
    </button>
  );
}

export function ControlKpiStrip({
  dashboardRuntime,
  activeSliceId,
  onSelectSlice,
  embedded = false,
  locale,
  dataFreshness,
}: ControlKpiStripProps) {
  const loading = dataFreshness
    ? !dataFreshness.todayBookingsLoaded || dataFreshness.fleetLoading
    : false;

  if (loading) {
    const gridClass = kpiGridClass(embedded);
    const skeletonCardClass = embedded ? 'min-h-[112px] rounded-2xl p-3' : undefined;

    return (
      <SkeletonMetricGrid count={6} className={cn(gridClass, '!grid-cols-2')} cardClassName={skeletonCardClass} />
    );
  }

  return (
    <div className={kpiGridClass(embedded)}>
      {VISIBLE_KPI_ORDER.map((id) => (
        <KpiStripButton
          key={id}
          id={id}
          slice={dashboardRuntime.slices[id]}
          embedded={embedded}
          locale={locale}
          activeSliceId={activeSliceId}
          onSelectSlice={onSelectSlice}
        />
      ))}
    </div>
  );
}
