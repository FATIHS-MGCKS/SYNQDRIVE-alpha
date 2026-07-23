/** Mirrors backend `BOOKING_CANCELLATION_REASON_CODES`. */
export const BOOKING_CANCELLATION_REASON_CODES = [
  'CUSTOMER_REQUEST',
  'CUSTOMER_NO_LONGER_NEEDS',
  'VEHICLE_UNAVAILABLE',
  'PRICING_ERROR',
  'DUPLICATE_BOOKING',
  'WEATHER_FORCE_MAJEURE',
  'OPERATIONAL_DECISION',
  'OTHER',
] as const;

export type BookingCancellationReasonCode =
  (typeof BOOKING_CANCELLATION_REASON_CODES)[number];

export const BOOKING_CANCELLATION_REASON_LABELS: Record<
  BookingCancellationReasonCode,
  string
> = {
  CUSTOMER_REQUEST: 'Kundenwunsch',
  CUSTOMER_NO_LONGER_NEEDS: 'Kunde benötigt Fahrzeug nicht mehr',
  VEHICLE_UNAVAILABLE: 'Fahrzeug nicht verfügbar',
  PRICING_ERROR: 'Preisfehler',
  DUPLICATE_BOOKING: 'Doppelbuchung',
  WEATHER_FORCE_MAJEURE: 'Höhere Gewalt / Wetter',
  OPERATIONAL_DECISION: 'Operative Entscheidung',
  OTHER: 'Sonstiges',
};

export interface BookingCancelPayload {
  reasonCode: BookingCancellationReasonCode;
  description?: string | null;
  effectiveAt?: string;
}
