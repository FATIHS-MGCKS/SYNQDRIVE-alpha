import { Icon } from '../ui/Icon';
import { SkeletonMetricGrid } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import {
  DASHBOARD_KPI_HINT_CLASS,
  DASHBOARD_KPI_NUMBER_CLASS,
  DASHBOARD_KPI_TITLE_CLASS,
} from './dashboardShell';
import { resolveReadyForRentingKpiCounts, resolveTodaysOperationsKpiCounts } from './dashboardSliceAccess';
import {
  getKpiCardSurfaceClass,
  getKpiCardTone,
  getKpiIconTileClass,
  getKpiValueGradientClass,
  getKpiValueTone,
} from './dashboardKpiVisual';
import type { DashboardRuntimeModel, DashboardSlice, DashboardSliceId } from './runtime';
import type { TodaysOperationsDrilldownGroupId } from './dashboardDrilldownTypes';
import type { DataFreshnessSummary } from './dashboardTypes';

interface ControlKpiStripProps {
  dashboardRuntime: DashboardRuntimeModel;
  activeSliceId?: DashboardSliceId | null;
  onSelectSlice: (sliceId: DashboardSliceId, groupId?: TodaysOperationsDrilldownGroupId) => void;
  embedded?: boolean;
  locale?: string;
  dataFreshness?: DataFreshnessSummary;
}

/**
 * Visible KPI order in the dashboard strip. `due-soon` and the former lower-row
 * slices (`blocked-maintenance`, `overdue-*`, `critical-alerts`) stay in runtime
 * for drilldowns and other consumers but are not rendered here.
 */
const VISIBLE_KPI_ORDER: DashboardSliceId[] = ['ready-to-rent', 'active-rented'];

/** Twin KPI shell height — two-card strip reuses vertical space from removed lower row. */
const TWIN_KPI_MIN_HEIGHT_EMBEDDED = 'min-h-[200px]';
const TWIN_KPI_MIN_HEIGHT_STANDARD = 'min-h-[168px]';

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
        ? TWIN_KPI_MIN_HEIGHT_EMBEDDED
        : TWIN_KPI_MIN_HEIGHT_STANDARD
      : size === 'compact'
        ? embedded
          ? 'min-h-[88px]'
          : 'min-h-[80px]'
        : embedded
          ? 'min-h-[112px]'
          : 'min-h-[96px]';

  const paddingClass =
    size === 'twin'
      ? embedded
        ? 'rounded-2xl px-3 py-4'
        : 'rounded-lg px-2.5 py-3'
      : embedded
        ? 'rounded-2xl px-3 py-3'
        : 'rounded-lg px-2.5 py-2';

  return cn(
    'surface-elevated sq-press group relative overflow-hidden text-left transition-colors duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
    paddingClass,
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
    pickupsToday: de ? 'Übergaben' : 'Pickups',
    returnsToday: de ? 'Rückgaben' : 'Returns',
  };
}

function formatKpiCount(value: number | null, disabled: boolean): string {
  if (disabled || value === null) return '—';
  return String(value);
}

/** Shared typography across operational KPI twin cards (matches dashboardShell tokens). */
const KPI_TITLE_CLASS = DASHBOARD_KPI_TITLE_CLASS;
const KPI_NUMBER_CLASS = DASHBOARD_KPI_NUMBER_CLASS;
const KPI_SECONDARY_TEXT_CLASS = DASHBOARD_KPI_HINT_CLASS;
const KPI_MAIN_LABEL_CLASS = cn('mt-1.5 text-center', KPI_SECONDARY_TEXT_CLASS);
const KPI_SEPARATOR_CLASS = 'mx-1.5 my-3 shrink-0 border-t border-border/30';
const KPI_FOOTER_GRID_CLASS = 'relative grid shrink-0 grid-cols-2 items-center gap-y-0.5';
const KPI_FOOTER_LABEL_CLASS = cn(
  'text-center whitespace-nowrap',
  KPI_SECONDARY_TEXT_CLASS,
);
const KPI_FOOTER_VALUE_CLASS = cn('mt-1.5 text-foreground', KPI_NUMBER_CLASS);
const KPI_FOOTER_DIVIDER_CLASS =
  'pointer-events-none absolute left-1/2 top-1/2 h-7 w-px -translate-x-1/2 -translate-y-1/2 bg-border/35';

interface KpiTwinFooterColumnProps {
  label: string;
  value: string;
  valueClassName?: string;
}

