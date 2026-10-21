/**
 * Canonical HV / ERD capability signal keys — single authority for registry,
 * HvMethodProfile resolution, E3 fallback activation, and E4 reconciliation eligibility.
 */
export const HV_ERD_SIGNAL_KEYS = {
  soc: 'hv.soc',
  isCharging: 'hv.is_charging',
  cableConnected: 'hv.cable_connected',
  addedEnergy: 'hv.added_energy',
  chargingPower: 'hv.charging_power',
  currentPower: 'hv.current_power',
  rechargeSegments: 'dimo.segments.recharge',
} as const;

export type HvErdSignalKey = (typeof HV_ERD_SIGNAL_KEYS)[keyof typeof HV_ERD_SIGNAL_KEYS];

/** Matches hasFallbackTelemetryCapabilities(profile) — chargingPower, not currentPower. */
export const HV_E3_FALLBACK_CORROBORATING_SIGNAL_KEYS: readonly HvErdSignalKey[] = [
  HV_ERD_SIGNAL_KEYS.isCharging,
  HV_ERD_SIGNAL_KEYS.cableConnected,
  HV_ERD_SIGNAL_KEYS.addedEnergy,
  HV_ERD_SIGNAL_KEYS.chargingPower,
];

export const HV_E3_FALLBACK_ELIGIBILITY_SIGNAL_KEYS: readonly HvErdSignalKey[] = [
  HV_ERD_SIGNAL_KEYS.soc,
  ...HV_E3_FALLBACK_CORROBORATING_SIGNAL_KEYS,
];

export const HV_ERD_RECONCILE_CAPABILITY_QUERY_KEYS: readonly HvErdSignalKey[] = [
  HV_ERD_SIGNAL_KEYS.soc,
  HV_ERD_SIGNAL_KEYS.rechargeSegments,
  ...HV_E3_FALLBACK_CORROBORATING_SIGNAL_KEYS,
];
