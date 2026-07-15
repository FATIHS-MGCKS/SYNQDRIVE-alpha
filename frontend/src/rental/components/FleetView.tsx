
import { useState, useRef, useMemo, useEffect, useSyncExternalStore, useCallback, Component, type ReactNode, type ErrorInfo, type SyntheticEvent } from 'react';
import { MapboxMap, type MapboxMapHandle } from '../../components/MapboxMap';
import { VehicleData } from '../data/vehicles';
import { useRentalOrg } from '../RentalContext';
import { PageHeader, SkeletonCard } from '../../components/patterns';
import { useFleetVehicles } from '../FleetContext';
import { Icon } from './ui/Icon';
import { api, type Station } from '../../lib/api';
import {
  ALL_STATIONS_FILTER,
  selectFleetMapError,
  selectFleetMapLastFetchedAt,
  selectFleetMapLoading,
  selectFleetMapRefreshInterval,
  selectFleetMapSelectedVehicleId,
  selectFleetMapVehicles,
  useFleetMapStore,
} from '../stores/useFleetMapStore';
import { buildFleetMapGeoJson, vehicleHasFleetLocation } from '../lib/fleetVisualState';
import { FleetMapControls } from './FleetMapControls';
import { FleetMapVehicleStatusHud } from './fleet-operator/FleetMapVehicleStatusHud';
import { FleetCommandPanel } from './fleet-operator/FleetCommandPanel';
import {
  buildFleetVehicleContexts,
  buildStationFilterOptions,
  filterFleetBySearch,
  filterFleetByStation,
  filterFleetByTab,
  resolveOperatorTabForVehicle,
  type FleetCommandTab,
  type FleetVehicleContext,
} from '../lib/fleet-operator-panel';

interface MapSafetyBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

class MapSafetyBoundary extends Component<
  { children: ReactNode; isDarkMode?: boolean },
  MapSafetyBoundaryState
> {
  state: MapSafetyBoundaryState = { hasError: false, errorMessage: null };

  static getDerivedStateFromError(error: Error): MapSafetyBoundaryState {
    return { hasError: true, errorMessage: error?.message ?? 'Map failed' };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[MapSafetyBoundary] Map render crash', { error, info });
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="w-full h-full flex items-center justify-center bg-muted/30 rounded-xl">
        <div className="text-center px-4">
          <p className="text-xs font-semibold text-muted-foreground">Map unavailable</p>
          {this.state.errorMessage && (
            <p className="mt-1 text-[10px] font-mono text-[color:var(--status-critical)] break-all max-w-xs">
              {this.state.errorMessage}
            </p>
          )}
        </div>
      </div>
    );
  }
}

interface FleetViewProps {
  onVehicleSelect?: (vehicle: VehicleData) => void;
  embedded?: boolean;
}

const KASSEL_CENTER: [number, number] = [9.4797, 51.3127];

