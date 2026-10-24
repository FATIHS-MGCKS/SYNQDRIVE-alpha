/** Strict normalization for Prisma VehicleLatestState.obdDtcList (JsonValue). */
export type NormalizedVlsObdDtcList =
  | { kind: 'absent' }
  | { kind: 'codes'; codes: string[] }
  | { kind: 'malformed' };

export function normalizeVlsObdDtcListJson(value: unknown): NormalizedVlsObdDtcList {
  if (value === null || value === undefined) {
    return { kind: 'absent' };
  }
  if (!Array.isArray(value)) {
    return { kind: 'malformed' };
  }
  const codes: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || item.trim().length === 0) {
      return { kind: 'malformed' };
    }
    codes.push(item);
  }
  return { kind: 'codes', codes };
}

export type ConfirmedObdCodesParseResult =
  | { status: 'valid'; codes: string[] }
  | { status: 'valid_empty' }
  | { status: 'malformed' }
  | { status: 'absent' };

export function parseConfirmedObdCodesFromHeadJson(json: unknown): ConfirmedObdCodesParseResult {
  if (json === null || json === undefined) {
    return { status: 'absent' };
  }
  if (!Array.isArray(json)) {
    return { status: 'malformed' };
  }
  if (json.length === 0) {
    return { status: 'valid_empty' };
  }
  const codes: string[] = [];
  for (const item of json) {
    if (typeof item !== 'string' || item.trim().length === 0) {
      return { status: 'malformed' };
    }
    codes.push(item);
  }
  return { status: 'valid', codes };
}
