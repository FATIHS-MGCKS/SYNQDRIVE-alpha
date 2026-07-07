import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import type { VehicleData } from '../../data/vehicles';
import type { VehicleHealthResponse } from '../../../lib/api';
import type { DashboardRuntimeModel } from '../dashboard/runtime/dashboardRuntimeTypes';
import { FleetCommandPanel } from './FleetCommandPanel';
import {
  type FleetCommandTab,
  type FleetVehicleContext,
  buildFleetVehicleContexts,
  filterFleetBySearch,
  filterFleetByTab,
  resolveCanonicalCriticalVehicleIds,
  resolveCanonicalFleetAlertCounts,
  resolveOperatorTabForVehicle,
} from '../../lib/fleet-operator-panel';

/**
 * Shared stateful wrapper around {@link FleetCommandPanel}.
 *
 * Owns only the lightweight UI state (search query, active tab, local
 * selection) and delegates ALL list/filter/sort/display logic to the existing
 * fleet-operator builders + the panel itself. This is the same component the
 * Fleet Page renders (via FleetView), so the Dashboard and the Fleet Page share
 * one single Fleet-Command truth — no second list, filter, readiness or health
 * logic is introduced here.
 *
 * The Fleet Page keeps its own richer wiring (map sync, hover, focus) directly
 * on FleetCommandPanel; this container covers the simpler "list only" surfaces
 * such as the Dashboard.
 */
export interface FleetCommandViewProps {
  /** Already station-scoped vehicle list from the caller's data source. */
  vehicles: VehicleData[];
  /** Same health accessor used everywhere (rental health summary by id). */
  getHealth: (id: string) => VehicleHealthResponse | null | undefined;
  loading?: boolean;
  refreshing?: boolean;
  lastFetchedAt?: number | null;
  onRefresh?: () => void;
  onOpenVehicle?: (vehicleId: string) => void;
  locale?: string;
  /** Optional header control (e.g. station selector) next to refresh. */
  headerAction?: ReactNode;
  isDarkMode?: boolean;
  /** Canonical runtime model — aligns Fleet Command critical count with Critical Drawer. */
  dashboardRuntime?: DashboardRuntimeModel;
}

export function FleetCommandView({
  vehicles,
  getHealth,
  loading = false,
  refreshing = false,
  lastFetchedAt = null,
  onRefresh,
  onOpenVehicle,
  headerAction,
  isDarkMode,
  dashboardRuntime,
}: FleetCommandViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<FleetCommandTab>('Available');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const baseContexts = useMemo(
    () => buildFleetVehicleContexts(vehicles, getHealth),
    [vehicles, getHealth],
  );

  const searchContexts = useMemo(
    () => filterFleetBySearch(baseContexts, searchQuery),
    [baseContexts, searchQuery],
  );

  const visibleIds = useMemo(() => {
    const tabbed = filterFleetByTab(searchContexts, activeTab);
    return new Set(tabbed.map((c) => c.vehicle.id));
  }, [searchContexts, activeTab]);

  const hiddenSelectedVehicle = useMemo(() => {
    if (!selectedVehicleId || visibleIds.has(selectedVehicleId)) return null;
    return baseContexts.find((c) => c.vehicle.id === selectedVehicleId) ?? null;
  }, [selectedVehicleId, visibleIds, baseContexts]);

  const registerRowRef = useCallback((vehicleId: string, el: HTMLDivElement | null) => {
    if (el) rowRefs.current.set(vehicleId, el);
    else rowRefs.current.delete(vehicleId);
  }, []);

  const openVehicle = useCallback(
    (ctx: FleetVehicleContext) => {
      setSelectedVehicleId(ctx.vehicle.id);
      onOpenVehicle?.(ctx.vehicle.id);
    },
    [onOpenVehicle],
  );

  const handleRevealHiddenSelection = useCallback(() => {
    if (!hiddenSelectedVehicle) return;
    setSearchQuery('');
    setActiveTab(resolveOperatorTabForVehicle(hiddenSelectedVehicle));
    requestAnimationFrame(() => {
      rowRefs.current
        .get(hiddenSelectedVehicle.vehicle.id)
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, [hiddenSelectedVehicle]);

  const canonicalAlertCounts = useMemo(
    () => (dashboardRuntime ? resolveCanonicalFleetAlertCounts(dashboardRuntime) : undefined),
    [dashboardRuntime],
  );

  const canonicalCriticalVehicleIds = useMemo(
    () => (dashboardRuntime ? resolveCanonicalCriticalVehicleIds(dashboardRuntime) : undefined),
    [dashboardRuntime],
  );

  return (
    <FleetCommandPanel
      contexts={searchContexts}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      selectedVehicleId={selectedVehicleId}
      hiddenSelectedVehicle={hiddenSelectedVehicle}
      onClearSelection={() => setSelectedVehicleId(null)}
      onRevealHiddenSelection={handleRevealHiddenSelection}
      loading={loading}
      totalVehicleCount={vehicles.length}
      lastFetchedAt={lastFetchedAt}
      onRefresh={onRefresh ?? (() => {})}
      refreshing={refreshing}
      headerAction={headerAction}
      canonicalAlertCounts={canonicalAlertCounts}
      canonicalCriticalVehicleIds={canonicalCriticalVehicleIds}
      onRowClick={openVehicle}
      onDetailClick={(ctx, e) => {
        e.stopPropagation();
        openVehicle(ctx);
      }}
      registerRowRef={registerRowRef}
      onRowHover={() => {}}
      isDarkMode={isDarkMode}
    />
  );
}
