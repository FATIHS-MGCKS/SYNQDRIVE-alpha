import { createHash } from 'crypto';

export class FeatureInputNonFiniteError extends Error {
  readonly code = 'FEATURE_INPUT_NON_FINITE';

  constructor(message = 'Non-finite number in feature input snapshot') {
    super(message);
    this.name = 'FeatureInputNonFiniteError';
  }
}

export class FeatureInputUnsupportedValueError extends Error {
  readonly code = 'FEATURE_INPUT_UNSUPPORTED_VALUE';

  constructor(message: string) {
    super(message);
    this.name = 'FeatureInputUnsupportedValueError';
  }
}

/** ECMAScript UTF-16 code unit lexical ordering (locale-independent). */
export function compareUtf16CodeUnitLexicographic(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function sortUtf16CodeUnitLexicographic(values: string[]): string[] {
  return [...values].sort(compareUtf16CodeUnitLexicographic);
}

/**
 * Deterministic canonical JSON for M3.3C FEATURE_INPUT_DIGEST.
 * Object keys sorted by UTF-16 code unit at every level; array order preserved.
 */
export function canonicalizeFeatureInputValue(value: unknown): unknown {
  if (value === undefined) {
    throw new FeatureInputUnsupportedValueError('undefined is not allowed in feature input snapshot');
  }
  if (value === null) return null;
  if (typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new FeatureInputNonFiniteError();
    }
    return value;
  }
  if (value instanceof Date) {
    throw new FeatureInputUnsupportedValueError('Date objects must be normalized to ISO strings before digest');
  }
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeFeatureInputValue(entry));
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = sortUtf16CodeUnitLexicographic(Object.keys(record));
    const out: Record<string, unknown> = {};
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
      const entry = record[key];
      out[key] = canonicalizeFeatureInputValue(entry);
    }
    return out;
  }
  throw new FeatureInputUnsupportedValueError(`Unsupported value type: ${typeof value}`);
}

export function serializeCanonicalJsonValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => serializeCanonicalJsonValue(entry)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = sortUtf16CodeUnitLexicographic(Object.keys(record));
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${serializeCanonicalJsonValue(record[key])}`)
      .join(',')}}`;
  }
  throw new FeatureInputUnsupportedValueError(`Unsupported value type: ${typeof value}`);
}

export function canonicalFeatureInputUtf8(value: unknown): string {
  const canonical = canonicalizeFeatureInputValue(value);
  return serializeCanonicalJsonValue(canonical);
}

export function sha256HexLowercaseUtf8(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function computeFeatureInputDigestFromSnapshot(snapshot: unknown): string {
  const utf8 = canonicalFeatureInputUtf8(snapshot);
  return sha256HexLowercaseUtf8(utf8);
}

/** Fixed M3_3C_FEATURE_INPUT_V1 canonical key-order contract vector (UTF-16 code unit key sort). */
export const FEATURE_INPUT_CANONICAL_KEY_ORDER_JSON_LITERAL =
  '{"10":1,"2":2,"A":3,"a":4,"z":6,"ä":5,"Ω":7}';

export const FEATURE_INPUT_CANONICAL_KEY_ORDER_SHA256_LITERAL =
  'e7b6e05a14a7bece2b8568b716d7dfc2ff360507b7a9f308c5771f648fd8dff3';
