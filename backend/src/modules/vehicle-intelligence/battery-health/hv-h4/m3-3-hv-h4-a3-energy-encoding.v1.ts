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

/** Compare mirror Float? column semantics to tagged scientific energy. */
export function energyAddedKwhMirrorMatchesTaggedV1(
  mirror: number | null | undefined,
  tagged: M3_3HvH4TaggedEnergyAddedKwhV1,
): boolean {
  const decoded = decodeM3_3HvH4EnergyAddedKwhV1(tagged);
  if (decoded == null && mirror == null) return true;
  if (decoded == null || mirror == null) return false;
  return Object.is(decoded, mirror);
}
