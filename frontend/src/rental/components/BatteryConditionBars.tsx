import type { BatteryHealthStatus, BatteryAggregateStatus, BatteryRestingVoltageStatus } from '../../lib/api';

type AnyBatteryStatus = BatteryHealthStatus | BatteryAggregateStatus | BatteryRestingVoltageStatus;

interface StatusStyle {
  /** Number of filled bars (out of 3). */
  bars: 0 | 1 | 2 | 3;
  label: string;
  /** Tailwind class for a filled bar / dot. */
  fill: string;
  /** Tailwind class for the textual badge (light mode). */
  textLight: string;
  /** Tailwind class for the textual badge (dark mode). */
  textDark: string;
}

const STATUS_STYLES: Record<AnyBatteryStatus, StatusStyle> = {
  GOOD: { bars: 3, label: 'Good', fill: 'bg-emerald-500', textLight: 'text-emerald-700', textDark: 'text-emerald-400' },
  WATCH: { bars: 2, label: 'Watch', fill: 'bg-amber-500', textLight: 'text-amber-700', textDark: 'text-amber-400' },
  WARNING: { bars: 1, label: 'Warning', fill: 'bg-orange-500', textLight: 'text-orange-700', textDark: 'text-orange-400' },
  CRITICAL: { bars: 1, label: 'Critical', fill: 'bg-red-500', textLight: 'text-red-700', textDark: 'text-red-400' },
  UNKNOWN: { bars: 0, label: 'Unknown', fill: 'bg-gray-400', textLight: 'text-gray-500', textDark: 'text-gray-400' },
  UNSUPPORTED: { bars: 0, label: 'Not rated', fill: 'bg-gray-400', textLight: 'text-gray-500', textDark: 'text-gray-400' },
};

const SIZES = {
  sm: { w: 'w-1.5', h: 'h-3', gap: 'gap-0.5', text: 'text-[10px]' },
  md: { w: 'w-2', h: 'h-4', gap: 'gap-1', text: 'text-xs' },
  lg: { w: 'w-2.5', h: 'h-6', gap: 'gap-1', text: 'text-sm' },
} as const;

interface BatteryConditionBarsProps {
  status: AnyBatteryStatus | null | undefined;
  /** Override the bar count (CRITICAL still renders red). Defaults from status. */
  bars?: 0 | 1 | 2 | 3;
  isDarkMode: boolean;
  size?: keyof typeof SIZES;
  /** Show the textual status label next to the bars. */
  showLabel?: boolean;
  /** Override the label text (e.g. when the backend supplies its own). */
  labelOverride?: string;
  className?: string;
}

/**
 * Reusable 3-level battery condition indicator.
 *   GOOD → 3 green bars · WATCH → 2 amber · WARNING → 1 orange ·
 *   CRITICAL → 1 red · UNKNOWN / UNSUPPORTED → 0 (greyed).
 *
 * Used for the LV "Estimated Battery Health" indicator so the 12 V battery is
 * never shown as a workshop-verified SOH percentage.
 */
export function BatteryConditionBars({
  status,
  bars,
  isDarkMode,
  size = 'md',
  showLabel = true,
  labelOverride,
  className = '',
}: BatteryConditionBarsProps) {
  const style = STATUS_STYLES[(status as AnyBatteryStatus) ?? 'UNKNOWN'] ?? STATUS_STYLES.UNKNOWN;
  const filled = bars ?? style.bars;
  const dims = SIZES[size];
  const emptyBar = isDarkMode ? 'bg-white/10' : 'bg-black/10';

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <div className={`inline-flex items-end ${dims.gap}`} role="img" aria-label={`${style.label} — ${filled} of 3`}>
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={`${dims.w} ${dims.h} rounded-sm transition-colors ${i <= filled ? style.fill : emptyBar}`}
          />
        ))}
      </div>
      {showLabel && (
        <span className={`${dims.text} font-bold tracking-tight ${isDarkMode ? style.textDark : style.textLight}`}>
          {labelOverride ?? style.label}
        </span>
      )}
    </div>
  );
}

/** Small inline pill that shows a resting-voltage value + its status colour. */
export function RestingVoltageBadge({
  valueV,
  status,
  isDarkMode,
  className = '',
}: {
  valueV: number | null | undefined;
  status: BatteryRestingVoltageStatus | null | undefined;
  isDarkMode: boolean;
  className?: string;
}) {
  const style = STATUS_STYLES[(status as AnyBatteryStatus) ?? 'UNKNOWN'] ?? STATUS_STYLES.UNKNOWN;
  const text = isDarkMode ? style.textDark : style.textLight;
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="text-xs font-bold text-foreground tabular-nums">
        {valueV != null ? `${valueV.toFixed(2)} V` : '—'}
      </span>
      {status && status !== 'UNKNOWN' && status !== 'UNSUPPORTED' && (
        <>
          <span className={`w-1.5 h-1.5 rounded-full ${style.fill}`} />
          <span className={`text-[10px] font-bold uppercase tracking-wider ${text}`}>{style.label}</span>
        </>
      )}
    </span>
  );
}
