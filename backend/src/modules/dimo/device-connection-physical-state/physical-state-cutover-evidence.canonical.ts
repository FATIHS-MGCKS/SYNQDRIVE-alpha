import { createHash } from 'node:crypto';

const ISO_8601_UTC =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export function assertCanonicalIso8601Utc(value: string): string {
  if (!ISO_8601_UTC.test(value)) {
    throw new Error('non_canonical_timestamp');
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error('invalid_timestamp');
  }
  return new Date(parsed).toISOString();
}

export function canonicalizeCutoverEvidenceValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  const valueType = typeof value;
  if (valueType === 'string') {
    return JSON.stringify(value);
  }
  if (valueType === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (valueType === 'number') {
    const num = value as number;
    if (!Number.isFinite(num)) {
      throw new Error('non_finite_number');
    }
    if (Object.is(num, -0)) {
      return '0';
    }
    return JSON.stringify(num);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeCutoverEvidenceValue(item)).join(',')}]`;
  }
  if (valueType === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    if (keys.length !== new Set(keys).size) {
      throw new Error('duplicate_object_keys');
    }
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalizeCutoverEvidenceValue(record[key])}`)
      .join(',')}}`;
  }
  throw new Error('unsupported_canonical_value');
}

export function canonicalizeCutoverEvidencePayload(payload: unknown): string {
  return canonicalizeCutoverEvidenceValue(payload);
}

export function hashCanonicalCutoverEvidencePayload(payload: unknown): string {
  const canonical = canonicalizeCutoverEvidencePayload(payload);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
