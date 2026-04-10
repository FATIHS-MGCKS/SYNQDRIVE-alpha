export const QUEUE_NAMES = {
  DIMO_SNAPSHOT: 'dimo.snapshot.poll',
  DIMO_VEHICLE_SYNC: 'dimo.vehicle.sync',
  DTC_POLL: 'dimo.dtc.poll',
  TIRE_RECALCULATION: 'dimo.tire.recalculation',
  TRIP_TRACKING: 'dimo.trip-tracking',
  TRIP_BEHAVIOR_ENRICHMENT: 'trip.behavior.enrichment',
  /** Driving Impact Engine V1 — runs after HF enrichment completes. */
  DRIVING_IMPACT_COMPUTE: 'trip.driving-impact.compute',
} as const;
