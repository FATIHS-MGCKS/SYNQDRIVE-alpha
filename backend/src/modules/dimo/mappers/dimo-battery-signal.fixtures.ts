/**
 * Sanitized DIMO `signalsLatest` payloads from production audits.
 * Source: `docs/audits/dimo-tesla-hv-signal-capability.md` (KS FH 660E, Tesla Model 3).
 */

/** Tesla BEV standing still — audit §6 Latest-Values-Matrix (2026-07-16). */
export const TESLA_HV_AUDIT_SIGNALS_LATEST = {
  lastSeen: '2026-07-16T13:00:08.000Z',
  lowVoltageBatteryCurrentVoltage: null,
  powertrainTractionBatteryStateOfChargeCurrent: {
    timestamp: '2026-07-16T12:59:35.000Z',
    value: 73.82,
  },
  powertrainTractionBatteryStateOfChargeCurrentEnergy: {
    timestamp: '2026-07-16T12:59:14.000Z',
    value: 41.38,
  },
  powertrainTractionBatteryChargingAddedEnergy: {
    timestamp: '2026-07-16T12:58:13.000Z',
    value: 16.08,
  },
  powertrainTractionBatteryChargingIsCharging: {
    timestamp: '2026-07-16T12:58:13.000Z',
    value: 0,
  },
  powertrainTractionBatteryChargingIsChargingCableConnected: {
    timestamp: '2026-07-16T12:58:13.000Z',
    value: 0,
  },
  powertrainTractionBatteryCurrentPower: {
    timestamp: '2026-07-16T12:58:13.000Z',
    value: 0,
  },
  powertrainTractionBatteryChargingChargeLimit: {
    timestamp: '2026-07-16T12:58:13.000Z',
    value: 100,
  },
  powertrainTractionBatteryStateOfHealth: null,
  powertrainTractionBatteryChargingPower: null,
  powertrainTractionBatteryCurrentVoltage: null,
  powertrainTractionBatteryTemperatureAverage: null,
  powertrainTractionBatteryGrossCapacity: null,
} as const;

/** ICE vehicle with plausible LV voltage for rest-window capture tests. */
export const ICE_LV_AUDIT_SIGNALS_LATEST = {
  lastSeen: '2026-07-16T08:15:00.000Z',
  lowVoltageBatteryCurrentVoltage: {
    timestamp: '2026-07-16T08:14:58.000Z',
    value: 12.41,
  },
  powertrainTractionBatteryStateOfChargeCurrent: null,
} as const;

/** Charging session excerpt — ChargingPower in kW per DIMO docs (not Watts). */
export const HV_CHARGING_POWER_KW_SIGNAL = {
  timestamp: '2026-06-25T08:10:00.000Z',
  value: 11.2,
  unit: 'kW',
} as const;

/** Declared unit mismatch should not silently convert. */
export const HV_CURRENT_POWER_WRONG_UNIT_SIGNAL = {
  timestamp: '2026-07-16T12:58:13.000Z',
  value: 8500,
  unit: 'kW',
} as const;
