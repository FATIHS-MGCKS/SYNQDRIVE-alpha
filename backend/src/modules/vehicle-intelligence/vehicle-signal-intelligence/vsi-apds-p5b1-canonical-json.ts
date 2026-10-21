/** Deterministic JSON for fingerprinting (stable key order, sorted arrays). */
export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (value == null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    const sorted = value.map((entry) => sortValue(entry));
    if (sorted.every((e) => typeof e === 'string' || typeof e === 'number')) {
      return [...sorted].sort();
    }
    if (
      sorted.every(
        (e) =>
          e != null &&
          typeof e === 'object' &&
          !Array.isArray(e) &&
          'requirementId' in (e as object),
      )
    ) {
      return [...(sorted as Array<{ requirementId: string }>)].sort((a, b) =>
        a.requirementId.localeCompare(b.requirementId),
      );
    }
    return sorted;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    out[key] = sortValue(obj[key]);
  }
  return out;
}
