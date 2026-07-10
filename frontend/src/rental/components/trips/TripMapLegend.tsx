import { LiquidGlassLens } from '../../../components/surface';
import { TRIPS_COPY } from './trips-view-ui';

export function TripMapLegend() {
  return (
    <div className="pointer-events-none absolute bottom-11 left-11 z-10 max-w-[calc(100%-5.5rem)] sm:bottom-12 sm:left-12">
      <LiquidGlassLens
        variant="fleetLegend"
        renderMode="shell"
        intensity="subtle"
        className="pointer-events-auto w-full min-w-[10rem]"
      >
        <div className="liquid-glass-lens__trip-legend">
          <LegendItem color="bg-status-info" label={TRIPS_COPY.slow} line />
          <LegendItem color="bg-green-500" label={TRIPS_COPY.normal} line />
          <LegendItem color="bg-yellow-500" label={TRIPS_COPY.fast} line />
          <LegendItem color="border-muted-foreground" label={TRIPS_COPY.stop} ring />
          <LegendItem color="bg-emerald-500" label="Start" letter="A" />
          <LegendItem color="bg-red-500" label="Ziel" letter="B" />
        </div>
      </LiquidGlassLens>
    </div>
  );
}

function LegendItem({
  color,
  label,
  line,
  ring,
  letter,
}: {
  color: string;
  label: string;
  line?: boolean;
  ring?: boolean;
  letter?: string;
}) {
  return (
    <div className="liquid-glass-lens__trip-legend-item">
      {line && <span className={`w-3 h-0.5 rounded-full ${color}`} />}
      {ring && <span className={`w-2.5 h-2.5 rounded-full border-2 ${color}`} />}
      {letter && (
        <span
          className={`w-3.5 h-3.5 rounded-full ${color} text-[7px] font-bold text-white flex items-center justify-center`}
        >
          {letter}
        </span>
      )}
      <span className="liquid-glass-lens__trip-legend-label">{label}</span>
    </div>
  );
}
