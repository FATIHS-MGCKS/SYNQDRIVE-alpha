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
    <LiquidGlassLens
      variant="control"
      intensity="medium"
      className={cn('pointer-events-auto', className)}
      role="toolbar"
      aria-label="Kartensteuerung"
    >
      <button
        type="button"
        onClick={onFitAll}
        className="sq-map-glass-control-btn"
        aria-label={`${fitAllLabel} — alle Fahrzeuge in Kartenansicht`}
        title={fitAllLabel}
      >
        <Maximize2 className="sq-map-glass-control-btn__icon" aria-hidden />
        <span className="sq-map-glass-control-btn__label">{fitAllLabel}</span>
      </button>

      <button
        type="button"
        onClick={onLocateSelected}
        disabled={locateDisabled}
        className="sq-map-glass-control-btn"
        aria-label={`${locateLabel} — ausgewähltes Fahrzeug zentrieren`}
        title={locateDisabled ? `${locateLabel} (kein Fahrzeug ausgewählt)` : locateLabel}
      >
        <Crosshair className="sq-map-glass-control-btn__icon" aria-hidden />
        <span className="sq-map-glass-control-btn__label">{locateLabel}</span>
      </button>

      <button
        type="button"
        onClick={onToggleStations}
        aria-pressed={showStations}
        aria-label={showStations ? `${stationsLabel} ausblenden` : `${stationsLabel} einblenden`}
        title={stationsLabel}
        className={cn('sq-map-glass-control-btn', showStations && 'sq-map-glass-control-btn--active')}
      >
        <Layers className="sq-map-glass-control-btn__icon" aria-hidden />
        <span className="sq-map-glass-control-btn__label">{stationsLabel}</span>
      </button>
    </LiquidGlassLens>
  );
}
