import type { ChemistryRestingBands } from '../../battery-policy-profile/battery-policy-profile.types';
import { BatteryChemistry } from '../battery-v2-domain';

/** Bump when resting bands, SOC curve, or temperature gates change. */
export const LV_ASSESSMENT_THRESHOLDS_VERSION = '1.0.0';

export const LV_CHEMISTRY_RESTING_BANDS = {
  [BatteryChemistry.LEAD_ACID]: {
    chemistry: BatteryChemistry.LEAD_ACID,
    goodMinV: 12.5,
    watchMinV: 12.2,
    warningMinV: 12.0,
    maxRestingV: 12.6,
  },
  [BatteryChemistry.AGM]: {
    chemistry: BatteryChemistry.AGM,
    goodMinV: 12.6,
    watchMinV: 12.3,
    warningMinV: 12.1,
    maxRestingV: 12.7,
  },
  [BatteryChemistry.EFB]: {
    chemistry: BatteryChemistry.EFB,
    goodMinV: 12.6,
    watchMinV: 12.3,
    warningMinV: 12.1,
    maxRestingV: 12.7,
  },
} as const;

/** Standard 12 V lead-acid open-circuit voltage → SOC lookup (ICE AGM/EFB/LA only). */
export const LEAD_ACID_VOLTAGE_SOC_CURVE: readonly (readonly [number, number])[] = [
  [12.73, 100],
  [12.62, 90],
  [12.5, 80],
  [12.37, 70],
  [12.24, 60],
  [12.1, 50],
  [11.96, 40],
  [11.81, 30],
  [11.66, 20],
  [11.51, 10],
  [11.3, 0],
] as const;

export const LV_AMBIENT_TEMPERATURE_CONTEXT = {
  /** Exterior air temperature — never interpreted as pack/cell temperature. */
  semantic: 'EXTERIOR_AMBIENT' as const,
  extremeColdC: -15,
  extremeHotC: 35,
  /** Confidence reduction when ambient context is missing (does not alter voltage). */
  missingConfidencePenalty: 0.15,
  /** Upper confidence cap under extreme ambient conditions. */
  extremeConfidenceCap: 0.5,
} as const;

export const LV_ASSESSMENT_CONFIDENCE_LEVEL_THRESHOLDS = {
  highMinScore: 0.75,
  mediumMinScore: 0.5,
  lowMinScore: 0.25,
} as const;

export const LV_WORKSHOP_EVIDENCE_BASE_CONFIDENCE = 0.95;
export const LV_TELEMETRY_REST_BASE_CONFIDENCE = 0.85;
export const LV_PROXY_DIAGNOSTIC_BASE_CONFIDENCE = 0.55;
export const LV_UNKNOWN_CHEMISTRY_BASE_CONFIDENCE = 0.2;

/** LV estimated-health score weights — bump thresholds version when changed. */
export const LV_ESTIMATED_HEALTH_SCORE_WEIGHTS = {
  REST_6H: 0.2,
  REST_60M: 0.15,
  REST_AFTER_SHUTDOWN: 0.05,
  /** Start-proxy initially excluded from score composite (Prompt 40/43). */
  START_DIP_PROXY: 0,
  PRE_START_VOLTAGE: 0,
  RECOVERY_5S_VOLTAGE: 0,
  RECOVERY_30S_VOLTAGE: 0,
  RECOVERY_PROXY_VOLTAGE: 0,
  WORKSHOP_OCV: 1,
  WORKSHOP_LOAD_TEST: 1,
} as const;

/** Shadow experimental rest inputs use reduced weight — not publication-eligible. */
export const LV_SHADOW_REST_SCORE_WEIGHT = 0.1;

export const LV_ESTIMATED_HEALTH_ASSESSMENT_MODEL_VERSION = 1;

export function getVersionedRestingBandsForChemistry(
  chemistry: BatteryChemistry,
): ChemistryRestingBands | null {
  switch (chemistry) {
    case BatteryChemistry.LEAD_ACID:
      return LV_CHEMISTRY_RESTING_BANDS[BatteryChemistry.LEAD_ACID];
    case BatteryChemistry.AGM:
      return LV_CHEMISTRY_RESTING_BANDS[BatteryChemistry.AGM];
    case BatteryChemistry.EFB:
      return LV_CHEMISTRY_RESTING_BANDS[BatteryChemistry.EFB];
    default:
      return null;
  }
}

export function estimateLeadAcidSocPercent(voltageV: number): number | null {
  if (!Number.isFinite(voltageV)) return null;
  if (voltageV >= 12.73) return 100;
  if (voltageV <= 11.3) return 0;

  for (let i = 0; i < LEAD_ACID_VOLTAGE_SOC_CURVE.length - 1; i++) {
    const [vHigh, socHigh] = LEAD_ACID_VOLTAGE_SOC_CURVE[i];
    const [vLow, socLow] = LEAD_ACID_VOLTAGE_SOC_CURVE[i + 1];
    if (voltageV >= vLow && voltageV <= vHigh) {
      const ratio = (voltageV - vLow) / (vHigh - vLow);
      return Math.round(socLow + ratio * (socHigh - socLow));
    }
  }

  return null;
}
