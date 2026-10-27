import { createHash } from 'crypto';
import { TIRE_HEALTH_CONFIG } from '../tire-health.config';

/**
 * Tire Wear V3 — distance prior + optional bounded DS4 severity (β_dyn = 0 until calibrated).
 * Tunables live here; do not scatter across services.
 */
export const TIRE_WEAR_V3_PRIOR_LEGACY_MODEL_VERSION = 'tire-wear-v3-prior-0.1.0';

export const TIRE_WEAR_V3_PRIOR_MODEL_VERSION = 'tire-wear-v3-prior-0.2.0';

/** Active default for {@link TIRE_WEAR_V3_PRIOR_MODEL_VERSION} (posterior intervals). */
export const TIRE_WEAR_V3_PRIOR_USE_POSTERIOR_RATE_FUSION = true;

export function usePosteriorRateFusionForModelVersion(modelVersion: string): boolean {
  return modelVersion !== TIRE_WEAR_V3_PRIOR_LEGACY_MODEL_VERSION;
}

/** DS4 / M3 dynamic wear coefficient — fixed at 0 for P3A. */
export const TIRE_WEAR_V3_PRIOR_DYNAMIC_BETA = 0;

export const TIRE_WEAR_V3_PRIOR_CONFIG = {
  dynamicBeta: TIRE_WEAR_V3_PRIOR_DYNAMIC_BETA,
  /** Default manual tread depth measurement uncertainty (mm), 1σ. */
  defaultMeasurementUncertaintyMm: 0.4,
  /** When measurement source is workshop / multi-groove (future), may tighten to this. */
  refinedMeasurementUncertaintyMm: 0.2,
  /**
   * Reference example only: σ_m=0.2 mm and r=0.125 mm/1000 km (=0.000125 mm/km)
   * → ΔD ≥ 3·√2·σ_m / r ≈ 6800 km. Runtime uses {@link computeMinOdometerSpanKmFor3Sigma}.
   */
  reference3SigmaSpacingExampleKm: 6800,
  /** Minimum span across all rate points (km). */
  minMeasurementSpanKmForRateL2: 5000,
  minMeasurementSpanKmForRateL3: 12000,
  minMeasurementSpanKmForRateL4: 15000,
  maxPlausibleWearRateMmPer1000km: 1.0,
  minPlausibleWearRateMmPer1000km: 0.02,
  /** When baseline tread / life is default-assumption only, widen life to this span (km). */
  unknownLifeKmSpan: { lo: 25000, hi: 50000 },
  /** Explicit setup.expectedLifeKm symmetric widening (±10 %). */
  explicitLifeKmRelativeSpan: 0.1,
  /** Max relative rate uncertainty for evidence level L2 / L3. */
  rateRelativeUncertaintyL2: 0.5,
  rateRelativeUncertaintyL3: 0.25,
  minMeasurementsForRateL2: 2,
  minMeasurementsForRateL3: 3,
  minMeasurementsForRateL4: 5,
  /** Implausible tread jump between consecutive measurements (mm). */
  maxTreadJumpBetweenMeasurementsMm: 2.0,
  /**
   * When OLS residual RMSE exceeds this fraction of total tread span (first→last point),
   * treat the series as contradictory for rate calibration (prior-only).
   */
  maxResidualRmseFractionOfTreadSpan: 0.4,
  /** Reference M3 sum (J/kg/km) for relative severity; not a wear coefficient. */
  severityReferenceM3JPerKgPerKm: 15,
  dynamicFactorBounds: { min: 0.85, max: 1.3 },
  /** Allow f_dyn < 1 only when DS4 distance coverage meets this threshold. */
  dynamicDownwardMinCoverage: 0.9,
  measuredFreshKm: 500,
  odometerRelativeSigma: 0.03,
} as const;

export type TireWearV3PriorConfig = typeof TIRE_WEAR_V3_PRIOR_CONFIG;

function canonicalJson(value: unknown): string {
  return JSON.stringify(value);
}

/** Deterministic hash of effective P3A prior configuration (excludes dynamic β). */
export function computeTireWearV3PriorConfigHash(
  config: TireWearV3PriorConfig = TIRE_WEAR_V3_PRIOR_CONFIG,
): string {
  const payload = {
    modelVersion: TIRE_WEAR_V3_PRIOR_MODEL_VERSION,
    dynamicBeta: config.dynamicBeta,
    defaultMeasurementUncertaintyMm: config.defaultMeasurementUncertaintyMm,
    maxResidualRmseFractionOfTreadSpan: config.maxResidualRmseFractionOfTreadSpan,
    reference3SigmaSpacingExampleKm: config.reference3SigmaSpacingExampleKm,
    severityReferenceM3JPerKgPerKm: config.severityReferenceM3JPerKgPerKm,
    dynamicFactorBounds: config.dynamicFactorBounds,
    dynamicDownwardMinCoverage: config.dynamicDownwardMinCoverage,
    measuredFreshKm: config.measuredFreshKm,
    usePosteriorRateFusion: TIRE_WEAR_V3_PRIOR_USE_POSTERIOR_RATE_FUSION,
    unknownLifeKmSpan: config.unknownLifeKmSpan,
    replaceThresholds: TIRE_HEALTH_CONFIG.replaceThresholds,
    expectedLifeKm: TIRE_HEALTH_CONFIG.expectedLifeKm,
    archetypeDefaults: TIRE_HEALTH_CONFIG.archetypeDefaults,
    defaultInitialTreadFallbackMm: TIRE_HEALTH_CONFIG.defaultInitialTreadFallbackMm,
  };
  return createHash('sha256').update(canonicalJson(payload)).digest('hex');
}
