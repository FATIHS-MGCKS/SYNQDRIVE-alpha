import type { TireDisplayMode, TireHealthSummaryResponse, TireWheelEstimate } from '../../lib/api';

export const TIRE_FORECAST_QUALITY_SUBTEXT =
  'Forecast based on tread baseline, mileage, usage profile and driving behavior.';

export const TIRE_MANUAL_MEASUREMENT_HINT =
  'Manual measurements improve the remaining-life forecast and keep tire values up to date.';

export const TIRE_TREAD_LIFE_SCORE_HINT =
  'Tread life score — reflects remaining tread life, not a direct mm percentage.';

export function tireForecastBadgeLabel(displayMode?: TireDisplayMode | string | null): string {
  if (displayMode === 'MEASURED') return 'Measured · Forecast';
  if (displayMode === 'ESTIMATED') return 'ML forecast';
  return 'ML forecast';
}

export function formatLowestTreadLine(
  mm: number,
  position: string | null | undefined,
  displayMode?: TireDisplayMode | string | null,
): { prefix: string; value: string; suffix: string } {
  const posSuffix = position ? ` · ${position}` : '';
  if (displayMode === 'MEASURED') {
    return {
      prefix: 'Lowest measured tread:',
      value: `${mm.toFixed(1)} mm`,
      suffix: posSuffix,
    };
  }
  return {
    prefix: 'Lowest estimated tread:',
    value: `ca. ${mm.toFixed(1)} mm`,
    suffix: posSuffix,
  };
}

export function wheelIsMeasured(wheel: TireWheelEstimate): boolean {
  return wheel.lastMeasuredMm != null && Number.isFinite(wheel.lastMeasuredMm);
}

export function wheelMeasurementBadge(wheel: TireWheelEstimate): 'Measured' | 'Estimated' | null {
  if (wheel.treadMm <= 0 && wheel.lastMeasuredMm == null) return null;
  return wheelIsMeasured(wheel) ? 'Measured' : 'Estimated';
}

export function formatWheelLastMeasured(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export const WHEEL_POSITIONS = ['FL', 'FR', 'RL', 'RR'] as const;

export type WheelPosition = (typeof WHEEL_POSITIONS)[number];

export function resolveWheelByPosition(
  wheels: TireWheelEstimate[] | undefined,
  position: WheelPosition,
  fallback?: Partial<Record<WheelPosition, number>>,
): TireWheelEstimate | null {
  const fromDetail = wheels?.find((w) => w.position === position);
  if (fromDetail) return fromDetail;
  const mm = fallback?.[position];
  if (mm == null || !Number.isFinite(mm) || mm <= 0) return null;
  return {
    position,
    treadMm: mm,
    wearPercent: 0,
    remainingKm: 0,
    healthStatus: 'UNKNOWN',
    initialTreadMm: 0,
    lastMeasuredMm: null,
    lastMeasuredAt: null,
    confidenceScore: 0,
    confidenceLabel: '',
    brand: null,
    tireModel: null,
    size: null,
    totalKm: 0,
    cityKm: 0,
    highwayKm: 0,
    ruralKm: 0,
  };
}

/** Quick-card label for next manual measurement — uses only existing summary fields. */
export function formatTireQuickNextMeasurementLabel(
  summary: Pick<TireHealthSummaryResponse, 'actionState' | 'recommendations'> | null | undefined,
): string {
  if (!summary) return '—';
  if (summary.actionState === 'CHECK_SOON') return 'empfohlen';
  const rec = summary.recommendations?.find((r) => /re-measure|measurement|messung/i.test(r));
  if (!rec) return '—';
  if (/overdue/i.test(rec)) return 'überfällig';
  return 'empfohlen';
}

export function treadMmColorClass(mm: number): string {
  if (mm <= 0) return 'text-muted-foreground';
  if (mm >= 4) return 'text-[color:var(--status-positive)]';
  if (mm >= 2.5) return 'text-[color:var(--status-watch)]';
  return 'text-[color:var(--status-critical)]';
}
