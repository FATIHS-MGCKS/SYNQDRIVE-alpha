import {
  canonicalFeatureInputUtf8,
  sha256HexLowercaseUtf8,
} from '../feature-input-canonical.serializer';
import {
  InvalidProfileFingerprintError,
  LONGITUDINAL_PROFILE_FINGERPRINT_HEX_PATTERN,
} from './longitudinal-profile-materialization.errors';
import {
  buildLongitudinalScientificProfileProjectionV1,
  type LongitudinalScientificProfileProjectionV1,
} from './longitudinal-profile-scientific-projection';
import type { LongitudinalProfileV1 } from './longitudinal-profile.types';

export type LongitudinalScientificProfileFingerprintV1 = {
  scientificProjection: LongitudinalScientificProfileProjectionV1;
  canonicalScientificUtf8: string;
  canonicalProfileFingerprint: string;
};

export function assertValidProfileFingerprintHex(fingerprint: string): void {
  if (!LONGITUDINAL_PROFILE_FINGERPRINT_HEX_PATTERN.test(fingerprint)) {
    throw new InvalidProfileFingerprintError();
  }
}

export function computeLongitudinalScientificProfileFingerprintV1(
  profile: LongitudinalProfileV1,
): LongitudinalScientificProfileFingerprintV1 {
  const scientificProjection = buildLongitudinalScientificProfileProjectionV1(profile);
  const canonicalScientificUtf8 = canonicalFeatureInputUtf8(scientificProjection);
  const canonicalProfileFingerprint = sha256HexLowercaseUtf8(canonicalScientificUtf8);
  assertValidProfileFingerprintHex(canonicalProfileFingerprint);
  return {
    scientificProjection,
    canonicalScientificUtf8,
    canonicalProfileFingerprint,
  };
}

/** Fixed golden vector for standard two-DEFAULT D2 test fixture @ PROFILE_TEST_GENERATED_AT. */
export const LONGITUDINAL_PROFILE_D3_GOLDEN_FINGERPRINT_LITERAL =
  'e2d39c602370c92a7b4304d01ee0f0d102aa4ce033c38a03f72187a3afbcaecb';
