import { useState } from 'react';
import {
  ChevronDown,
  MapPin,
  RefreshCw,
} from 'lucide-react';
import { LiquidGlassLens } from '../../components/surface';
import { MapGlassControls } from '../../components/map/MapGlassControls';
import {
  FLEET_MAP_LEGEND_ITEMS,
  getFleetMapToneHex,
} from '../lib/fleetVisualState';
import { formatFleetMapRefreshAgo } from '../lib/fleet-map-sync';

export interface FleetMapControlsProps {
  lastFetchedAt: number | null;
  loading: boolean;
  countdownSec: number;
  vehicleCount: number;
  locatedCount: number;
  noLocationCount: number;
  selectedVehicleId: string | null;
  showStations: boolean;
  onRefresh: () => void;
  onFitAll: () => void;
  onLocateSelected: () => void;
  onToggleStations: () => void;
}

export function FleetMapControls({
  lastFetchedAt,
  loading,
  countdownSec,
  vehicleCount,
  locatedCount,
  noLocationCount,
  selectedVehicleId,
  showStations,
  onRefresh,
  onFitAll,
  onLocateSelected,
  onToggleStations,
}: FleetMapControlsProps) {
  const [legendOpen, setLegendOpen] = useState(false);

  return (
    <>
      {/* Top-right: status + refresh — shell panel, lens action */}
      <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-2 pointer-events-none">
        <LiquidGlassLens
          variant="fleetPanel"
          renderMode="shell"
          intensity="medium"
          className="pointer-events-auto"
        >
          <p className="text-[10px] font-semibold tracking-wide text-foreground">
            Fleet Map
          </p>
          <p className="text-[9.5px] text-muted-foreground mt-0.5 tabular-nums">
            Updated {formatFleetMapRefreshAgo(lastFetchedAt)}
          </p>
          <p className="text-[9px] text-muted-foreground/85 mt-0.5">
            {loading
              ? 'Refreshing…'
              : `Auto-refresh in ${countdownSec}s`}
          </p>
          <LiquidGlassLens
            variant="fleetPanelAction"
            renderMode="lens"
            intensity="subtle"
            className="pointer-events-auto"
          >
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="liquid-glass-lens__panel-action sq-map-liquid-action"
            >
              <RefreshCw className={`w-3 h-3 shrink-0 ${loading ? 'animate-spin' : ''}`} />
              <span className="text-[9.5px] font-semibold">Refresh now</span>
            </button>
          </LiquidGlassLens>
        </LiquidGlassLens>
      </div>

      {/* Top-left: map actions */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5 pointer-events-none">
        <MapGlassControls
          onFitAll={onFitAll}
          onLocateSelected={onLocateSelected}
          onToggleStations={onToggleStations}
          selectedVehicleId={selectedVehicleId}
          showStations={showStations}
        />

        {(vehicleCount === 0 || noLocationCount > 0) && (
          <LiquidGlassLens
            variant="fleetMiniPill"
            renderMode="lens"
            intensity="subtle"
            className="pointer-events-auto"
          >
            <p className="text-[9.5px] font-medium text-foreground leading-snug">
              {vehicleCount === 0
                ? 'No vehicles in current filter'
                : `${noLocationCount} without GPS`}
            </p>
            {vehicleCount > 0 && noLocationCount > 0 && (
              <p className="text-[9px] text-muted-foreground mt-0.5 flex items-center gap-1">
                <MapPin className="w-2.5 h-2.5 shrink-0" />
                Listed in panel, not on map
              </p>
            )}
          </LiquidGlassLens>
        )}
      </div>

      {/* Bottom-left: collapsible legend — lens trigger + shell body, clear of Mapbox logo */}
      <div className="absolute bottom-11 left-11 z-10 pointer-events-none max-w-[calc(100%-3.5rem)] sm:bottom-12 sm:left-12">
        <div className="liquid-glass-lens__legend-stack pointer-events-auto">
          <LiquidGlassLens
            variant="fleetMiniPill"
            renderMode="lens"
            intensity="subtle"
            className="liquid-glass-lens--legendTrigger"
          >
            <button
              type="button"
              onClick={() => setLegendOpen((open) => !open)}
              className="liquid-glass-lens__legend-trigger"
              aria-expanded={legendOpen}
            >
              <span className="text-[10px] font-semibold text-foreground">Legend</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${
                  legendOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
          </LiquidGlassLens>

          {legendOpen && (
            <LiquidGlassLens
              variant="fleetLegend"
              renderMode="shell"
              intensity="subtle"
              className="w-full min-w-[10rem]"
            >
              <div className="liquid-glass-lens__legend-body">
                {FLEET_MAP_LEGEND_ITEMS.map((item) => (
                  <div key={item.mapTone} className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full shadow-[0_0_0_1.5px_rgba(255,255,255,0.5)]"
                      style={{ backgroundColor: getFleetMapToneHex(item.mapTone) }}
                    />
                    <span className="text-[9.5px] font-medium text-foreground/85">
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </LiquidGlassLens>
          )}
        </div>
      </div>
    </>
  );
}
