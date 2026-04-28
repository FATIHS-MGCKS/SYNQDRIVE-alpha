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

/**
 * Compact day-time formatter for fleet-status widgets. Renders
 * "Heute 14:30" / "Morgen 09:15" for same-day / next-day relative
 * times, and "Mo 20.04. 14:30" for everything else. Keeps the label
 * short enough to fit next to a customer name in the Fleet tables
 * and Dashboard popups.
 */
export function formatFleetDateTime(
  iso: string | null | undefined,
  locale: string = 'de-DE',
): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const deltaDays = Math.round(
    (startOfDate.getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000),
  );
  const timePart = date.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });
  if (deltaDays === 0) return `Heute ${timePart}`;
  if (deltaDays === 1) return `Morgen ${timePart}`;
  if (deltaDays === -1) return `Gestern ${timePart}`;
  const datePart = date.toLocaleDateString(locale, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  });
  return `${datePart} ${timePart}`;
}

/**
 * Remaining-time formatter for Active-Rented widgets. Returns
 * "3 Tage", "4 Std 12 Min" or "Überfällig" (negative) based on the
 * planned return timestamp.
 */
export function formatRemainingUntil(
  iso: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!iso) return '—';
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return '—';
  const deltaMs = target.getTime() - now.getTime();
  if (deltaMs <= 0) return 'Überfällig';
  const minutes = Math.floor(deltaMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days >= 2) return `${days} Tage`;
  if (days === 1) return `1 Tag ${hours - 24} Std`;
  if (hours >= 1) return `${hours} Std ${minutes - hours * 60} Min`;
  return `${minutes} Min`;
}

/**
 * Free-kilometers label for Active-Rented cards. Shows
 * "120 km frei von 500", "Unbegrenzt" when no allowance is set, or
 * "— km driven" when no driven value is known either.
 */
export function formatKmAllowance(
  kmIncluded: number | null | undefined,
  kmDriven: number | null | undefined,
): string {
  if (kmIncluded == null) {
    if (kmDriven == null) return 'Unbegrenzt';
    return `${Math.max(0, Math.floor(kmDriven)).toLocaleString('de-DE')} km gefahren · Unbegrenzt`;
  }
  const driven = kmDriven ?? 0;
  const remaining = Math.max(0, Math.floor(kmIncluded - driven));
  return `${remaining.toLocaleString('de-DE')} km frei von ${Math.floor(kmIncluded).toLocaleString('de-DE')}`;
}

/**
 * V4.6.85 — Localized label for the canonical maintenance reason codes
 * that the backend emits (`SCHEDULED_SERVICE`, `OPERATIONAL_BLOCK`).
 * Falls back to the raw backend-provided text so the UI never renders
 * an empty badge when a new code is introduced server-side.
 */
export function formatMaintenanceReason(
  code: string | null | undefined,
  fallback?: string | null,
): string {
  switch (code) {
    case 'SCHEDULED_SERVICE':
      return 'Geplante Wartung';
    case 'OPERATIONAL_BLOCK':
      return 'Betrieblich blockiert';
    default:
      return fallback && fallback.trim().length > 0 ? fallback : '—';
  }
}
