/** Event-count contract version — bump when qualification rules change (P49). */
export const MISUSE_EVENT_COUNT_VERSION = 'misuse-event-count-v1';

/** Aggregate source types — never count toward eventCount. */
export const UNQUALIFIED_AGGREGATE_SOURCE_TYPES = [
  'VEHICLE_TRIP_COUNTER',
  'VEHICLE_LATEST_STATE',
] as const;
