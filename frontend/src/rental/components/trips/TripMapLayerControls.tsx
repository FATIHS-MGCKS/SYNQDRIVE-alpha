import { Icon } from '../ui/Icon';
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
  { key: 'showSpeed', label: 'Geschwindigkeit', icon: 'gauge', activeClass: 'bg-blue-500/15 text-blue-600 dark:bg-status-info-soft dark:text-status-info border-blue-500/25 dark:border-status-info/25' },
  { key: 'showStops', label: 'Stopps', icon: 'clock', activeClass: 'bg-slate-500/15 text-slate-600 dark:bg-status-nodata-soft dark:text-status-nodata border-slate-500/25 dark:border-status-nodata/25' },
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
    <div className="pointer-events-none absolute bottom-14 left-2.5 right-2.5 z-20 flex justify-center sm:justify-start">
      <div className="sq-map-liquid-glass pointer-events-auto px-2 py-1.5 flex flex-wrap items-center gap-1 max-w-full">
        {allChips.map((chip) => {
          const active = layers[chip.key];
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => onToggle(chip.key)}
              className={`${tv.focusRing} inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-semibold transition-colors ${
                active
                  ? chip.activeClass
                  : 'border-transparent bg-transparent text-muted-foreground hover:bg-muted/50'
              }`}
            >
              <Icon name={chip.icon} className="w-3 h-3 shrink-0" />
              <span className="hidden sm:inline">{chip.label}</span>
              <span className="sm:hidden">{chip.label.split(' ')[0]}</span>
            </button>
          );
        })}
        <span className="hidden md:inline text-[8px] text-muted-foreground pl-1 border-l border-border/60 ml-0.5">
          {TRIPS_COPY.speed} 0–160+
        </span>
      </div>
    </div>
  );
}
