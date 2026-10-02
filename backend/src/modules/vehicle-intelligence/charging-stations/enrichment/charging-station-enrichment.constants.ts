export const CHARGING_ENRICHMENT_COORDINATE_SELECTOR_VERSION =
  'erd-recharge-charging-enrichment-coordinate-v1' as const;

export const CHARGING_ENRICHMENT_MAX_RECHARGE_LOCATION_SPREAD_METERS = 100;

export const ERD_RECHARGE_START_LOCATION = 'ERD_RECHARGE_START_LOCATION' as const;
export const ERD_RECHARGE_END_LOCATION = 'ERD_RECHARGE_END_LOCATION' as const;

/** E6.3 V1: coordinate/resolver fingerprint changes re-resolve; OSM dataset refresh alone does not. */
export const AUTOMATIC_DATASET_REFRESH_REENRICHMENT = false;
