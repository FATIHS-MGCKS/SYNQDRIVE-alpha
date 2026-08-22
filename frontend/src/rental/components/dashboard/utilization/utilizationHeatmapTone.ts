export type UtilizationHeatmapTone =
  | 'neutral'
  | 'level1'
  | 'level2'
  | 'level3'
  | 'level4'
  | 'level5';

export function utilizationHeatmapTone(percent: number | null): UtilizationHeatmapTone {
  if (percent === null || percent <= 0) return 'neutral';
  if (percent <= 20) return 'level1';
  if (percent <= 40) return 'level2';
  if (percent <= 60) return 'level3';
  if (percent <= 80) return 'level4';
  return 'level5';
}

export function utilizationHeatmapCellClass(tone: UtilizationHeatmapTone): string {
  switch (tone) {
    case 'neutral':
      return 'bg-card text-foreground border border-border/30';
    case 'level1':
      return 'bg-[color:var(--brand-soft)] text-foreground';
    case 'level2':
      return 'bg-[color:var(--brand)]/20 text-foreground';
    case 'level3':
      return 'bg-[color:var(--brand)]/35 text-foreground';
    case 'level4':
      return 'bg-[color:var(--brand)]/55 text-white';
    case 'level5':
      return 'bg-[color:var(--brand)] text-[color:var(--brand-foreground)]';
    default:
      return 'bg-card text-foreground border border-border/30';
  }
}

export const UTILIZATION_HEATMAP_LEGEND_TONES: UtilizationHeatmapTone[] = [
  'neutral',
  'level1',
  'level2',
  'level3',
  'level4',
  'level5',
];

export function formatUtilizationDeltaPp(value: number | null): string | null {
  if (value === null) return null;
  const sign = value > 0 ? '+' : '';
  return `${sign}${value} PP`;
}

export function formatBookingDeltaPercent(value: number | null): string | null {
  if (value === null) return null;
  const sign = value > 0 ? '+' : '';
  return `${sign}${value} %`;
}

export function formatUtilizationPercent(value: number | null): string {
  if (value === null) return '—';
  return `${Math.round(value)} %`;
}
