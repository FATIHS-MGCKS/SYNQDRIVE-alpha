export type SegmentLevel = 0 | 1 | 2 | 3;
export type SegmentTone = 'good' | 'warning' | 'critical' | 'neutral';

export interface HealthSegmentDisplay {
  level: SegmentLevel;
  tone: SegmentTone;
  label: string;
}

function normalizeStatus(status: unknown): string {
  return String(status ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ');
}

function segmentFromPercent(percent: number | null | undefined): HealthSegmentDisplay {
  if (percent == null || !Number.isFinite(percent)) {
    return { level: 0, tone: 'neutral', label: 'No Data' };
  }
  if (percent >= 67) return { level: 3, tone: 'good', label: 'Good' };
  if (percent >= 34) return { level: 2, tone: 'warning', label: 'Monitor' };
  return { level: 1, tone: 'critical', label: 'Critical' };
}

export function segmentFromHealthState(
  status: unknown,
  percentFallback?: number | null,
  levelOverride?: SegmentLevel | null,
): HealthSegmentDisplay {
  const normalized = normalizeStatus(status);

  let display: HealthSegmentDisplay;
  if (['good', 'healthy', 'excellent', 'ok', 'success', 'normal'].includes(normalized)) {
    display = { level: 3, tone: 'good', label: 'Good' };
  } else if (['watch', 'warning', 'attention', 'due soon', 'monitor', 'estimated'].includes(normalized)) {
    display = { level: 2, tone: 'warning', label: normalized === 'warning' ? 'Warning' : 'Monitor' };
  } else if (['critical', 'fault', 'failed', 'failure', 'overdue', 'blocked'].includes(normalized)) {
    display = { level: 1, tone: 'critical', label: 'Critical' };
  } else if (normalized === '' && percentFallback != null) {
    display = segmentFromPercent(percentFallback);
  } else if (
    [
      'unknown',
      'no data',
      'nodata',
      'n a',
      'n/a',
      'untracked',
      'disabled',
      'unsupported',
      'no tracking',
    ].includes(normalized)
  ) {
    display = { level: 0, tone: 'neutral', label: 'No Data' };
  } else {
    display = segmentFromPercent(percentFallback);
  }

  if (levelOverride != null) {
    return {
      ...display,
      level: levelOverride,
      tone: levelOverride === 0 ? 'neutral' : display.tone,
    };
  }

  return display;
}

