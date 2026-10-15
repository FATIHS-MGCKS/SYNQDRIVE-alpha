import { normalizeDtcCodes, sanitizeDtcCode } from '../dtc-code-normalizer.util';
import { parseProviderObservedAt } from './dtc-snapshot-meta.util';

/** Strict OBD DTC payload classification for fail-closed apply. */
export type ObdDtcValueClass =
  | 'MISSING'
  | 'NULL'
  | 'INVALID'
  | 'PARTIAL'
  | 'VALID_EMPTY'
  | 'VALID_NONEMPTY';

export type ProviderTimestampClass = 'MISSING' | 'INVALID' | 'FUTURE' | 'VALID';

export interface ObdDtcPayloadAssessment {
  valueClass: ObdDtcValueClass;
  codes: string[];
  rawTokenCount: number;
  invalidTokenCount: number;
}

const DEFAULT_MAX_FUTURE_SKEW_MS = 2 * 60_000;

function countRawTokens(value: unknown): { tokens: string[]; invalid: number } {
  if (value === null || value === undefined) {
    return { tokens: [], invalid: 0 };
  }
  let source: unknown = value;
  if (typeof source === 'string') {
    const trimmed = source.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        source = JSON.parse(trimmed);
      } catch {
        // comma-split below
      }
    }
  }
  const tokens: string[] = Array.isArray(source)
    ? source.map((c) => (typeof c === 'string' ? c : String(c)))
    : typeof source === 'string'
      ? source.split(',')
      : [];
  let invalid = 0;
  for (const token of tokens) {
    if (!sanitizeDtcCode(token)) invalid++;
  }
  return { tokens, invalid };
}

export function assessObdDtcValue(value: unknown): ObdDtcPayloadAssessment {
  if (value === undefined) {
    return { valueClass: 'MISSING', codes: [], rawTokenCount: 0, invalidTokenCount: 0 };
  }
  if (value === null) {
    return { valueClass: 'NULL', codes: [], rawTokenCount: 0, invalidTokenCount: 0 };
  }
  const { tokens, invalid } = countRawTokens(value);
  const codes = normalizeDtcCodes(value);
  const rawTokenCount = tokens.filter((t) => t.trim().length > 0).length;
  if (rawTokenCount > 0 && codes.length === 0) {
    return {
      valueClass: 'PARTIAL',
      codes: [],
      rawTokenCount,
      invalidTokenCount: invalid,
    };
  }
  if (codes.length === 0) {
    return {
      valueClass: 'VALID_EMPTY',
      codes: [],
      rawTokenCount,
      invalidTokenCount: invalid,
    };
  }
  return {
    valueClass: 'VALID_NONEMPTY',
    codes,
    rawTokenCount,
    invalidTokenCount: invalid,
  };
}

export function assessProviderTimestamp(
  raw: unknown,
  now: Date = new Date(),
  maxFutureSkewMs = DEFAULT_MAX_FUTURE_SKEW_MS,
):
  | { class: 'VALID'; observedAt: Date }
  | { class: Exclude<ProviderTimestampClass, 'VALID'> } {
  if (raw == null) {
    return { class: 'MISSING' };
  }
  const observedAt = parseProviderObservedAt(raw);
  if (!observedAt) {
    return { class: 'INVALID' };
  }
  if (observedAt.getTime() > now.getTime() + maxFutureSkewMs) {
    return { class: 'FUTURE' };
  }
  return { class: 'VALID', observedAt };
}

export function allowsConfirmedClear(assessment: ObdDtcPayloadAssessment): boolean {
  return assessment.valueClass === 'VALID_EMPTY';
}
