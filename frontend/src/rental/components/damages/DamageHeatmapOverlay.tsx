import type { HeatmapCell } from '../../lib/damage.types';

const GRID_SIZE = 8;

interface DamageHeatmapOverlayProps {
  cells: HeatmapCell[];
  gridSize?: number;
}

export function DamageHeatmapOverlay({ cells, gridSize = GRID_SIZE }: DamageHeatmapOverlayProps) {
  if (!cells.length) return null;

  const maxCount = Math.max(...cells.map((c) => c.count));
  const cellSizePercent = 100 / gridSize;

  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden>
      {cells.map((cell) => {
        const intensity = maxCount > 0 ? cell.count / maxCount : 0;
        return (
          <div
            key={`${cell.gridX}-${cell.gridY}`}
            className="absolute rounded-sm border border-amber-500/20"
            style={{
              left: `${cell.gridX * cellSizePercent}%`,
              top: `${cell.gridY * cellSizePercent}%`,
              width: `${cellSizePercent}%`,
              height: `${cellSizePercent}%`,
              backgroundColor: `rgba(245, 158, 11, ${0.12 + intensity * 0.35})`,
            }}
          />
        );
      })}
    </div>
  );
}
