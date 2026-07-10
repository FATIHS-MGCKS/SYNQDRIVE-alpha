import { Icon } from '../ui/Icon';
import { cn } from '../../../components/ui/utils';

export function drawerStationScopeLabel(
  selectedStationName: string | null | undefined,
  de: boolean,
): string {
  if (selectedStationName?.trim()) {
    return de ? `Station: ${selectedStationName.trim()}` : `Station: ${selectedStationName.trim()}`;
  }
  return de ? 'Alle Stationen' : 'All Stations';
}

export interface DashboardDrilldownToolbarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  stationScopeLabel: string;
  searchPlaceholder: string;
}

/** Shared search + station scope toolbar for operative vehicle drawers. */
export function DashboardDrilldownToolbar({
  searchQuery,
  onSearchChange,
  stationScopeLabel,
  searchPlaceholder,
}: DashboardDrilldownToolbarProps) {
  return (
    <div className="mb-1 space-y-2 rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5 dark:bg-muted/10">
      <div className="flex min-w-0 items-center gap-1.5">
        <Icon name="map-pin" className="h-3 w-3 shrink-0 text-muted-foreground/80" />
        <span className="sq-section-label truncate normal-case tracking-wide">{stationScopeLabel}</span>
      </div>
      <div className="relative">
        <Icon
          name="search"
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          autoComplete="off"
          className="w-full min-w-0 rounded-xl border border-border/55 bg-background/60 py-2 pl-8 pr-3 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[color:var(--brand)] dark:bg-background"
        />
      </div>
    </div>
  );
}

export interface DashboardDrilldownSectionHeaderProps {
  title: string;
  count: number;
}

export function DashboardDrilldownSectionHeader({ title, count }: DashboardDrilldownSectionHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3 px-0.5">
      <p className="sq-section-label normal-case tracking-wide">{title}</p>
      <span className="rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
        {count}
      </span>
    </div>
  );
}

export function dashboardDrilldownSectionClassName(index: number, showDivider: boolean): string {
  return cn('space-y-2', showDivider && index > 0 && 'border-t border-border/40 pt-3');
}
