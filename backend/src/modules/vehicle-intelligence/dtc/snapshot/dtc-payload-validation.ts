import { sanitizeDtcCode } from '../dtc-code-normalizer.util';
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

function uniqueValidCodes(tokens: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of tokens) {
    const code = sanitizeDtcCode(token);
    if (code && !seen.has(code)) {
      seen.add(code);
      out.push(code);
    }
  }
  return out;
}

function tokenizeString(value: string): { tokens: string[]; jsonParseFailed: boolean } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { tokens: [], jsonParseFailed: false };
  }
  if (trimmed.startsWith('[')) {
    if (!trimmed.endsWith(']')) {
      return { tokens: [], jsonParseFailed: true };
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!Array.isArray(parsed)) {
        return { tokens: [], jsonParseFailed: true };
      }
      return {
        tokens: parsed.map((c) => (typeof c === 'string' ? c : String(c))),
        jsonParseFailed: false,
      };
    } catch {
      return { tokens: [], jsonParseFailed: true };
    }
  }
  return { tokens: trimmed.split(','), jsonParseFailed: false };
}

function classifyTokens(tokens: string[]): ObdDtcPayloadAssessment {
  const nonEmpty = tokens.filter((t) => t.trim().length > 0);
  const rawTokenCount = nonEmpty.length;
  let invalidTokenCount = 0;
  for (const token of nonEmpty) {
    if (!sanitizeDtcCode(token)) invalidTokenCount++;
  }
  const codes = uniqueValidCodes(nonEmpty);
  if (rawTokenCount > 0 && codes.length === 0) {
    return {
      valueClass: 'PARTIAL',
      codes: [],
      rawTokenCount,
      invalidTokenCount,
    };
  }
  if (rawTokenCount > 0 && invalidTokenCount > 0 && codes.length > 0) {
    return {
      valueClass: 'PARTIAL',
      codes: [],
      rawTokenCount,
      invalidTokenCount,
    };
  }
  if (codes.length === 0) {
    return {
      valueClass: 'VALID_EMPTY',
      codes: [],
      rawTokenCount,
      invalidTokenCount,
    };
  }
  return {
    valueClass: 'VALID_NONEMPTY',
    codes,
    rawTokenCount,
    invalidTokenCount,
  };
}

/**
 * Fail-closed OBD DTC value classification. Only explicit empty arrays / empty
 * comma-less payloads classify as VALID_EMPTY (eligible for confirmed clear).
 */
export function assessObdDtcValue(value: unknown): ObdDtcPayloadAssessment {
  if (value === undefined) {
    return { valueClass: 'MISSING', codes: [], rawTokenCount: 0, invalidTokenCount: 0 };
  }
  if (value === null) {
    return { valueClass: 'NULL', codes: [], rawTokenCount: 0, invalidTokenCount: 0 };
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return { valueClass: 'INVALID', codes: [], rawTokenCount: 0, invalidTokenCount: 0 };
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return { valueClass: 'INVALID', codes: [], rawTokenCount: 0, invalidTokenCount: 0 };
  }
  if (Array.isArray(value)) {
    const tokens = value.map((c) => (typeof c === 'string' ? c : String(c)));
    return classifyTokens(tokens);
  }
  if (typeof value === 'string') {
    const { tokens, jsonParseFailed } = tokenizeString(value);
    if (jsonParseFailed) {
      return { valueClass: 'INVALID', codes: [], rawTokenCount: 0, invalidTokenCount: 0 };
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return { valueClass: 'INVALID', codes: [], rawTokenCount: 0, invalidTokenCount: 0 };
    }
    return classifyTokens(tokens);
  }
  return { valueClass: 'INVALID', codes: [], rawTokenCount: 0, invalidTokenCount: 0 };
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
