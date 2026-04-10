/** Floor odometer to whole kilometers (no decimals). */
export function formatOdometerKmFloor(km: number | null | undefined): string {
  if (km == null || Number.isNaN(km)) return '—';
  return `${Math.floor(km).toLocaleString('de-DE')} km`;
}

/** Ceil fuel / energy percentage, no decimals. */
export function formatFuelPercentCeil(pct: number | null | undefined): string {
  if (pct == null || Number.isNaN(pct)) return '—';
  return `${Math.min(100, Math.max(0, Math.ceil(pct)))}%`;
}
