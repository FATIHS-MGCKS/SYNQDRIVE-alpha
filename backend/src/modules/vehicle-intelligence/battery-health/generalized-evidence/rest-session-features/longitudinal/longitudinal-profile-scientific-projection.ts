import type {
  LongitudinalProfileV1,
  LongitudinalProfileWindowV1,
} from './longitudinal-profile.types';

export type LongitudinalScientificProfileWindowV1 = Omit<
  LongitudinalProfileWindowV1,
  'profileGeneratedAt'
>;

/** D2 profile with envelope-only `profileGeneratedAt` removed from window. */
export type LongitudinalScientificProfileProjectionV1 = Omit<
  LongitudinalProfileV1,
  'window'
> & {
  window: LongitudinalScientificProfileWindowV1;
};

export function buildLongitudinalScientificProfileProjectionV1(
  profile: LongitudinalProfileV1,
): LongitudinalScientificProfileProjectionV1 {
  const { profileGeneratedAt: _envelope, ...scientificWindow } = profile.window;
  return {
    ...profile,
    window: scientificWindow,
  };
}

export function scientificProjectionOmitsProfileGeneratedAt(
  projection: LongitudinalScientificProfileProjectionV1,
): boolean {
  return !Object.prototype.hasOwnProperty.call(projection.window, 'profileGeneratedAt');
}
