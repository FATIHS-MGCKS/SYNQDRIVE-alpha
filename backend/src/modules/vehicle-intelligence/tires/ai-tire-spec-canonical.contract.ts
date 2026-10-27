/**
 * Canonical AiTireSpec fields requested from Mistral (strict JSON schema)
 * and consumed by normalizeAiTireSpecResult.
 *
 * Policy thresholds, legal minimums, and URL "evidence" are intentionally excluded.
 */
export const AI_TIRE_SPEC_LLM_FIELD_KEYS = [
  'matchedBrand',
  'matchedModel',
  'matchedVariant',
  'seasonType',
  'vehicleClassFit',
  'runFlat',
  'reinforced',
  'xl',
  'oeHomologation',
  'tireSizeRaw',
  'widthMm',
  'aspectRatio',
  'rimDiameterInch',
  'loadIndex',
  'speedIndex',
  'newTreadDepthMm',
  'sectionWidthMm',
  'overallDiameterMm',
  'approvedRimWidthMinIn',
  'approvedRimWidthMaxIn',
  'measuredRimWidthIn',
  'revsPerKm',
  'maxLoadKg',
  'maxInflationKpa',
  'maxInflationPsi',
  'euRollingResistanceClass',
  'euWetGripClass',
  'euExternalNoiseDb',
  'euExternalNoiseClass',
  'severeSnowMarked',
  'iceMarked',
  'utqgTreadwear',
  'utqgTraction',
  'utqgTemperature',
  'mileageWarrantyKm',
  'evOptimized',
  'intendedUse',
  'comfortBias',
  'efficiencyBias',
  'wetSafetyBias',
  'sportBias',
  'longevityBias',
  'payloadBias',
  'urbanBias',
  'highwayBias',
  'aggressiveDrivingSensitivity',
  'underinflationSensitivity',
  'heatSensitivity',
  'tireArchetype',
  'confidenceScore',
] as const;

export type AiTireSpecLlmFieldKey = (typeof AI_TIRE_SPEC_LLM_FIELD_KEYS)[number];

export const AI_TIRE_SPEC_SCHEMA_VERSION = 'tire_v2';
