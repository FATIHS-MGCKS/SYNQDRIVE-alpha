import type { LvMeasuredVoltagePointV1 } from './lv-measured-intelligence.types';

/** Gaps longer than this break the voltage line (no interpolation across outages). */
export const LV_VOLTAGE_CHART_MAX_GAP_MS = 6 * 60 * 60 * 1000;

export type LvVoltageChartPoint = {
  t: number;
  v: number;
  label: string;
  context: string;
  evidenceClass: string;
  ladder: string | null;
  restHours: number | null;
  segmentId: number;
};

export type LvVoltageChartSegment = {
  segmentId: number;
  points: LvVoltageChartPoint[];
};

export function formatChartTimestamp(isoOrMs: string | number, timeZone?: string): string {
  const d = typeof isoOrMs === 'number' ? new Date(isoOrMs) : new Date(isoOrMs);
  return d.toLocaleString(undefined, {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function mapMeasuredPointsToChartPoints(
  points: LvMeasuredVoltagePointV1[],
  maxGapMs: number = LV_VOLTAGE_CHART_MAX_GAP_MS,
): LvVoltageChartPoint[] {
  const sorted = [...points].sort(
    (a, b) => new Date(a.voltageObservedAt).getTime() - new Date(b.voltageObservedAt).getTime(),
  );

  let segmentId = 0;
  const out: LvVoltageChartPoint[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const t = new Date(p.voltageObservedAt).getTime();
    if (i > 0) {
      const prevT = out[out.length - 1]?.t;
      if (prevT != null && t - prevT > maxGapMs) {
        segmentId += 1;
      }
    }
    out.push({
      t,
      v: p.voltageV,
      label: formatChartTimestamp(t),
      context: p.operationalContext,
      evidenceClass: p.evidenceClass,
      ladder: p.nominalLadderLabel,
      restHours: p.actualRestAgeHours,
      segmentId,
    });
  }

  return out;
}

export function groupChartPointsBySegment(points: LvVoltageChartPoint[]): LvVoltageChartSegment[] {
  const map = new Map<number, LvVoltageChartPoint[]>();
  for (const p of points) {
    const list = map.get(p.segmentId) ?? [];
    list.push(p);
    map.set(p.segmentId, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([segmentId, segmentPoints]) => ({ segmentId, points: segmentPoints }));
}

export type LvVoltageChartRenderablePoint = Omit<LvVoltageChartPoint, 'v'> & { v: number | null };

/** Inserts null voltage rows so Recharts does not connect across long gaps. */
export function chartPointsWithGapBreaks(
  points: LvVoltageChartPoint[],
  maxGapMs: number = LV_VOLTAGE_CHART_MAX_GAP_MS,
): LvVoltageChartRenderablePoint[] {
  if (points.length === 0) return [];
  const out: LvVoltageChartRenderablePoint[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (points[i].t - points[i - 1].t > maxGapMs) {
      out.push({ ...points[i - 1], v: null });
    }
    out.push(points[i]);
  }
  return out;
}

export function countMeasurementGaps(
  points: LvVoltageChartPoint[],
  maxGapMs: number = LV_VOLTAGE_CHART_MAX_GAP_MS,
): number {
  if (points.length < 2) return 0;
  let gaps = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].t - points[i - 1].t > maxGapMs) gaps += 1;
  }
  return gaps;
}

/** `datetime-local` values are interpreted in the browser local timezone. */
export function toDatetimeLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function parseDatetimeLocalInputValue(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid datetime-local value');
  }
  return parsed;
}

export const LV_MEASURED_DEFAULT_DATE_RANGE_DAYS = 14;

export function defaultMeasuredHistoryFromDate(now = new Date()): Date {
  const d = new Date(now);
  d.setDate(d.getDate() - LV_MEASURED_DEFAULT_DATE_RANGE_DAYS);
  return d;
}
