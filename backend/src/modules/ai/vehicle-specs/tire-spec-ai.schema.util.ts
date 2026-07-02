export interface TireSpecContext {
  brand?: string;
  model?: string;
  year?: number;
  tireSize?: string;
  loadIndex?: string;
  speedIndex?: string;
}

export const TIRE_SPEC_FIELD_KEYS = [
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
  'legalMinTreadDepthMm',
  'practicalReplacementDepthMm',
  'winterRecommendedMinDepthMm',
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
  'confidenceScore',
  'manufacturerSourceUrl',
  'labelSourceUrl',
] as const;

const BOOL_KEYS = new Set([
  'runFlat',
  'reinforced',
  'xl',
  'severeSnowMarked',
  'iceMarked',
  'evOptimized',
]);

const NUMBER_KEYS = new Set([
  'widthMm',
  'aspectRatio',
  'rimDiameterInch',
  'newTreadDepthMm',
  'legalMinTreadDepthMm',
  'practicalReplacementDepthMm',
  'winterRecommendedMinDepthMm',
  'sectionWidthMm',
  'overallDiameterMm',
  'approvedRimWidthMinIn',
  'approvedRimWidthMaxIn',
  'measuredRimWidthIn',
  'revsPerKm',
  'maxLoadKg',
  'maxInflationKpa',
  'maxInflationPsi',
  'euExternalNoiseDb',
  'mileageWarrantyKm',
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
  'confidenceScore',
]);

function nullable(inner: Record<string, unknown>): Record<string, unknown> {
  return { anyOf: [inner, { type: 'null' }] };
}

export function buildTireSpecEmptyShape(): Record<string, string | number | boolean | string[] | null> {
  const empty: Record<string, string | number | boolean | string[] | null> = {};
  for (const key of TIRE_SPEC_FIELD_KEYS) {
    empty[key] = null;
  }
  return empty;
}

export function buildTireSpecJsonSchema(): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const key of TIRE_SPEC_FIELD_KEYS) {
    if (BOOL_KEYS.has(key)) {
      properties[key] = nullable({ type: 'boolean' });
      continue;
    }
    if (NUMBER_KEYS.has(key)) {
      properties[key] = nullable({ type: 'number' });
      continue;
    }
    if (key === 'intendedUse') {
      properties[key] = nullable({
        anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'string' }],
      });
      continue;
    }
    properties[key] = nullable({ type: 'string' });
  }

  return {
    type: 'object',
    properties,
    additionalProperties: false,
  };
}

export function buildTireSpecPrompt(context: TireSpecContext): { system: string; user: string } {
  const ctxLines = [
    context.brand ? `TIRE_BRAND: ${context.brand}` : '',
    context.model ? `TIRE_MODEL: ${context.model}` : '',
    context.year ? `VEHICLE_YEAR: ${context.year}` : '',
    context.tireSize ? `TIRE_SIZE: ${context.tireSize}` : '',
    context.loadIndex ? `LOAD_INDEX: ${context.loadIndex}` : '',
    context.speedIndex ? `SPEED_INDEX: ${context.speedIndex}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const system = `You are a tire specification database assistant with deep automotive knowledge.
Answer from your knowledge only. Do NOT perform web searches.
Return structured OEM/factory tire specifications. Use null when genuinely unknown — never invent values.
Scope: knowledge-only tire lookup from brand/model/size data. No live vehicle telemetry.`;

  const user = `Tire context:
${ctxLines}

Fill factory/OEM tire specifications for this tire.
Rules:
- use null ONLY if you genuinely do not know the value
- numbers without units in numeric fields
- confidenceScore: 0 to 1
- intendedUse: array of strings or null
- all bias/sensitivity values: 0 to 1 or null
- legalMinTreadDepthMm defaults to 1.6 if unknown
- practicalReplacementDepthMm defaults: 3.0 summer, 4.0 all_season, 4.0 winter
- winterRecommendedMinDepthMm defaults to 4.0 for winter tires
- if not verifiable, return null`;

  return { system, user };
}

export function parseTireSpecJson(
  parsed: Record<string, unknown> | null | undefined,
): Record<string, string | number | boolean | string[] | null> {
  const result = buildTireSpecEmptyShape();
  if (!parsed || typeof parsed !== 'object') return result;

  for (const key of TIRE_SPEC_FIELD_KEYS) {
    if (key in parsed && parsed[key] !== undefined) {
      result[key] = parsed[key] as string | number | boolean | string[] | null;
    }
  }

  return result;
}
