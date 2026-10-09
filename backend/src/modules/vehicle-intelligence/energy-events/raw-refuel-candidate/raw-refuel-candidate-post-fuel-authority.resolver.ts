import {
  RFRF_LEGACY_RISE_DETECTION_VERSION_V1,
} from './raw-refuel-candidate-cross-version-compatibility.authority';
import type { RawRefuelPostFuelAuthority } from './raw-refuel-post-fuel-authority.types';

const POST_FUEL_AUTHORITY_META_KEY = 'postFuelAuthority';

function isPostFuelAuthority(value: unknown): value is RawRefuelPostFuelAuthority {
  return value === 'PEAK_INSTANTANEOUS' || value === 'SETTLED_MEDIAN';
}

/** Parse explicit post-fuel authority from evidence metadata (no inference). */
export function parsePostFuelAuthorityFromEvidenceMeta(
  evidenceMeta: Record<string, unknown> | null | undefined,
): RawRefuelPostFuelAuthority | null {
  if (evidenceMeta == null) return null;
  const raw = evidenceMeta[POST_FUEL_AUTHORITY_META_KEY];
  return isPostFuelAuthority(raw) ? raw : null;
}

/**
 * Effective stored authority for cross-version bridge.
 * Legacy v1 rows may omit metadata → PEAK_INSTANTANEOUS only.
 */
export function resolveStoredEffectivePostFuelAuthority(input: {
  storedDetectionVersion: string;
  evidenceMeta: Record<string, unknown> | null | undefined;
}): RawRefuelPostFuelAuthority | null {
  const explicit = parsePostFuelAuthorityFromEvidenceMeta(input.evidenceMeta);
  if (explicit != null) {
    return explicit;
  }
  if (input.storedDetectionVersion === RFRF_LEGACY_RISE_DETECTION_VERSION_V1) {
    return 'PEAK_INSTANTANEOUS';
  }
  return null;
}

/** Incoming cross-version observations must declare post-fuel authority explicitly. */
export function resolveObservationPostFuelAuthorityForCrossVersion(
  evidenceMeta: Record<string, unknown> | null | undefined,
): RawRefuelPostFuelAuthority | null {
  return parsePostFuelAuthorityFromEvidenceMeta(evidenceMeta);
}
