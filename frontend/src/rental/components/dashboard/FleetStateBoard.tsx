import { useMemo, useState } from 'react';
import { Icon } from '../ui/Icon';
import { SkeletonRows } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import { FleetBoardVehicleRow } from './FleetBoardVehicleRow';
import { panelShellClass } from './dashboardShell';
import type {
  DashboardRuntimeModel,
  DashboardSliceId,
  DashboardSliceRow,
  VehicleRuntimeState,
} from './runtime';

interface FleetStateBoardProps {
  dashboardRuntime: DashboardRuntimeModel;
  activeTargetId?: DashboardSliceId | null;
  onSelectSlice?: (sliceId: DashboardSliceId) => void;
  onOpenVehicle?: (vehicleId: string) => void;
  locale?: string;
  loading?: boolean;
  stationName?: string | null;
}

function FleetBoardEmpty({ locale, stationName }: { locale: string; stationName?: string | null }) {
  const de = locale === 'de';
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <div className="sq-tone-neutral flex h-10 w-10 items-center justify-center rounded-xl bg-muted/40">
        <Icon name="car" className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-[13px] font-semibold text-foreground">
        {de ? 'Keine Fahrzeuge im Scope' : 'No vehicles in scope'}
      </p>
      <p className="max-w-[280px] text-[12px] text-muted-foreground text-pretty">
        {stationName
          ? de
            ? `${stationName} hat aktuell keine Fahrzeuge in der Flotte.`
            : `${stationName} has no fleet vehicles right now.`
          : de
            ? 'Es sind keine Fahrzeuge geladen oder der Filter ist leer.'
            : 'No vehicles are loaded or the current filter is empty.'}
      </p>
    </div>
  );
}

function MinimalFleetHeader({
  title,
  subtitle,
  totalCount,
  criticalCount,
  de,
  isExpanded,
  onToggle,
  controlsId,
}: {
  title: string;
  subtitle: string;
  totalCount: number;
  criticalCount: number;
  de: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  controlsId: string;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-border/35 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className={[
            'h-2 w-2 shrink-0 rounded-full',
            criticalCount > 0 ? 'bg-[color:var(--status-critical)]' : 'bg-[color:var(--brand)]',
          ].join(' ')}
          aria-hidden
        />
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold leading-tight tracking-[-0.01em] text-foreground text-balance">
            {title}
          </h2>
          <p className="mt-0.5 truncate text-[11px] leading-snug text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:justify-end">
        {totalCount > 0 ? (
          <>
            {criticalCount > 0 ? (
              <span className="text-[11px] font-medium tabular-nums text-[color:var(--status-critical)]">
                {criticalCount} {de ? 'kritisch' : 'critical'}
              </span>
            ) : null}
            <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
              {totalCount} {de ? 'Fahrzeuge' : 'vehicles'}
            </span>
          </>
        ) : null}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          aria-controls={controlsId}
          className="sq-press inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-[10.5px] font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
        >
          {isExpanded ? (de ? 'Zu' : 'Close') : (de ? 'Auf' : 'Open')}
          <Icon
            name="chevron-down"
            className={cn('h-3 w-3 transition-transform duration-200', !isExpanded && '-rotate-90')}
          />
        </button>
      </div>
    </div>
  );
}

interface RuntimeBoardSection {
  id: string;
  sliceId: DashboardSliceId;
  title: string;
  subtitle: string;
  count: number;
  rows: DashboardSliceRow[];
}

function sectionLabel(sliceId: DashboardSliceId, de: boolean): string {
  const labels: Record<DashboardSliceId, [string, string]> = {
    'ready-to-rent': ['Ready to Rent', 'Mietbereit'],
    'active-rented': ['Active / Rented', 'Aktiv / Vermietet'],
    'due-soon': ['Due Soon', 'Bald fällig'],
    'overdue-returns': ['Overdue Returns', 'Überfällige Rückgaben'],
    'blocked-maintenance': ['Blocked / Maintenance', 'Blockiert / Wartung'],
    'critical-alerts': ['Critical Alerts', 'Kritische Alerts'],
  };
  return de ? labels[sliceId][1] : labels[sliceId][0];
}

function availableButNotReadyRows(runtime: DashboardRuntimeModel): DashboardSliceRow[] {
  const readySlice = runtime.slices['ready-to-rent'];
  const groupRows = readySlice.groups?.find((group) => group.id === 'available-but-not-ready')?.rows;
  return groupRows?.length ? groupRows : readySlice.secondaryRows ?? [];
}

