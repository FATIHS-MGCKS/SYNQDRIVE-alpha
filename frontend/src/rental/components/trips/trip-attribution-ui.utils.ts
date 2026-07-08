import type { TripAttribution, TripAttributionConfidence, TripAttributionScope } from '../../../lib/api';

export const TRIP_ATTRIBUTION_SCOPE_LABEL: Record<TripAttributionScope, string> = {
  PRIVATE: 'Privatfahrt',
  BOOKING_ASSIGNED: 'Buchung verknüpft',
  BOOKING_TIME_WINDOW_MATCH: 'Zeitfenster-Match',
  UNASSIGNED: 'Nicht zugeordnet',
};

export const TRIP_ATTRIBUTION_CONFIDENCE_LABEL: Record<TripAttributionConfidence, string> = {
  HIGH: 'hohe Zuordnungssicherheit',
  MEDIUM: 'mittlere Zuordnungssicherheit',
  LOW: 'niedrige Zuordnungssicherheit',
};

export function formatTripAttributionLabel(attribution: TripAttribution | null | undefined): string {
  if (!attribution) return 'Nicht zugeordnet';
  return TRIP_ATTRIBUTION_SCOPE_LABEL[attribution.scope] ?? 'Nicht zugeordnet';
}

export function formatTripAttributionDetail(attribution: TripAttribution | null | undefined): string {
  if (!attribution) return 'Nur Fahrzeughistorie';
  const scopeLabel = formatTripAttributionLabel(attribution);
  const confidence = TRIP_ATTRIBUTION_CONFIDENCE_LABEL[attribution.confidence];

  if (attribution.scope === 'PRIVATE') {
    return `${scopeLabel} · Nicht kunden- oder buchungsrelevant`;
  }
  if (attribution.scope === 'UNASSIGNED') {
    return `${scopeLabel} · Nur Fahrzeughistorie`;
  }
  if (attribution.scope === 'BOOKING_TIME_WINDOW_MATCH') {
    return `${scopeLabel} · ${confidence} · Nicht bestätigt`;
  }
  return `${scopeLabel} · ${confidence}`;
}

export function formatTripBookingAttributionLabel(
  attribution: TripAttribution | null | undefined,
  bookingNumber?: string | null,
): string {
  if (!attribution?.bookingRelevant || !attribution.bookingId) {
    return 'Keine Buchung verknüpft';
  }
  if (bookingNumber) {
    return `Buchung ${bookingNumber}`;
  }
  return attribution.scope === 'BOOKING_ASSIGNED'
    ? 'Buchung verknüpft'
    : 'Zeitfenster-Match (nicht bestätigt)';
}

export function isCustomerRelevantAttribution(
  attribution: TripAttribution | null | undefined,
): boolean {
  return attribution?.customerRelevant === true && attribution.scope === 'BOOKING_ASSIGNED';
}
