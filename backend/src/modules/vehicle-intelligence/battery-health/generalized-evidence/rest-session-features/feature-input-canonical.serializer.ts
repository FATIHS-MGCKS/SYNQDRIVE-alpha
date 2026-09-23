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

/**
 * Deterministic canonical JSON for M3.3C FEATURE_INPUT_DIGEST.
 * Object keys sorted lexicographically at every level; array order preserved.
 */
export function canonicalizeFeatureInputValue(value: unknown): unknown {
  if (value === null) return null;
  if (value === undefined) {
    throw new FeatureInputUnsupportedValueError('undefined is not allowed in feature input snapshot');
  }
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
    const keys = Object.keys(record).sort((a, b) => a.localeCompare(b));
    const out: Record<string, unknown> = {};
    for (const key of keys) {
      const entry = record[key];
      if (entry === undefined) continue;
      out[key] = canonicalizeFeatureInputValue(entry);
    }
    return out;
  }
  throw new FeatureInputUnsupportedValueError(`Unsupported value type: ${typeof value}`);
}

export function canonicalFeatureInputUtf8(value: unknown): string {
  const canonical = canonicalizeFeatureInputValue(value);
  return JSON.stringify(canonical);
}

export function sha256HexLowercaseUtf8(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function computeFeatureInputDigestFromSnapshot(snapshot: unknown): string {
  const utf8 = canonicalFeatureInputUtf8(snapshot);
  return sha256HexLowercaseUtf8(utf8);
}
