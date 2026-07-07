import { useMemo, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { SkeletonCard } from '../../../components/patterns';
import {
  type FleetCommandTab,
  type FleetVehicleContext,
  computeFleetCommandAttentionCounts,
  fleetCommandTabEmptyMessage,
  computeCommandTabCounts,
  filterFleetByTab,
  resolveFleetCommandRowSeverity,
  sortFleetContexts,
  type ResolveFleetCommandRowSeverityOptions,
} from '../../lib/fleet-operator-panel';
import { FleetOperatorRow } from './FleetOperatorRow';
import { CommandCountBadge, PanelStatusChip } from './fleetOperatorUi';

const COMMAND_TABS: Array<{
  key: FleetCommandTab;
  label: string;
  tone?: 'success' | 'brand' | 'warning' | 'critical' | 'neutral';
}> = [
  { key: 'Available', label: 'Available', tone: 'success' },
  { key: 'Active', label: 'Active', tone: 'brand' },
  { key: 'Reserved', label: 'Reserved', tone: 'warning' },
];

export interface FleetCommandPanelProps {
  contexts: FleetVehicleContext[];
  activeTab: FleetCommandTab;
  onTabChange: (tab: FleetCommandTab) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedVehicleId: string | null;
  hiddenSelectedVehicle: FleetVehicleContext | null;
  onClearSelection: () => void;
  onRevealHiddenSelection: () => void;
  loading: boolean;
  totalVehicleCount: number;
  lastFetchedAt: number | null;
  onRefresh: () => void;
  refreshing: boolean;
  headerAction?: ReactNode;
  onRowClick: (ctx: FleetVehicleContext) => void;
  onDetailClick: (ctx: FleetVehicleContext, e: React.MouseEvent) => void;
  registerRowRef: (vehicleId: string, el: HTMLDivElement | null) => void;
  onRowHover: (vehicleId: string | null) => void;
  isDarkMode?: boolean;
  listPanelRef?: React.RefObject<HTMLDivElement | null>;
  /** When set, critical count matches the canonical Critical Alerts drawer. */
  canonicalAlertCounts?: { critical: number; warning: number };
  /** Vehicle IDs from the canonical Critical Alerts slice (Dashboard). */
  canonicalCriticalVehicleIds?: ReadonlySet<string>;
}

export function FleetCommandPanel({
  contexts,
  activeTab,
  onTabChange,
  searchQuery,
  onSearchChange,
  selectedVehicleId,
  hiddenSelectedVehicle,
  onClearSelection,
  onRevealHiddenSelection,
  loading,
  totalVehicleCount: _totalVehicleCount,
  lastFetchedAt: _lastFetchedAt,
  onRefresh: _onRefresh,
  refreshing: _refreshing,
  headerAction,
  onRowClick,
  onDetailClick,
  registerRowRef,
  onRowHover,
  isDarkMode,
  listPanelRef,
  canonicalAlertCounts,
  canonicalCriticalVehicleIds,
}: FleetCommandPanelProps) {
  const severityOptions = useMemo<ResolveFleetCommandRowSeverityOptions>(
    () => ({ canonicalCriticalVehicleIds }),
    [canonicalCriticalVehicleIds],
  );

  const tabCounts = useMemo(() => computeCommandTabCounts(contexts), [contexts]);

  const attentionStats = useMemo(() => {
    if (canonicalAlertCounts) return canonicalAlertCounts;
    return computeFleetCommandAttentionCounts(contexts, severityOptions);
  }, [contexts, canonicalAlertCounts, severityOptions]);

  const visibleContexts = useMemo(
    () => sortFleetContexts(filterFleetByTab(contexts, activeTab), severityOptions),
    [contexts, activeTab, severityOptions],
  );

  const hasSearch = searchQuery.trim().length > 0;

  return (
    <div className="sq-card overflow-hidden flex flex-col lg:h-[640px] animate-fade-up">
      <div className="p-3 pb-0 border-b border-border/40">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 mb-1.5">
          <h3 className="text-[12px] font-semibold tracking-[-0.005em] text-foreground shrink-0">
            Fleet Command
          </h3>
          <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0 ml-auto">
            {headerAction}
            {attentionStats.critical > 0 && (
              <PanelStatusChip
                label={`${attentionStats.critical} Critical`}
                tone="critical"
              />
            )}
            {attentionStats.warning > 0 && (
              <PanelStatusChip
                label={`${attentionStats.warning} Warning`}
                tone="warning"
              />
            )}
            {attentionStats.critical === 0 && attentionStats.warning === 0 && (
              <PanelStatusChip label="No attention" tone="neutral" />
            )}
          </div>
        </div>

        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Plate, make, model…"
            className="w-full pl-8 pr-3 py-2 rounded-xl border border-border/60 bg-muted/30 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[color:var(--brand)]"
          />
        </div>

        <div className="sq-tab-bar p-1 flex items-stretch gap-0.5 overflow-x-auto scrollbar-thin mb-2">
          {COMMAND_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const count = tabCounts[tab.key];
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onTabChange(tab.key)}
                className={`shrink-0 px-2 py-1.5 rounded-[calc(var(--radius-md)-2px)] text-[11px] font-semibold whitespace-nowrap transition-all duration-200 flex items-center gap-1 ${
                  isActive
                    ? 'bg-card text-foreground shadow-[var(--shadow-1)] ring-1 ring-[color:color-mix(in_srgb,var(--brand)_12%,transparent)]'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span>{tab.label}</span>
                <CommandCountBadge count={count} tone={tab.tone} active={isActive} />
              </button>
            );
          })}
        </div>
      </div>

      <div ref={listPanelRef} className="flex-1 py-1.5 lg:overflow-y-auto">
        {hiddenSelectedVehicle && (
          <div className="mx-2.5 mb-1.5 px-2.5 py-2 rounded-lg border border-border/50 bg-muted/40 flex items-center justify-between gap-2">
            <p className="text-[10px] text-muted-foreground min-w-0 truncate">
              <span className="font-semibold text-foreground">
                {hiddenSelectedVehicle.vehicle.license}
              </span>{' '}
              hidden by filter
            </p>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={onRevealHiddenSelection}
                className="text-[10px] font-semibold text-[color:var(--brand)] hover:underline"
              >
                Show
              </button>
              <span className="text-muted-foreground">·</span>
              <button
                type="button"
                onClick={onClearSelection}
                className="text-[10px] font-medium text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {loading && contexts.length === 0 ? (
          <div className="space-y-2 px-2.5">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : visibleContexts.length === 0 ? (
          <p className="text-center text-[10.5px] text-muted-foreground py-8">
            {fleetCommandTabEmptyMessage(activeTab, hasSearch)}
          </p>
        ) : (
          <div className="divide-y divide-border/30">
            {visibleContexts.map((ctx) => {
              const commandSeverity = resolveFleetCommandRowSeverity(ctx, severityOptions);
              return (
              <FleetOperatorRow
                key={ctx.vehicle.id}
                ctx={ctx}
                commandSeverity={commandSeverity}
                selected={selectedVehicleId === ctx.vehicle.id}
                onClick={() => onRowClick(ctx)}
                onDetailClick={(e) => onDetailClick(ctx, e)}
                rowRef={(el) => registerRowRef(ctx.vehicle.id, el)}
                onMouseEnter={() => onRowHover(ctx.vehicle.id)}
                onMouseLeave={() => onRowHover(null)}
                isDarkMode={isDarkMode}
              />
            );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
