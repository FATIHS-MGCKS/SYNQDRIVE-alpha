/**
 * P4 read-only Battery V2 consumer contract surface.
 * Measurement and publication gates remain authoritative in Battery V2.
 */
export const VSI_BATTERY_V2_CONSUMER_CONTRACT_VERSION = 'vsi-consumer-battery-v2-v1' as const;

export const VSI_BATTERY_V2_CONSUMER_FEATURES = {
  LV_MEASUREMENT_GATE: 'lv_measurement_gate',
  HV_SOC_READINESS: 'hv_soc_readiness',
} as const;
