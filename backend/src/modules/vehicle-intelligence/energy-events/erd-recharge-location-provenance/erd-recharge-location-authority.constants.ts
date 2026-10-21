export const ERD_RECHARGE_LOCATION_AUTHORITY_VERSION = 'erd_recharge_location_authority_v1';

/** Authoritative recharge location provenance for native DIMO segments (V1). */
export const ERD_RECHARGE_LOCATION_SOURCE_DIMO_RECHARGE_SEGMENT =
  'DIMO_RECHARGE_SEGMENT' as const;

export type ErdRechargeLocationProvenanceSource =
  typeof ERD_RECHARGE_LOCATION_SOURCE_DIMO_RECHARGE_SEGMENT;
