import { Icon } from '../ui/Icon';
import { DetailDrawer } from '../../../components/patterns/detail-drawer';
import { SkeletonRows, StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import type { DashboardViewProps } from './dashboardTypes';
import type { DashboardViewModel } from './dashboardTypes';
import type { DashboardDrilldownListKind } from './dashboardDrilldownTypes';
import { drilldownCtaLabel, runDrilldownCta } from './dashboardDrilldownCta';

interface DashboardDrilldownDrawerProps {
  vm: DashboardViewModel;
  onOpenVehicleById?: DashboardViewProps['onOpenVehicleById'];
  onOpenBookingById?: DashboardViewProps['onOpenBookingById'];
  onOpenRentalView?: DashboardViewProps['onOpenRentalView'];
  onOpenFinanceView?: DashboardViewProps['onOpenFinanceView'];
}

function listKindLabel(kind: DashboardDrilldownListKind, de: boolean): string {
  const map: Record<DashboardDrilldownListKind, [string, string]> = {
    vehicles: ['Vehicles', 'Fahrzeuge'],
    bookings: ['Bookings', 'Buchungen'],
    alerts: ['Alerts & insights', 'Alerts & Insights'],
    financial: ['Financial', 'Finanzen'],
    timeline: ['Timeline', 'Timeline'],
  };
  return de ? map[kind][1] : map[kind][0];
}

export function DashboardDrilldownDrawer({
  vm,
  onOpenVehicleById,
  onOpenBookingById,
  onOpenRentalView,
  onOpenFinanceView,
}: DashboardDrilldownDrawerProps) {
  const { drilldown, drilldownTarget, closeDrilldown, locale } = vm;
  const de = locale === 'de';
  const open = drilldownTarget != null;

  const handlers = {
    vm,
    onOpenVehicleById,
    onOpenBookingById,
    onOpenRentalView,
    onOpenFinanceView,
    onClose: closeDrilldown,
  };

  return (
    <DetailDrawer
      open={open}
      onOpenChange={(next) => {
        if (!next) closeDrilldown();
      }}
      eyebrow={drilldown ? listKindLabel(drilldown.listKind, de) : undefined}
      title={drilldown?.title ?? (de ? 'Details' : 'Details')}
      description={drilldown?.description}
      status={
        drilldown ? (
          <StatusChip tone="info" className="shrink-0 text-[9px]">
            {drilldown.filterLabel}
          </StatusChip>
        ) : undefined
      }
      widthClassName="sm:max-w-md"
      footer={
        drilldown?.footerAction ? (
          <button
            type="button"
            className="sq-btn sq-btn-primary min-h-9 text-[12px]"
            onClick={() =>
              runDrilldownCta({ id: 'footer', title: '', cta: drilldown.footerAction! }, handlers)
            }
          >
            {drilldownCtaLabel(drilldown.footerAction, de)}
            <Icon name="arrow-right" className="h-3.5 w-3.5" />
          </button>
        ) : undefined
      }
    >
      {!drilldown ? null : drilldown.loading ? (
        <div aria-busy className="py-2">
          <SkeletonRows rows={4} />
        </div>
      ) : drilldown.error && drilldown.rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border/50 bg-muted/15 px-4 py-10 text-center">
          <div className="sq-tone-watch flex h-10 w-10 items-center justify-center rounded-xl">
            <Icon name="alert-triangle" className="h-5 w-5" />
          </div>
          <p className="text-[13px] font-semibold text-foreground">
            {de ? 'Daten nicht verfügbar' : 'Data unavailable'}
          </p>
          <p className="max-w-[260px] text-[11px] text-muted-foreground">{drilldown.error}</p>
        </div>
      ) : drilldown.rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/60 bg-muted/10 px-4 py-10 text-center">
          <div className="sq-tone-success flex h-10 w-10 items-center justify-center rounded-xl">
            <Icon name="check-circle" className="h-5 w-5" />
          </div>
          <p className="text-[13px] font-semibold text-foreground">
            {de ? 'Keine Einträge' : 'No items'}
          </p>
          <p className="max-w-[260px] text-[11px] text-muted-foreground">
            {de
              ? 'Für diesen Filter sind aktuell keine Datensätze vorhanden.'
              : 'No records match this filter right now.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {drilldown.error ? (
            <p className="rounded-lg border border-[color:var(--status-watch)]/30 bg-[color:var(--status-watch)]/[0.06] px-3 py-2 text-[11px] text-muted-foreground">
              {drilldown.error}
            </p>
          ) : null}
          <ul className="divide-y divide-border/40 rounded-xl border border-border/50 bg-card/20">
            {drilldown.rows.map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:gap-3"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-[13px] font-semibold text-foreground">{row.title}</p>
                  </div>
                  {row.subtitle ? (
                    <p className="truncate text-[11px] text-muted-foreground">{row.subtitle}</p>
                  ) : null}
                  {row.meta ? (
                    <p className="line-clamp-2 text-[10px] text-muted-foreground/90">{row.meta}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => runDrilldownCta(row, handlers)}
                  className={cn(
                    'sq-btn sq-btn-secondary min-h-9 shrink-0 self-end text-[11px] sm:self-center',
                  )}
                >
                  {row.ctaLabel ?? drilldownCtaLabel(row.cta, de)}
                  <Icon name="arrow-right" className="h-3.5 w-3.5 opacity-70" />
                </button>
              </li>
            ))}
          </ul>
          <p className="text-center text-[10px] text-muted-foreground">
            {de
              ? `${drilldown.rows.length} Einträge · Filter: ${drilldown.filterLabel}`
              : `${drilldown.rows.length} items · Filter: ${drilldown.filterLabel}`}
          </p>
        </div>
      )}
    </DetailDrawer>
  );
}
