import {
  RFRF_LEGACY_RISE_DETECTION_VERSION_V1,
} from './raw-refuel-candidate-cross-version-compatibility.authority';
import type { RawRefuelPostFuelAuthority } from './raw-refuel-post-fuel-authority.types';

const POST_FUEL_AUTHORITY_META_KEY = 'postFuelAuthority';

function isPostFuelAuthority(value: unknown): value is RawRefuelPostFuelAuthority {
  return value === 'PEAK_INSTANTANEOUS' || value === 'SETTLED_MEDIAN';
}

export type ParsedPostFuelAuthorityMeta =
  | { kind: 'ABSENT' }
  | { kind: 'VALID'; value: RawRefuelPostFuelAuthority }
  | { kind: 'INVALID' };

export function parsePostFuelAuthorityMeta(
  evidenceMeta: Record<string, unknown> | null | undefined,
): ParsedPostFuelAuthorityMeta {
  if (evidenceMeta == null) {
    return { kind: 'ABSENT' };
  }
  if (!Object.prototype.hasOwnProperty.call(evidenceMeta, POST_FUEL_AUTHORITY_META_KEY)) {
    return { kind: 'ABSENT' };
  }
  const raw = evidenceMeta[POST_FUEL_AUTHORITY_META_KEY];
  if (isPostFuelAuthority(raw)) {
    return { kind: 'VALID', value: raw };
  }
  return { kind: 'INVALID' };
}

/** Parse explicit post-fuel authority from evidence metadata (no inference). */
export function parsePostFuelAuthorityFromEvidenceMeta(
  evidenceMeta: Record<string, unknown> | null | undefined,
): RawRefuelPostFuelAuthority | null {
  const parsed = parsePostFuelAuthorityMeta(evidenceMeta);
  return parsed.kind === 'VALID' ? parsed.value : null;
}

/**
 * Effective stored authority for cross-version bridge.
 * Legacy v1 rows may omit metadata → PEAK_INSTANTANEOUS only when key is absent.
 */
export function resolveStoredEffectivePostFuelAuthority(input: {
  storedDetectionVersion: string;
  evidenceMeta: Record<string, unknown> | null | undefined;
}): RawRefuelPostFuelAuthority | null {
  const parsed = parsePostFuelAuthorityMeta(input.evidenceMeta);
  if (parsed.kind === 'VALID') {
    return parsed.value;
  }
  if (parsed.kind === 'INVALID') {
    return null;
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
  const parsed = parsePostFuelAuthorityMeta(evidenceMeta);
  return parsed.kind === 'VALID' ? parsed.value : null;
}
