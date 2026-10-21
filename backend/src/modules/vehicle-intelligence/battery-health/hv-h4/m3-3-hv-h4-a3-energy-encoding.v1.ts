/** Lossless tagged encoding for HvChargeSession.energyAddedKwh in scientific evidence JSON. */
export type M3_3HvH4TaggedEnergyAddedKwhKindV1 =
  | 'NULL'
  | 'FINITE'
  | 'NAN'
  | 'POSITIVE_INFINITY'
  | 'NEGATIVE_INFINITY';

export type M3_3HvH4TaggedEnergyAddedKwhV1 =
  | { kind: 'NULL' }
  | { kind: 'FINITE'; value: number }
  | { kind: 'NAN' }
  | { kind: 'POSITIVE_INFINITY' }
  | { kind: 'NEGATIVE_INFINITY' };

export function encodeM3_3HvH4EnergyAddedKwhV1(
  value: number | null | undefined,
): M3_3HvH4TaggedEnergyAddedKwhV1 {
  if (value == null) return { kind: 'NULL' };
  if (Number.isNaN(value)) return { kind: 'NAN' };
  if (value === Number.POSITIVE_INFINITY) return { kind: 'POSITIVE_INFINITY' };
  if (value === Number.NEGATIVE_INFINITY) return { kind: 'NEGATIVE_INFINITY' };
  return { kind: 'FINITE', value };
}

export function decodeM3_3HvH4EnergyAddedKwhV1(
  tagged: M3_3HvH4TaggedEnergyAddedKwhV1,
): number | null {
  switch (tagged.kind) {
    case 'NULL':
      return null;
    case 'FINITE':
      return tagged.value;
    case 'NAN':
      return Number.NaN;
    case 'POSITIVE_INFINITY':
      return Number.POSITIVE_INFINITY;
    case 'NEGATIVE_INFINITY':
      return Number.NEGATIVE_INFINITY;
    default: {
      const _exhaustive: never = tagged;
      return _exhaustive;
    }
  }
}

/** V1 policy: only FINITE scientific tags may appear in the nullable Float mirror column. */
export function deriveEnergyAddedKwhDbMirrorFromTaggedV1(
  tagged: M3_3HvH4TaggedEnergyAddedKwhV1,
): number | null {
  if (tagged.kind === 'FINITE') return tagged.value;
  return null;
}

/** Compare mirror Float? column to tagged scientific energy under FINITE_ONLY_NON_FINITE_TO_NULL_V1. */
export function energyAddedKwhMirrorMatchesTaggedV1(
  mirror: number | null | undefined,
  tagged: M3_3HvH4TaggedEnergyAddedKwhV1,
): boolean {
  const expected = deriveEnergyAddedKwhDbMirrorFromTaggedV1(tagged);
  if (expected == null) return mirror == null;
  return mirror != null && Number.isFinite(mirror) && Object.is(mirror, expected);
}
