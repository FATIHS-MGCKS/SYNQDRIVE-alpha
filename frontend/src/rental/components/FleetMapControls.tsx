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
      {/* Top-right: status + refresh */}
      <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-2 pointer-events-none">
        <LiquidGlassLens
          variant="panel"
          intensity="medium"
          className="pointer-events-auto px-3 py-2 min-w-[9.5rem]"
        >
          <p className="text-[10px] font-semibold tracking-wide text-foreground/90">
            Fleet Map
          </p>
          <p className="text-[9.5px] text-muted-foreground mt-0.5 tabular-nums">
            Updated {formatFleetMapRefreshAgo(lastFetchedAt)}
          </p>
          <p className="text-[9px] text-muted-foreground/80 mt-0.5">
            {loading
              ? 'Refreshing…'
              : `Auto-refresh in ${countdownSec}s`}
          </p>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="sq-map-liquid-action mt-2 w-full py-1.5 px-2 pointer-events-auto disabled:opacity-60"
          >
            <RefreshCw className={`w-3 h-3 shrink-0 ${loading ? 'animate-spin' : ''}`} />
            <span className="text-[9.5px] font-semibold">Refresh now</span>
          </button>
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
          <div className="sq-map-liquid-badge pointer-events-auto px-2.5 py-1.5 max-w-[11rem]">
            <p className="text-[9.5px] font-medium text-foreground/90 leading-snug">
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
          </div>
        )}
      </div>

      {/* Bottom-left: collapsible legend */}
      <div className="absolute bottom-3 left-3 z-10 pointer-events-none max-w-[calc(100%-1.5rem)]">
        <div className="sq-map-liquid-glass sq-map-liquid-glass--panel sq-map-liquid-glass--legend pointer-events-auto overflow-hidden">
          <button
            type="button"
            onClick={() => setLegendOpen((open) => !open)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
          >
            <span className="text-[10px] font-semibold text-foreground/90">
              Legend
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${
                legendOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
          {legendOpen && (
            <div className="px-3 pb-2.5 pt-0 flex flex-wrap gap-x-3 gap-y-1.5 border-t border-[color:var(--map-glass-border)]">
              {FLEET_MAP_LEGEND_ITEMS.map((item) => (
                <div key={item.mapTone} className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full shadow-[0_0_0_1.5px_rgba(255,255,255,0.5)]"
                    style={{ backgroundColor: getFleetMapToneHex(item.mapTone) }}
                  />
                  <span className="text-[9.5px] font-medium text-foreground/75">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
