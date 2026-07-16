import { HV_CHARGE_SESSION_QUALITY_STATUS } from '../hv-charge-session/hv-charge-session-quality.status';
import { HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE } from '../hv-charge-session/hv-charge-session.types';
import type { HvCapacityM3SessionInput } from './hv-capacity-m3.types';

/** Tesla audit Session 4 — segment aggregate 15.18 kWh / 27.4 % ≈ 55.4 kWh. */
export const TESLA_AUDIT_M3_SESSION_4_INPUT: HvCapacityM3SessionInput = {
  source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
  isOngoing: false,
  startAt: new Date('2026-06-21T19:00:08.000Z'),
  endAt: new Date('2026-06-22T05:36:49.000Z'),
  startSocPercent: 35.0,
  endSocPercent: 62.4,
  startEnergyKwh: 19.5,
  endEnergyKwh: 34.0,
  energyAddedKwh: 15.18,
  deltaSocPercent: 27.4,
  addedEnergyMinKwh: 0.0,
  addedEnergyMaxKwh: 15.18,
  capacityValidationEligible: true,
  qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
  boundaryStrength: 'strong',
};

export const TESLA_AUDIT_M3_SESSION_4_EXPECTED_CAPACITY_KWH = 55.4;
export const TESLA_AUDIT_M3_CAPACITY_TOLERANCE_KWH = 0.5;

/** Tesla audit Session 7 — segment aggregate 22.70 kWh / 40.3 % ≈ 56.3 kWh. */
export const TESLA_AUDIT_M3_SESSION_7_SEGMENT_INPUT: HvCapacityM3SessionInput = {
  source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
  isOngoing: false,
  startAt: new Date('2026-06-25T21:00:19.000Z'),
  endAt: new Date('2026-06-26T05:47:57.000Z'),
  startSocPercent: 21.62,
  endSocPercent: 61.92,
  startEnergyKwh: 21.62,
  endEnergyKwh: 43.24,
  energyAddedKwh: 22.7,
  deltaSocPercent: 40.3,
  addedEnergyMinKwh: 0.0,
  addedEnergyMaxKwh: 22.7,
  capacityValidationEligible: true,
  qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
  boundaryStrength: 'strong',
};

export const TESLA_AUDIT_M3_SESSION_7_EXPECTED_CAPACITY_KWH = 56.3;

/**
 * Audit Session 7 timeseries first/last path (~71.3 kWh) — rejected for M3 when naive
 * energy delta diverges from segment aggregate (must not use raw first/last).
 */
export const TESLA_AUDIT_M3_SESSION_7_IMPLAUSIBLE_FIRST_LAST_INPUT: HvCapacityM3SessionInput =
  {
    ...TESLA_AUDIT_M3_SESSION_7_SEGMENT_INPUT,
    startEnergyKwh: 10.0,
    endEnergyKwh: 38.73,
  };

export const TESLA_AUDIT_M3_IMPLAUSIBLE_TIMESERIES_CAPACITY_KWH = 71.3;

/** Segment aggregate implying ~71 kWh — used to test M2 method conflict, not standalone SOH. */
export const TESLA_AUDIT_M3_IMPLAUSIBLE_SEGMENT_INPUT: HvCapacityM3SessionInput = {
  ...TESLA_AUDIT_M3_SESSION_7_SEGMENT_INPUT,
  energyAddedKwh: 28.75,
  deltaSocPercent: 40.3,
  startEnergyKwh: 12.0,
  endEnergyKwh: 40.73,
};

export const TESLA_AUDIT_M2_MEDIAN_FOR_CONFLICT_KWH = 55.5;
