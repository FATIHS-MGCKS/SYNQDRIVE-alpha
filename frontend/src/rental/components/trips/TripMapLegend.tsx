import { TRIPS_COPY } from './trips-view-ui';

export function TripMapLegend() {
  return (
    <div className="pointer-events-none absolute bottom-2.5 left-2.5 z-10">
      <div className="sq-map-liquid-glass pointer-events-auto px-2.5 py-1.5 flex items-center gap-2.5 flex-wrap">
        <LegendItem color="bg-status-info" label={TRIPS_COPY.slow} line />
        <LegendItem color="bg-green-500" label={TRIPS_COPY.normal} line />
        <LegendItem color="bg-yellow-500" label={TRIPS_COPY.fast} line />
        <LegendItem color="border-muted-foreground" label={TRIPS_COPY.stop} ring />
        <LegendItem color="bg-emerald-500" label="Start" letter="A" />
        <LegendItem color="bg-red-500" label="Ziel" letter="B" />
      </div>
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
    <div className="flex items-center gap-1">
      {line && <span className={`w-3 h-0.5 rounded-full ${color}`} />}
      {ring && <span className={`w-2.5 h-2.5 rounded-full border-2 ${color}`} />}
      {letter && (
        <span className={`w-3.5 h-3.5 rounded-full ${color} text-[7px] font-bold text-white flex items-center justify-center`}>
          {letter}
        </span>
      )}
      <span className="text-[8px] text-muted-foreground">{label}</span>
    </div>
  );
}
