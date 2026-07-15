/** Canonical dedup prefix — identity is vehicle + preparation window, not booking. */
export const VEHICLE_CLEANING_TASK_DEDUP_PREFIX = 'vehicle:cleaning:' as const;

/** Legacy booking-scoped key superseded by canonical vehicle cleaning tasks. */
export const LEGACY_BOOKING_CLEAN_DEDUP_PREFIX = 'booking:clean:' as const;

export const VEHICLE_CLEANING_RULE_ID = 'vehicle.cleaning.required' as const;

export const VEHICLE_CLEANING_RULE_VERSION = 1;

/** Fachliche Reinigungszwecke — bestimmen den Vorbereitungsfenster-Suffix im dedupKey. */
export type CleaningPurpose = 'PRE_BOOKING' | 'STANDALONE';

/** Aktuell ein relevantes Vorbereitungsfenster: Reinigung vor nächster Buchung. */
export type PreparationWindow = 'PRE_BOOKING';

/** Hours before next pickup when cleaning priority escalates to HIGH. */
export const VEHICLE_CLEANING_URGENT_BEFORE_PICKUP_HOURS = 24;