function KpiTwinFooterColumn({
  label,
  value,
  valueClassName,
  onClick,
  disabled,
  ariaLabel,
}: KpiTwinFooterColumnProps & {
  onClick?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const content = (
    <>
      <p className={KPI_FOOTER_LABEL_CLASS}>{label}</p>
      <p className={cn(KPI_FOOTER_VALUE_CLASS, valueClassName)}>{value}</p>
    </>
  );

  if (!onClick) {
    return <div className="min-w-0 text-center">{content}</div>;
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel ?? label}
      className={cn(
        'min-w-0 rounded-lg text-center transition-colors',
        'hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      {content}
    </button>
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

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-1 py-2.5 text-center">
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

interface OperationsKpiContentProps {
  slice: DashboardSlice;
  disabled: boolean;
  locale?: string;
  onSelectOperationsSection?: (groupId: TodaysOperationsDrilldownGroupId) => void;
}

function TodaysOperationsKpiContent({
  slice,
  disabled,
  locale,
  onSelectOperationsSection,
}: OperationsKpiContentProps) {
  const labels = operationsKpiLabels(locale);
  const {
    activeRentalsCount,
    pickupsToday,
    returnsToday,
    hasOverduePickups,
    hasOverdueReturns,
  } = resolveTodaysOperationsKpiCounts(slice);
  const pickupTone = getKpiValueTone(slice, 'footer-left', { hasOverduePickups });
  const returnTone = getKpiValueTone(slice, 'footer-right', { hasOverdueReturns });
  const openSection = (groupId: TodaysOperationsDrilldownGroupId) => {
    if (disabled) return;
    onSelectOperationsSection?.(groupId);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <button
        type="button"
        disabled={disabled}
        onClick={() => openSection('active-rentals')}
        aria-label={`${labels.activeRentals}: ${formatKpiCount(activeRentalsCount, disabled)}`}
        className={cn(
          'flex min-h-0 flex-1 flex-col rounded-lg text-left transition-colors',
          'hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
          disabled && 'cursor-not-allowed',
        )}
      >
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

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-1 py-2.5 text-center">
          <p className={cn(KPI_NUMBER_CLASS, getKpiValueGradientClass('neutral', disabled))}>
            {formatKpiCount(activeRentalsCount, disabled)}
          </p>
          <p className={KPI_MAIN_LABEL_CLASS}>{labels.activeRentals}</p>
        </div>
      </button>

      <div className={KPI_SEPARATOR_CLASS} role="separator" aria-hidden />

      <div className={KPI_FOOTER_GRID_CLASS}>
        <KpiTwinFooterColumn
          label={labels.pickupsToday}
          value={formatKpiCount(pickupsToday, disabled)}
          valueClassName={getKpiValueGradientClass(pickupTone, disabled)}
          disabled={disabled || pickupsToday === 0}
          onClick={() => openSection('pickups-today')}
          ariaLabel={`${labels.pickupsToday}: ${formatKpiCount(pickupsToday, disabled)}`}
        />
        <KpiTwinFooterColumn
          label={labels.returnsToday}
          value={formatKpiCount(returnsToday, disabled)}
          valueClassName={getKpiValueGradientClass(returnTone, disabled)}
          disabled={disabled || returnsToday === 0}
          onClick={() => openSection('returns-today')}
          ariaLabel={`${labels.returnsToday}: ${formatKpiCount(returnsToday, disabled)}`}
        />
        <div className={KPI_FOOTER_DIVIDER_CLASS} aria-hidden />
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
  onSelectSlice: (sliceId: DashboardSliceId, groupId?: TodaysOperationsDrilldownGroupId) => void;
}

function KpiStripButton({ id, slice, embedded, locale, activeSliceId, onSelectSlice }: KpiStripButtonProps) {
  const disabled = slice.count === null;
  const displayValue = disabled ? '—' : String(slice.count);
  const isActive = activeSliceId === id;
  const isOperationsCard = id === 'active-rented';
  const readyCounts = resolveReadyForRentingKpiCounts(slice);
  const operationsCounts = resolveTodaysOperationsKpiCounts(slice);

  if (isOperationsCard) {
    return (
      <div
        key={id}
        className={cn(
          kpiCardClass(slice, embedded, isActive, 'twin'),
          disabled && 'cursor-not-allowed opacity-60',
          'relative',
        )}
        aria-label={
          operationsCounts
            ? `${slice.title}: ${formatKpiCount(operationsCounts.activeRentalsCount, disabled)} active rentals, ${formatKpiCount(operationsCounts.pickupsToday, disabled)} pickups, ${formatKpiCount(operationsCounts.returnsToday, disabled)} returns`
            : `${slice.title}: ${displayValue}`
        }
      >
        <TodaysOperationsKpiContent
          slice={slice}
          disabled={disabled}
          locale={locale}
          onSelectOperationsSection={(groupId) => onSelectSlice(id, groupId)}
        />
      </div>
    );
  }

  return (
    <button
      key={id}
      type="button"
      onClick={() => {
        if (!disabled) onSelectSlice(id);
      }}
      disabled={disabled}
      className={cn(
        kpiCardClass(slice, embedded, isActive, 'twin'),
        disabled && 'cursor-not-allowed opacity-60',
      )}
      aria-label={
        readyCounts
          ? `${slice.title}: ${formatKpiCount(readyCounts.readyCount, disabled)} ready, ${formatKpiCount(readyCounts.availableCount, disabled)} available, ${formatKpiCount(readyCounts.notReadyCount, disabled)} not ready`
          : `${slice.title}: ${displayValue}`
      }
      aria-pressed={isActive}
    >
      <ReadyForRentingKpiContent slice={slice} disabled={disabled} locale={locale} />
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
    const skeletonCardClass = embedded
      ? `${TWIN_KPI_MIN_HEIGHT_EMBEDDED} rounded-2xl p-4`
      : undefined;

    return (
      <SkeletonMetricGrid count={2} className={cn(gridClass, '!grid-cols-2')} cardClassName={skeletonCardClass} />
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
