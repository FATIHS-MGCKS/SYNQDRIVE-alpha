/** M3.3-HV-R22-P1 — charging-added-energy interval bucket evidence contract. */
export const M3_3_HV_CHARGING_ADDED_ENERGY_BUCKET_EVIDENCE_V1 =
  'M3_3_HV_CHARGING_ADDED_ENERGY_BUCKET_EVIDENCE_V1' as const;

export const HV_CHARGING_COUNTER_SIGNAL_ID =
  'powertrainTractionBatteryChargingAddedEnergy' as const;

export const HV_CHARGING_COUNTER_BUCKET_WIDTH = '1m' as const;

export const HV_CHARGING_COUNTER_AGGREGATION_MODE = 'INTERVAL_1M_LAST' as const;

export const HV_CHARGING_COUNTER_DIMO_QUERY_KIND = 'signals_interval_1m' as const;

/** Explicit research provenance — not raw MCU samples. */
export const HV_CHARGING_COUNTER_SAMPLE_CLASS = 'NOT_RAW_NATIVE_SAMPLE' as const;

export const HV_CHARGING_COUNTER_AVAILABILITY = {
  AVAILABLE: 'AVAILABLE',
  MISSING: 'MISSING',
  UNAVAILABLE: 'UNAVAILABLE',
} as const;

export type HvChargingCounterAvailabilityV1 =
  (typeof HV_CHARGING_COUNTER_AVAILABILITY)[keyof typeof HV_CHARGING_COUNTER_AVAILABILITY];
