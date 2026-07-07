/** Display euro amounts in booking UI (legacy helper used across steps). */
export function formatEuroAmount(value: number | null | undefined): string {
  return value != null && Number.isFinite(value) ? `€ ${value.toFixed(2)}` : '—';
}

export function amountLabel(value: number | null | undefined): string {
  return value != null && Number.isFinite(value) ? value.toFixed(2) : '—';
}
