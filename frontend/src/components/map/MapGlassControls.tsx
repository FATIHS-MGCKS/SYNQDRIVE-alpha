import { Crosshair, Layers, Maximize2 } from 'lucide-react';
import { LiquidGlassLens } from '../surface';
import { cn } from '../ui/utils';

export interface MapGlassControlsProps {
  onFitAll: () => void;
  onLocateSelected: () => void;
  onToggleStations: () => void;
  selectedVehicleId?: string | null;
  showStations: boolean;
  className?: string;
  fitAllLabel?: string;
  locateLabel?: string;
  stationsLabel?: string;
}

export function MapGlassControls({
  onFitAll,
  onLocateSelected,
  onToggleStations,
  selectedVehicleId = null,
  showStations,
  className,
  fitAllLabel = 'Alle',
  locateLabel = 'Auswahl',
  stationsLabel = 'Stationen',
}: MapGlassControlsProps) {
  const locateDisabled = !selectedVehicleId;

  return (
    <div
      className={cn('sq-map-glass-controls-shell', className)}
      role="toolbar"
      aria-label="Kartensteuerung"
    >
      <LiquidGlassLens
        variant="fleetToolbarButton"
        renderMode="lens"
        intensity="subtle"
        className="pointer-events-auto"
      >
        <button
          type="button"
          onClick={onFitAll}
          className="liquid-glass-lens__control-btn sq-map-glass-control-btn"
          aria-label={`${fitAllLabel} — alle Fahrzeuge in Kartenansicht`}
          title={fitAllLabel}
        >
          <Maximize2 className="liquid-glass-lens__control-btn__icon sq-map-glass-control-btn__icon" aria-hidden />
          <span className="liquid-glass-lens__control-btn__label sq-map-glass-control-btn__label">{fitAllLabel}</span>
        </button>
      </LiquidGlassLens>

      <LiquidGlassLens
        variant="fleetToolbarButton"
        renderMode="lens"
        intensity="subtle"
        className="pointer-events-auto"
      >
        <button
          type="button"
          onClick={onLocateSelected}
          disabled={locateDisabled}
          className="liquid-glass-lens__control-btn sq-map-glass-control-btn"
          aria-label={`${locateLabel} — ausgewähltes Fahrzeug zentrieren`}
          title={locateDisabled ? `${locateLabel} (kein Fahrzeug ausgewählt)` : locateLabel}
        >
          <Crosshair className="liquid-glass-lens__control-btn__icon sq-map-glass-control-btn__icon" aria-hidden />
          <span className="liquid-glass-lens__control-btn__label sq-map-glass-control-btn__label">{locateLabel}</span>
        </button>
      </LiquidGlassLens>

      <LiquidGlassLens
        variant="fleetToolbarButton"
        renderMode="lens"
        intensity="subtle"
        className="pointer-events-auto"
      >
        <button
          type="button"
          onClick={onToggleStations}
          aria-pressed={showStations}
          aria-label={showStations ? `${stationsLabel} ausblenden` : `${stationsLabel} einblenden`}
          title={stationsLabel}
          className={cn(
            'liquid-glass-lens__control-btn sq-map-glass-control-btn',
            showStations && 'liquid-glass-lens__control-btn--active sq-map-glass-control-btn--active',
          )}
        >
          <Layers className="liquid-glass-lens__control-btn__icon sq-map-glass-control-btn__icon" aria-hidden />
          <span className="liquid-glass-lens__control-btn__label sq-map-glass-control-btn__label">{stationsLabel}</span>
        </button>
      </LiquidGlassLens>
    </div>
  );
}
