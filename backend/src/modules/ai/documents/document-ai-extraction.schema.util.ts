import type { DocumentAiField } from './document-ai-extraction.types';

function nullableSchema(inner: Record<string, unknown>): Record<string, unknown> {
  return { anyOf: [inner, { type: 'null' }] };
}

function fieldToSchemaProperty(field: DocumentAiField): Record<string, unknown> {
  if (field.enumValues?.length) {
    return nullableSchema({ type: 'string', enum: field.enumValues });
  }
  switch (field.type) {
    case 'number':
      return nullableSchema({ type: 'number' });
    case 'date':
      return nullableSchema({
        type: 'string',
        description: 'ISO date YYYY-MM-DD',
      });
    default:
      return nullableSchema({ type: 'string' });
  }
}

export function buildEmptyFieldShape(fields: DocumentAiField[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.key.includes('.')) {
      const [parent, child] = field.key.split('.');
      const obj = (out[parent] as Record<string, unknown>) ?? {};
      obj[child] = null;
      out[parent] = obj;
    } else {
      out[field.key] = null;
    }
  }
  return out;
}

export function buildFieldsJsonSchema(fields: DocumentAiField[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};

  for (const field of fields) {
    if (field.key.includes('.')) {
      const [parent, child] = field.key.split('.');
      const existing = (properties[parent] as Record<string, unknown>) ?? {
        type: 'object',
        properties: {},
        additionalProperties: false,
      };
      (existing.properties as Record<string, unknown>)[child] = fieldToSchemaProperty(field);
      properties[parent] = existing;
    } else {
      properties[field.key] = fieldToSchemaProperty(field);
    }
  }

  return {
    type: 'object',
    properties,
    additionalProperties: false,
  };
}

export function buildDocumentExtractionResponseSchema(
  fields: DocumentAiField[],
): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      documentType: { type: 'string' },
      fields: buildFieldsJsonSchema(fields),
      recommendedHumanReviewNotes: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: ['documentType', 'fields', 'recommendedHumanReviewNotes'],
    additionalProperties: false,
  };
}

export function buildDocumentExtractionPrompt(input: {
  documentType: string;
  fields: DocumentAiField[];
  rawText: string;
  chunkIndex?: number;
  chunkCount?: number;
  pageNumbers?: number[];
  pageBoundaryReliable?: boolean;
  vehicleContext?: {
    vin?: string;
    make?: string;
    model?: string;
    year?: number;
    fuelType?: string;
    licensePlate?: string;
    lastKnownOdometerKm?: number;
  };
}): { system: string; user: string } {
  const ctx = input.vehicleContext;
  const ctxLines = ctx
    ? [
        ctx.vin ? `VIN: ${ctx.vin}` : '',
        ctx.licensePlate ? `LICENSE_PLATE: ${ctx.licensePlate}` : '',
        ctx.make ? `MAKE: ${ctx.make}` : '',
        ctx.model ? `MODEL: ${ctx.model}` : '',
        ctx.year ? `YEAR: ${ctx.year}` : '',
        ctx.fuelType ? `FUEL_TYPE: ${ctx.fuelType}` : '',
        ctx.lastKnownOdometerKm != null
          ? `LAST_KNOWN_ODOMETER_KM: ${Math.round(ctx.lastKnownOdometerKm)}`
          : '',
      ]
        .filter(Boolean)
        .join('\n')
    : '';

  const fieldsSpec = input.fields
    .map((field) => {
      const enumPart = field.enumValues?.length ? ` (one of: ${field.enumValues.join(', ')})` : '';
      return `- "${field.key}": ${field.type}${enumPart} — ${field.label}`;
    })
    .join('\n');

  const text = input.rawText || '';

  const chunkHeader =
    input.chunkCount != null && input.chunkCount > 1
      ? `CHUNK: ${(input.chunkIndex ?? 0) + 1} of ${input.chunkCount}${
          input.pageNumbers?.length
            ? ` | SOURCE_PAGES: ${input.pageNumbers.join(', ')}`
            : ' | SOURCE_PAGES: unknown'
        }${input.pageBoundaryReliable === false ? ' | PAGE_BOUNDARIES: inferred' : ''}\n\n`
      : '';

  const system = `You extract structured vehicle service/rental document data for SynqDrive.
Return only valid JSON matching the provided schema.
If a field is not present in this document section, return null. Do not invent values.
Use vehicle context only for plausibility reasoning — never copy context values into fields unless they appear in the document text.
Human confirmation happens later; you only produce suggestions for the provided section.
Numbers must be plain numbers without units or thousands separators.
Dates as ISO YYYY-MM-DD when possible.`;

  const user = `DOCUMENT_TYPE: ${input.documentType}

${ctxLines ? `VEHICLE_CONTEXT (plausibility only, do not copy into fields):\n${ctxLines}\n\n` : ''}${chunkHeader}EXPECTED_FIELDS:
${fieldsSpec}

DOCUMENT_TEXT_SECTION (verbatim OCR/extracted text for this chunk only):
"""
${text}
"""`;

  return { system, user };
}

export function normalizeExtractedFieldValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '' || trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'n/a') {
      return null;
    }
    return trimmed;
  }
  return value;
}

export function mapExtractedFields(
  source: Record<string, unknown> | null | undefined,
  schema: DocumentAiField[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of schema) {
    if (field.key.includes('.')) {
      const [parent, child] = field.key.split('.');
      const obj = (result[parent] as Record<string, unknown>) ?? {};
      const srcParent = (source?.[parent] ?? {}) as Record<string, unknown>;
      obj[child] = normalizeExtractedFieldValue(srcParent?.[child]);
      result[parent] = obj;
    } else {
      result[field.key] = normalizeExtractedFieldValue(source?.[field.key]);
    }
  }
  return result;
}
