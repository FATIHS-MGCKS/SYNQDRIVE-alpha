import { AI_TIRE_SPEC_LLM_FIELD_KEYS } from '../../vehicle-intelligence/tires/ai-tire-spec-canonical.contract';

export interface TireSpecContext {
  brand?: string;
  model?: string;
  year?: number;
  tireSize?: string;
  loadIndex?: string;
  speedIndex?: string;
}

export const TIRE_SPEC_FIELD_KEYS = [...AI_TIRE_SPEC_LLM_FIELD_KEYS] as const;

const BOOL_KEYS = new Set([
  'runFlat',
  'reinforced',
  'xl',
  'severeSnowMarked',
  'iceMarked',
  'evOptimized',
]);

const INTEGER_KEYS = new Set(['utqgTreadwear', 'euExternalNoiseDb', 'mileageWarrantyKm']);

const NUMBER_KEYS = new Set([
  'widthMm',
  'aspectRatio',
  'rimDiameterInch',
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
    if (INTEGER_KEYS.has(key)) {
      properties[key] = nullable({ type: 'integer' });
      continue;
    }
    if (NUMBER_KEYS.has(key)) {
      properties[key] = nullable({ type: 'number' });
      continue;
    }
    if (key === 'intendedUse') {
      properties[key] = nullable({
        type: 'array',
        items: { type: 'string' },
      });
      continue;
    }
    if (key === 'utqgTraction' || key === 'utqgTemperature') {
      properties[key] = nullable({
        type: 'string',
        enum: ['AA', 'A', 'B', 'C'],
      });
      continue;
    }
    if (key === 'euRollingResistanceClass' || key === 'euWetGripClass' || key === 'euExternalNoiseClass') {
      properties[key] = nullable({
        type: 'string',
        enum: ['A', 'B', 'C', 'D', 'E'],
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

  const system = `You are an OEM tire specification extraction engine.
Return ONLY JSON matching the provided strict schema.
Use null when a value is unknown or not verifiable — never invent specifications.
Do NOT output legal minimum tread, replacement policy thresholds, or jurisdiction defaults.
Do NOT output URLs or claim manufacturer verification.
Knowledge-only lookup from brand/model/size — no live vehicle telemetry.`;

  const user = `Tire context:
${ctxLines}

Fill factory/OEM tire specifications for this tire.
Rules:
- null means unknown; never guess numeric values
- newTreadDepthMm: factory new tread depth in mm only (not legal minimum)
- intendedUse: array of lowercase tags (e.g. touring, sport) or null
- confidenceScore: integer 0–100 or null
- bias/sensitivity fields: 0 to 1 or null
- oeHomologation: OEM mark string (e.g. AO, MO) or null
- EU label classes use A–E where applicable; UTQG traction/temperature use AA/A/B/C`;

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
