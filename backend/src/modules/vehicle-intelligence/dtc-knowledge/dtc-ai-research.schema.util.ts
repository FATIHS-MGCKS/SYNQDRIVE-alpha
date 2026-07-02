import type { DtcResearchInput } from './dtc-research.port';

function nullable(inner: Record<string, unknown>): Record<string, unknown> {
  return { anyOf: [inner, { type: 'null' }] };
}

export function buildDtcResearchJsonSchema(mode: 'generic' | 'vehicle'): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    code: { type: 'string' },
    title: nullable({ type: 'string' }),
    standardType: nullable({ type: 'string' }),
    systemCategory: nullable({ type: 'string' }),
    shortDescription: nullable({ type: 'string' }),
    possibleCauses: { type: 'array', items: { type: 'string' } },
    possibleEffects: { type: 'array', items: { type: 'string' } },
    technicalUrgency: nullable({ type: 'string' }),
    rentalUrgency: nullable({ type: 'string' }),
    rentalRecommendation: nullable({ type: 'string' }),
    recommendedAction: nullable({ type: 'string' }),
    sourceType: nullable({ type: 'string' }),
    sources: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          title: nullable({ type: 'string' }),
          url: nullable({ type: 'string' }),
        },
        additionalProperties: false,
      },
    },
    needsReview: { type: 'boolean' },
  };

  if (mode === 'vehicle') {
    properties.vehicleSpecificTitle = nullable({ type: 'string' });
    properties.vehicleSpecificDescription = nullable({ type: 'string' });
    properties.vehicleSpecificEffects = { type: 'array', items: { type: 'string' } };
    properties.vehicleSpecificUrgency = nullable({ type: 'string' });
    properties.vehicleRentalRecommendation = nullable({ type: 'string' });
  }

  return {
    type: 'object',
    properties,
    required: ['code', 'possibleCauses', 'possibleEffects', 'sources', 'needsReview'],
    additionalProperties: false,
  };
}

export function buildDtcResearchPrompt(input: DtcResearchInput): { system: string; user: string } {
  const isVehicle = input.mode === 'vehicle';
  const v = input.vehicle;
  const ctxLines =
    isVehicle && v
      ? [
          v.make ? `MAKE: ${v.make}` : '',
          v.model ? `MODEL: ${v.model}` : '',
          v.year ? `YEAR: ${v.year}` : '',
          v.fuelType ? `FUEL_TYPE: ${v.fuelType}` : '',
          v.engineCode ? `ENGINE_CODE: ${v.engineCode}` : '',
        ]
          .filter(Boolean)
          .join('\n')
      : '';

  const system = `You are an automotive diagnostics knowledge assistant for SynqDrive, a fleet/rental platform.
Return concise structured DTC knowledge in German for user-facing text fields.
Use null when unknown — never invent facts. Set needsReview=true when uncertain.`;

  const user = `Research OBD-II diagnostic trouble code: ${input.normalizedCode}
${input.systemCategory ? `SYSTEM_CATEGORY_HINT: ${input.systemCategory}` : ''}${input.standardType ? `STANDARD_TYPE_HINT: ${input.standardType}` : ''}${ctxLines ? `\nVEHICLE_CONTEXT:\n${ctxLines}` : ''}
Rules:
- write title, descriptions, causes, effects, recommendations in GERMAN
- max 6 causes and 6 effects, short phrases
- standardType: GENERIC, MANUFACTURER_SPECIFIC, or UNKNOWN
- systemCategory: POWERTRAIN, BODY, CHASSIS, NETWORK, or UNKNOWN
- technicalUrgency / rentalUrgency: LOW, MEDIUM, HIGH, CRITICAL, or UNKNOWN
- rentalRecommendation: RENTABLE, CHECK_BEFORE_NEXT_RENTAL, BLOCK_UNTIL_INSPECTED, DO_NOT_RENT, or UNKNOWN
- sources: max 5 credible http(s) URLs with short titles
- no markdown outside JSON${
    isVehicle
      ? '\n- if manufacturer-specific and vehicle context insufficient, set needsReview=true'
      : ''
  }`;

  return { system, user };
}