function buildSections(runtime: DashboardRuntimeModel, de: boolean): RuntimeBoardSection[] {
  const readySlice = runtime.slices['ready-to-rent'];
  const activeSlice = runtime.slices['active-rented'];
  const dueSoonSlice = runtime.slices['due-soon'];
  const overdueSlice = runtime.slices['overdue-returns'];
  const blockedSlice = runtime.slices['blocked-maintenance'];
  const criticalSlice = runtime.slices['critical-alerts'];
  const notReadyRows = availableButNotReadyRows(runtime);

  return [
    {
      id: 'ready-to-rent',
      sliceId: 'ready-to-rent',
      title: sectionLabel('ready-to-rent', de),
      subtitle: readySlice.hint ?? (de ? 'Echte mietbereite Fahrzeuge' : 'Truly ready vehicles'),
      count: readySlice.count ?? readySlice.rows.length,
      rows: readySlice.rows,
    },
    {
      id: 'available-but-not-ready',
      sliceId: 'ready-to-rent',
      title: de ? 'Verfügbar, aber nicht bereit' : 'Available but not ready',
      subtitle: de ? 'Aus dem Ready-Slice erklärt' : 'Explained by the Ready slice',
      count: notReadyRows.length,
      rows: notReadyRows,
    },
    {
      id: 'active-rented',
      sliceId: 'active-rented',
      title: sectionLabel('active-rented', de),
      subtitle: activeSlice.hint ?? (de ? 'Aktive Mietvorgänge' : 'Active rental operations'),
      count: activeSlice.count ?? activeSlice.rows.length,
      rows: activeSlice.rows,
    },
    {
      id: 'due-soon',
      sliceId: 'due-soon',
      title: sectionLabel('due-soon', de),
      subtitle: dueSoonSlice.hint ?? (de ? 'Pickups und Returns im Zeitfenster' : 'Pickups and returns in the window'),
      count: dueSoonSlice.count ?? dueSoonSlice.rows.length,
      rows: dueSoonSlice.rows,
    },
    {
      id: 'overdue-returns',
      sliceId: 'overdue-returns',
      title: sectionLabel('overdue-returns', de),
      subtitle: overdueSlice.hint ?? (de ? 'Nur überfällige Rückgaben' : 'Only overdue returns'),
      count: overdueSlice.count ?? overdueSlice.rows.length,
      rows: overdueSlice.rows,
    },
    {
      id: 'blocked-maintenance',
      sliceId: 'blocked-maintenance',
      title: sectionLabel('blocked-maintenance', de),
      subtitle: blockedSlice.hint ?? (de ? 'Blockaden, Wartung und nicht verfügbare Fahrzeuge' : 'Blocks, maintenance, and unavailable vehicles'),
      count: blockedSlice.count ?? blockedSlice.rows.length,
      rows: blockedSlice.rows,
    },
    {
      id: 'critical-alerts',
      sliceId: 'critical-alerts',
      title: sectionLabel('critical-alerts', de),
      subtitle: criticalSlice.hint ?? (de ? 'Deduplizierte Problem-Items' : 'Deduplicated issue items'),
      count: criticalSlice.count ?? criticalSlice.rows.length,
      rows: criticalSlice.rows,
    },
  ];
}

function SectionHeader({
  section,
  active,
  de,
  onSelect,
}: {
  section: RuntimeBoardSection;
  active: boolean;
  de: boolean;
  onSelect?: (sliceId: DashboardSliceId) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(section.sliceId)}
      className={cn(
        'sq-press flex w-full items-start justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
        active
          ? 'border-[color:var(--brand)]/35 bg-[color:var(--brand-soft)]'
          : 'border-border/45 bg-card/35 hover:border-border/70 hover:bg-muted/20',
      )}
    >
      <div className="min-w-0">
        <p className="truncate text-[12.5px] font-semibold tracking-[-0.01em] text-foreground">
          {section.title}
        </p>
        <p className="mt-0.5 line-clamp-1 text-[10.5px] leading-snug text-muted-foreground">
          {section.subtitle}
        </p>
      </div>
      <span className="rounded-lg bg-background/55 px-2 py-1 text-[11px] font-semibold tabular-nums text-foreground">
        {section.count}
      </span>
      <span className="sr-only">{de ? 'Slice öffnen' : 'Open slice'}</span>
    </button>
  );
}

function SectionEmpty({ de }: { de: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-border/45 bg-muted/10 px-3 py-4 text-center">
      <p className="text-[11.5px] font-medium text-muted-foreground">
        {de ? 'Keine Einträge in diesem Bereich' : 'No items in this section'}
      </p>
    </div>
  );
}

