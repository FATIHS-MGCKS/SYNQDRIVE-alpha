import { BadRequestException } from '@nestjs/common';

export const PRODUCT_METADATA_NAME_MAX_LENGTH = 120;
export const PRODUCT_METADATA_DESCRIPTION_MAX_LENGTH = 2000;

const ALLOWED_KEYS = new Set([
  'name',
  'description',
  'ifCurrentName',
  'ifCurrentDescription',
]);

export type ParsedProductMetadataPatch = {
  name: string;
  description: string | null;
  ifCurrentName: string;
  ifCurrentDescription: string | null;
};

export function normalizeProductDescription(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new BadRequestException('description must be a string or null');
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > PRODUCT_METADATA_DESCRIPTION_MAX_LENGTH) {
    throw new BadRequestException(
      `description must be at most ${PRODUCT_METADATA_DESCRIPTION_MAX_LENGTH} characters`,
    );
  }
  return trimmed;
}

export function normalizeProductName(value: unknown, field = 'name'): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new BadRequestException(`${field} must be non-empty after trimming`);
  }
  if (trimmed.length > PRODUCT_METADATA_NAME_MAX_LENGTH) {
    throw new BadRequestException(
      `${field} must be at most ${PRODUCT_METADATA_NAME_MAX_LENGTH} characters`,
    );
  }
  return trimmed;
}

export function parseProductMetadataPatchBody(body: unknown): ParsedProductMetadataPatch {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Request body must be a JSON object');
  }
  const record = body as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new BadRequestException(`Unknown field "${key}"`);
    }
  }
  if (!('ifCurrentName' in record)) {
    throw new BadRequestException('ifCurrentName is required for concurrency control');
  }
  if (!('ifCurrentDescription' in record)) {
    throw new BadRequestException('ifCurrentDescription is required for concurrency control');
  }
  if (!('name' in record)) {
    throw new BadRequestException('name is required');
  }

  const ifCurrentName = normalizeProductName(record.ifCurrentName, 'ifCurrentName');
  const ifCurrentDescription = normalizeProductDescription(record.ifCurrentDescription);
  const name = normalizeProductName(record.name);
  const description =
    'description' in record ? normalizeProductDescription(record.description) : ifCurrentDescription;

  return { name, description, ifCurrentName, ifCurrentDescription };
}