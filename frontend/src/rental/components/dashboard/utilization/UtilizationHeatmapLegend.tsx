import { cn } from '../../../../components/ui/utils';
import {
  UTILIZATION_HEATMAP_LEGEND_TONES,
  utilizationHeatmapCellClass,
} from './utilizationHeatmapTone';

interface UtilizationHeatmapLegendProps {
  label: string;
  ticks: readonly string[];
  className?: string;
}

export function UtilizationHeatmapLegend({ label, ticks, className }: UtilizationHeatmapLegendProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
        <span className="text-[9px] tabular-nums text-muted-foreground">0% — 100%</span>
      </div>
      <div
        className="grid grid-cols-6 overflow-hidden rounded-full"
        role="img"
        aria-label={label}
      >
        {UTILIZATION_HEATMAP_LEGEND_TONES.map((tone) => (
          <div key={tone} className={cn('h-1.5', utilizationHeatmapCellClass(tone))} />
        ))}
      </div>
      <div className="grid grid-cols-6 text-center text-[8px] tabular-nums text-muted-foreground">
        {ticks.map((tick) => (
          <span key={tick}>{tick}</span>
        ))}
      </div>
    </div>
  );
}