/**
 * @deprecated Dashboard now uses FleetCommandPanel / FleetCommandView instead of
 * FleetStateBoard. The operative Fahrzeugliste im Dashboard ist jetzt die
 * gleiche Fleet Command View wie auf der Fleet Page (Status Tab). KPI/Drawer
 * bleiben Runtime-Slice-basiert. Diese Komponente ist nicht mehr aktiv
 * verdrahtet und wird nur für Referenz/Backward-Compat behalten.
 */
export function FleetStateBoard({
  dashboardRuntime,
  activeTargetId,
  onSelectSlice,
  onOpenVehicle,
  locale = 'de',
  loading = false,
  stationName,
}: FleetStateBoardProps) {
  const de = locale === 'de';
  const [isExpanded, setIsExpanded] = useState(true);
  const contentId = 'dashboard-fleet-state-content';
  const sections = useMemo(() => buildSections(dashboardRuntime, de), [dashboardRuntime, de]);
  const runtimeStateByVehicleId = useMemo(() => {
    const states = new Map<string, VehicleRuntimeState>();
    for (const state of dashboardRuntime.vehicleStates) states.set(state.vehicleId, state);
    return states;
  }, [dashboardRuntime.vehicleStates]);
  const totalCount = dashboardRuntime.vehicleStates.length;
  const criticalCount = dashboardRuntime.slices['critical-alerts'].count ?? dashboardRuntime.slices['critical-alerts'].rows.length;
  const hasVisibleRows = sections.some((section) => section.rows.length > 0);

  return (
    <section
      className={panelShellClass('tertiary', 'border-solid border-border/55 bg-card/55 shadow-none')}
      aria-label={de ? 'Flottenstatus' : 'Fleet status'}
    >
      <MinimalFleetHeader
        title={de ? 'Flottensteuerung' : 'Fleet State Board'}
        subtitle={
          `${totalCount} ${de ? 'Fahrzeuge' : 'vehicles'}` +
          (stationName ? ` · ${stationName}` : '')
        }
        totalCount={totalCount}
        criticalCount={criticalCount}
        de={de}
        isExpanded={isExpanded}
        onToggle={() => setIsExpanded((current) => !current)}
        controlsId={contentId}
      />

      <div id={contentId} hidden={!isExpanded} className={isExpanded ? 'animate-fade-up' : undefined}>
          <div className="grid grid-cols-1 gap-2 border-b border-border/35 p-3 sm:grid-cols-2 xl:grid-cols-3">
            {sections.map((section) => (
              <SectionHeader
                key={section.id}
                section={section}
                active={activeTargetId === section.sliceId}
                de={de}
                onSelect={onSelectSlice}
              />
            ))}
          </div>

          <div className="max-h-[min(620px,76vh)] flex-1 overflow-y-auto p-3">
            {loading ? (
              <div className="py-2.5">
                <SkeletonRows rows={5} />
              </div>
            ) : totalCount === 0 ? (
              <FleetBoardEmpty locale={locale} stationName={stationName} />
            ) : !hasVisibleRows ? (
              <FleetBoardEmpty locale={locale} stationName={stationName} />
            ) : (
              <div className="space-y-4">
                {sections.map((section) => (
                  <section key={section.id} className="space-y-2">
                    <div className="flex items-center justify-between gap-3 px-1">
                      <div className="min-w-0">
                        <h3 className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {section.title}
                        </h3>
                        <p className="truncate text-[10.5px] text-muted-foreground/85">{section.subtitle}</p>
                      </div>
                      <span className="rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                        {section.count}
                      </span>
                    </div>
                    {section.rows.length === 0 ? (
                      <SectionEmpty de={de} />
                    ) : (
                      <div className="space-y-2">
                        {section.rows.map((row) => (
                          <FleetBoardVehicleRow
                            key={row.id}
                            row={row}
                            runtimeState={row.vehicleId ? runtimeStateByVehicleId.get(row.vehicleId) : undefined}
                            locale={locale}
                            onOpen={row.vehicleId && onOpenVehicle ? () => onOpenVehicle(row.vehicleId as string) : undefined}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                ))}
              </div>
            )}
          </div>

          {!loading && hasVisibleRows && (
            <div className="border-t border-border/40 px-3.5 py-2 text-[11px] text-muted-foreground">
              {de
                ? 'Quelle: Dashboard Runtime Slices · Fahrzeugdetails aus VehicleRuntimeState'
                : 'Source: Dashboard runtime slices · vehicle details from VehicleRuntimeState'}
            </div>
          )}
      </div>
    </section>
  );
}