export function FleetView({ onVehicleSelect, embedded = false }: FleetViewProps) {
  const systemDark = useSyncExternalStore(
    (onStoreChange) => {
      const el = document.documentElement;
      const obs = new MutationObserver(onStoreChange);
      obs.observe(el, { attributes: true, attributeFilter: ['class'] });
      return () => obs.disconnect();
    },
    () => document.documentElement.classList.contains('dark'),
    () => false,
  );
  const { orgId } = useRentalOrg();

  const vehicles = useFleetMapStore(selectFleetMapVehicles);
  const stationId = useFleetMapStore((s) => s.filters.stationId);
  const loading = useFleetMapStore(selectFleetMapLoading);
  const error = useFleetMapStore(selectFleetMapError);
  const refreshIntervalMs = useFleetMapStore(selectFleetMapRefreshInterval);
  const lastFetchedAt = useFleetMapStore(selectFleetMapLastFetchedAt);
  const selectedVehicleId = useFleetMapStore(selectFleetMapSelectedVehicleId);
  const setStationFilter = useFleetMapStore((state) => state.setStationFilter);
  const setSelectedVehicleId = useFleetMapStore((state) => state.setSelectedVehicleId);
  const { healthMap, refresh: refreshFleetMap } = useFleetVehicles();

  const [stationsApi, setStationsApi] = useState<Station[]>([]);
  useEffect(() => {
    if (!orgId) {
      setStationsApi([]);
      return;
    }
    let cancelled = false;
    api.stations
      .list(orgId)
      .then((rows) => {
        if (!cancelled) setStationsApi(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setStationsApi([]);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const getHealth = useCallback(
    (id: string) => healthMap.get(id) ?? null,
    [healthMap],
  );

  const stationFiltered = useMemo(
    () => filterFleetByStation(vehicles, stationId),
    [vehicles, stationId],
  );

  const baseContexts = useMemo(
    () => buildFleetVehicleContexts(stationFiltered, getHealth),
    [stationFiltered, getHealth],
  );

  const [searchQuery, setSearchQuery] = useState('');
  const searchContexts = useMemo(
    () => filterFleetBySearch(baseContexts, searchQuery),
    [baseContexts, searchQuery],
  );

  const [activeTab, setActiveTab] = useState<FleetCommandTab>('Available');
  const userPickedTabRef = useRef(false);

  const [isStationOpen, setIsStationOpen] = useState(false);
  const [focusNonce, setFocusNonce] = useState(0);
  const [hoveredVehicleId, setHoveredVehicleId] = useState<string | null>(null);
  const [showStationsOnMap, setShowStationsOnMap] = useState(true);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapApiRef = useRef<MapboxMapHandle>(null);
  const listPanelRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const stationOptions = useMemo(
    () => buildStationFilterOptions(stationsApi, vehicles, getHealth),
    [stationsApi, vehicles, getHealth],
  );

  const fleetGeoJson = useMemo(
    () =>
      buildFleetMapGeoJson(stationFiltered, {
        getRentalHealth: (id) => healthMap.get(id) ?? null,
      }),
    [stationFiltered, healthMap],
  );

  const scrollRowIntoView = useCallback((vehicleId: string) => {
    const el = rowRefs.current.get(vehicleId);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);

  const focusFleetVehicle = useCallback(
    (
      ctx: FleetVehicleContext,
      options?: { focusMap?: boolean; switchTab?: boolean },
    ) => {
      setSelectedVehicleId(ctx.vehicle.id);
      if (options?.switchTab !== false) {
        userPickedTabRef.current = true;
        setActiveTab(resolveOperatorTabForVehicle(ctx));
      }
      if (options?.focusMap !== false) {
        setFocusNonce((n) => n + 1);
      }
      requestAnimationFrame(() => scrollRowIntoView(ctx.vehicle.id));
    },
    [scrollRowIntoView, setSelectedVehicleId],
  );

  const openFleetVehicle = useCallback(
    (ctx: FleetVehicleContext) => {
      setSelectedVehicleId(ctx.vehicle.id);
      onVehicleSelect?.(ctx.vehicle);
    },
    [onVehicleSelect, setSelectedVehicleId],
  );

  const registerRowRef = useCallback((vehicleId: string, el: HTMLDivElement | null) => {
    if (el) rowRefs.current.set(vehicleId, el);
    else rowRefs.current.delete(vehicleId);
  }, []);

  const handleRefreshNow = () => {
    void refreshFleetMap();
  };

  const [countdown, setCountdown] = useState(Math.ceil(refreshIntervalMs / 1000));
  useEffect(() => {
    const timer = setInterval(() => {
      if (!lastFetchedAt) {
        setCountdown(Math.ceil(refreshIntervalMs / 1000));
        return;
      }
      const elapsed = Date.now() - lastFetchedAt;
      setCountdown(Math.max(0, Math.ceil((refreshIntervalMs - elapsed) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [lastFetchedAt, refreshIntervalMs]);

  const vehiclesWithCoords = stationFiltered.filter(vehicleHasFleetLocation);
  const noLocationCount = stationFiltered.length - vehiclesWithCoords.length;

  const mapCenter: [number, number] =
    vehiclesWithCoords.length > 0
      ? [
          vehiclesWithCoords.reduce((s, v) => s + v.lng!, 0) / vehiclesWithCoords.length,
          vehiclesWithCoords.reduce((s, v) => s + v.lat!, 0) / vehiclesWithCoords.length,
        ]
      : KASSEL_CENTER;

  const visibleIds = useMemo(() => {
    const tabbed = filterFleetByTab(searchContexts, activeTab);
    return new Set(tabbed.map((c) => c.vehicle.id));
  }, [searchContexts, activeTab]);

  const hiddenSelectedContext = useMemo(() => {
    if (!selectedVehicleId || visibleIds.has(selectedVehicleId)) return null;
    return baseContexts.find((c) => c.vehicle.id === selectedVehicleId) ?? null;
  }, [selectedVehicleId, visibleIds, baseContexts]);

  const mapHudContext = useMemo(() => {
    const id = hoveredVehicleId ?? selectedVehicleId;
    if (!id) return null;
    return baseContexts.find((c) => c.vehicle.id === id) ?? null;
  }, [baseContexts, hoveredVehicleId, selectedVehicleId]);

  const handleTabChange = useCallback((tab: FleetCommandTab) => {
    userPickedTabRef.current = true;
    setActiveTab(tab);
  }, []);

  const handleRevealHiddenSelection = useCallback(() => {
    if (!hiddenSelectedContext) return;
    setSearchQuery('');
    setActiveTab(resolveOperatorTabForVehicle(hiddenSelectedContext));
    requestAnimationFrame(() => scrollRowIntoView(hiddenSelectedContext.vehicle.id));
  }, [hiddenSelectedContext, scrollRowIntoView]);

  const handleRowClick = useCallback(
    (ctx: FleetVehicleContext) => {
      focusFleetVehicle(ctx, { focusMap: true });
      mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    [focusFleetVehicle],
  );

  const handleDetailClick = useCallback(
    (ctx: FleetVehicleContext, e: SyntheticEvent) => {
      e.stopPropagation();
      openFleetVehicle(ctx);
    },
    [openFleetVehicle],
  );

  const handleMapVehicleClick = useCallback(
    (vehicleId: string) => {
      const ctx = baseContexts.find((entry) => entry.vehicle.id === vehicleId);
      if (ctx) focusFleetVehicle(ctx);
    },
    [baseContexts, focusFleetVehicle],
  );

  const selectedStation = stationId || ALL_STATIONS_FILTER;
  const selectedStationLabel =
    stationOptions.find((option) => option.id === selectedStation)?.label ?? 'All Stations';

  const stationFilterControl = (
    <div className="relative shrink-0">
      <button
        onClick={() => setIsStationOpen(!isStationOpen)}
        className="sq-press flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border/60 surface-premium text-[10px] font-medium text-foreground transition-all hover:bg-muted hover:border-border max-w-[min(100vw-2rem,240px)]"
        aria-haspopup="listbox"
        aria-expanded={isStationOpen}
      >
        <Icon name="map-pin" className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground shrink-0">Station</span>
        <span className="text-foreground truncate">{selectedStationLabel}</span>
        <Icon
          name="chevron-down"
          className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 shrink-0 ${isStationOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isStationOpen && (
        <div className="sq-overlay animate-fade-up absolute top-full mt-2 right-0 z-50 min-w-[280px] max-w-[min(100vw-2rem,360px)] max-h-[min(60vh,420px)] overflow-y-auto p-1 rounded-xl">
          {stationOptions.map((station) => (
            <button
              key={station.id}
              onClick={() => {
                setStationFilter(station.id);
                setIsStationOpen(false);
              }}
              className={`w-full px-3 py-2 text-left rounded-lg transition-colors ${
                station.id === selectedStation
                  ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand)]'
                  : 'text-foreground hover:bg-muted'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-medium truncate">{station.label}</span>
                <span className="text-[10px] font-bold tabular-nums text-muted-foreground shrink-0">
                  {station.total}
                </span>
              </div>
              <p className="text-[9.5px] text-muted-foreground mt-0.5">
                {station.ready} ready
                {station.attention > 0 ? ` · ${station.attention} attention` : ''}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      {!embedded && <PageHeader title="Fleet Overview" />}

      {error && (
        <div className="sq-tone-critical rounded-xl px-3 py-2 text-[12px] font-medium animate-fade-up">
          Fleet data could not be loaded: {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:items-stretch">
        <div
          ref={mapRef}
          className="surface-premium rounded-2xl overflow-hidden relative h-[280px] lg:h-[640px] animate-fade-up synq-map-hud-surface"
        >
          <MapSafetyBoundary isDarkMode={systemDark}>
            <MapboxMap
              ref={mapApiRef}
              center={mapCenter}
              zoom={vehiclesWithCoords.length > 0 ? 12 : 5}
              fleetGeoJson={fleetGeoJson}
              selectedVehicleId={selectedVehicleId}
              hoveredVehicleId={hoveredVehicleId}
              focusVehicleId={selectedVehicleId}
              focusNonce={focusNonce}
              onVehicleClick={handleMapVehicleClick}
              onVehicleHover={setHoveredVehicleId}
              className="w-full h-full"
              isDarkMode={systemDark}
              showStations={showStationsOnMap}
              stations={stationsApi}
            />
          </MapSafetyBoundary>
          <FleetMapControls
            lastFetchedAt={lastFetchedAt}
            loading={loading}
            countdownSec={countdown}
            vehicleCount={stationFiltered.length}
            locatedCount={vehiclesWithCoords.length}
            noLocationCount={noLocationCount}
            selectedVehicleId={selectedVehicleId}
            showStations={showStationsOnMap}
            onRefresh={handleRefreshNow}
            onFitAll={() => mapApiRef.current?.fitAll()}
            onLocateSelected={() => setFocusNonce((n) => n + 1)}
            onToggleStations={() => setShowStationsOnMap((v) => !v)}
          />
          <FleetMapVehicleStatusHud ctx={mapHudContext} locale="de" />
          {stationFiltered.length === 0 && !loading && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[5]">
              <div className="sq-map-liquid-empty px-5 py-4 rounded-2xl max-w-[280px] text-center">
                <p className="text-[12px] font-semibold text-foreground">No vehicles in filter</p>
                <p className="text-[11px] mt-1 text-muted-foreground">
                  Adjust the station filter or check fleet assignments
                </p>
              </div>
            </div>
          )}
        </div>

        {loading && vehicles.length === 0 ? (
          <div className="surface-premium rounded-2xl overflow-hidden p-4 lg:h-[640px] space-y-2">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : (
          <FleetCommandPanel
            contexts={searchContexts}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            selectedVehicleId={selectedVehicleId}
            hiddenSelectedVehicle={hiddenSelectedContext}
            onClearSelection={() => setSelectedVehicleId(null)}
            onRevealHiddenSelection={handleRevealHiddenSelection}
            loading={loading}
            totalVehicleCount={stationFiltered.length}
            lastFetchedAt={lastFetchedAt}
            onRefresh={handleRefreshNow}
            refreshing={loading}
            headerAction={stationFilterControl}
            onRowClick={handleRowClick}
            onDetailClick={handleDetailClick}
            registerRowRef={registerRowRef}
            onRowHover={setHoveredVehicleId}
            isDarkMode={systemDark}
            listPanelRef={listPanelRef}
          />
        )}
      </div>
    </div>
  );
}
