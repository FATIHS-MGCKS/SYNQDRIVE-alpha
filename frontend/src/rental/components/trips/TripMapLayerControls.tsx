import { Icon } from '../ui/Icon';
import { LiquidGlassLens } from '../../../components/surface';
import { TRIPS_COPY, tv } from './trips-view-ui';
import type { TripMapLayerState } from './trips-map.types';

interface TripMapLayerControlsProps {
  layers: TripMapLayerState;
  hasMatchedGeometry: boolean;
  hasRoute: boolean;
  onToggle: (key: keyof TripMapLayerState) => void;
}

type LayerChip = {
  key: keyof TripMapLayerState;
  label: string;
  icon: string;
  activeClass: string;
};

const CHIPS: LayerChip[] = [
  { key: 'showSpeed', label: 'Geschwindigkeit', icon: 'gauge', activeClass: 'bg-status-info-soft text-status-info border-status-info/25' },
  { key: 'showStops', label: 'Stopps', icon: 'clock', activeClass: 'bg-status-nodata-soft text-status-nodata border-status-nodata/25' },
  { key: 'showDrivingEvents', label: 'Ereignisse', icon: 'zap', activeClass: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/25' },
  { key: 'showAbuseEvents', label: 'Missbrauch', icon: 'shield', activeClass: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/25' },
];

export function TripMapLayerControls({
  layers,
  hasMatchedGeometry,
  hasRoute,
  onToggle,
}: TripMapLayerControlsProps) {
  if (!hasRoute) return null;

  const allChips = hasMatchedGeometry
    ? [
        ...CHIPS,
        {
          key: 'showMatchedRoute' as const,
          label: 'Abgeglichene Route',
          icon: 'route',
          activeClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25',
        },
      ]
    : CHIPS;

  return (
    <div className="pointer-events-none absolute bottom-[4.75rem] left-2.5 right-2.5 z-20 flex justify-center sm:bottom-[5.25rem] sm:left-11 sm:right-11">
      <LiquidGlassLens
        variant="fleetLegend"
        renderMode="shell"
        intensity="subtle"
        className="pointer-events-auto w-full max-w-full sm:max-w-none"
      >
        <div className="liquid-glass-lens__layer-bar">
          {allChips.map((chip) => {
            const active = layers[chip.key];
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => onToggle(chip.key)}
                className={`liquid-glass-lens__layer-chip ${tv.focusRing} ${
                  active
                    ? chip.activeClass
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon name={chip.icon} className="w-3 h-3 shrink-0" />
                <span className="hidden sm:inline">{chip.label}</span>
                <span className="sm:hidden">{chip.label.split(' ')[0]}</span>
              </button>
            );
          })}
          <span className="liquid-glass-lens__layer-hint">
            {TRIPS_COPY.speed} 0–160+
          </span>
        </div>
      </LiquidGlassLens>
    </div>
  );
}
