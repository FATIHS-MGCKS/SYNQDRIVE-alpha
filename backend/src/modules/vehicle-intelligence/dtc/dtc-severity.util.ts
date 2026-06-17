/** Normalized DTC severity band for aggregation across DTC + Rental Health. */
export type DtcSeverityBand = 'critical' | 'warning' | 'info' | 'unknown';

const CRITICAL_SEVERITIES = new Set([
  'critical',
  'high',
  'severe',
  'danger',
  'safety_critical',
  'safetycritical',
]);

const WARNING_SEVERITIES = new Set([
  'warning',
  'medium',
  'moderate',
  'watch',
]);

const INFO_SEVERITIES = new Set(['low', 'info', 'minor', 'informational']);

/**
 * Normalize raw DTC severity strings (Prisma enum, DIMO, OEM labels) into a
 * stable band. Unknown/missing severity must not be treated as healthy.
 */
export function normalizeDtcSeverityBand(
  severity: string | null | undefined,
): DtcSeverityBand {
  const raw = (severity ?? '').trim();
  if (!raw) return 'unknown';

  const normalized = raw.toLowerCase().replace(/[\s-]+/g, '_');

  if (CRITICAL_SEVERITIES.has(normalized)) return 'critical';
  if (WARNING_SEVERITIES.has(normalized)) return 'warning';
  if (INFO_SEVERITIES.has(normalized)) return 'info';

  return 'unknown';
}

const BAND_RANK: Record<DtcSeverityBand, number> = {
  unknown: 0,
  info: 1,
  warning: 2,
  critical: 3,
};

export function maxDtcSeverityBand(bands: DtcSeverityBand[]): DtcSeverityBand {
  if (bands.length === 0) return 'unknown';
  return bands.reduce(
    (max, band) => (BAND_RANK[band] > BAND_RANK[max] ? band : max),
    'unknown' as DtcSeverityBand,
  );
}

/** UI display label — backward compatible with existing preview consumers. */
export function dtcSeverityBandToDisplay(
  band: DtcSeverityBand,
): 'low' | 'medium' | 'high' {
  switch (band) {
    case 'critical':
      return 'high';
    case 'warning':
      return 'medium';
    default:
      return 'low';
  }
}

export function getSeverityDisplay(
  severity: string | null | undefined,
): 'low' | 'medium' | 'high' {
  return dtcSeverityBandToDisplay(normalizeDtcSeverityBand(severity));
}

/** Rental-health mapping — active faults are never `good`. */
export function dtcBandToHealthState(
  band: DtcSeverityBand,
): 'good' | 'warning' | 'critical' | 'unknown' | 'n_a' {
  switch (band) {
    case 'critical':
      return 'critical';
    case 'warning':
    case 'info':
    case 'unknown':
    default:
      return 'warning';
  }
}

export function isSafetyCriticalDtcBand(band: DtcSeverityBand): boolean {
  return band === 'critical';
}
