export const VSI_TRIP_DTC_CONSUMER_CONTRACT_VERSION = 'vsi-consumer-trip-dtc-v1' as const;

export const VSI_TRIP_CONSUMER_FEATURES = {
  TRIP_BOUNDARY_SUPPORT: 'trip_boundary_support_signals',
} as const;

export const VSI_DTC_CONSUMER_FEATURES = {
  DTC_SNAPSHOT: 'dtc_snapshot_readiness',
} as const;
