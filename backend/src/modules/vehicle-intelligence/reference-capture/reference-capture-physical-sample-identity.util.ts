import { createHash } from 'crypto';

export type PhysicalSampleIdentityInput = {
  providerField: string;
  providerTimestamp: string | null;
  normalizedValue: unknown;
};

/** Stable identity of a persisted HF_HISTORICAL aggregate bucket (field + bucket-start timestamp + AVG value). */
export function buildPhysicalSampleFingerprint(input: PhysicalSampleIdentityInput): string {
  const ts = input.providerTimestamp ?? '';
  const value =
    input.normalizedValue === undefined || input.normalizedValue === null
      ? ''
      : typeof input.normalizedValue === 'object'
        ? JSON.stringify(input.normalizedValue)
        : String(input.normalizedValue);

  return createHash('sha256').update([input.providerField, ts, value].join('|')).digest('hex');
}

export type HfRetrievalObservation = {
  physicalSampleFingerprint: string;
  provenance?: { duplicateRetrieval?: boolean } | null;
};

/** Collapse HF retrieval observations to unique aggregate buckets for analysis. */
export function collapseToUniquePhysicalSamples<T extends HfRetrievalObservation>(
  observations: T[],
): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const obs of observations) {
    if (seen.has(obs.physicalSampleFingerprint)) continue;
    seen.add(obs.physicalSampleFingerprint);
    unique.push(obs);
  }
  return unique;
}
