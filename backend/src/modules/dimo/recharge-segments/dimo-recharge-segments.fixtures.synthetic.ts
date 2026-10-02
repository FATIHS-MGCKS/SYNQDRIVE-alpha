/**
 * Synthetic / future-compatibility payloads — NOT live DIMO contract.
 * Used to prove providerSegmentId provenance without implying live API support.
 */

export const SYNTHETIC_PROVIDER_SEGMENT_ID = 'synthetic-dimo-seg-future-001';

export function withSyntheticProviderId<T extends Record<string, unknown>>(
  segment: T,
  providerSegmentId: string = SYNTHETIC_PROVIDER_SEGMENT_ID,
): T & { id: string } {
  return { ...segment, id: providerSegmentId };
}
