/**
 * HF mirror feature flag — shared across diagnostics and Data Analyse.
 * Default: off (no post-trip HF mirror writes).
 */
export function isHfMirrorEnabled(
  raw: string | undefined = process.env.HF_MIRROR_ENABLED,
): boolean {
  return raw === 'true';
}

export type HfMirrorFlagStatus = 'enabled' | 'disabled' | 'unknown';

export function resolveHfMirrorFlagStatus(
  raw: string | undefined = process.env.HF_MIRROR_ENABLED,
): HfMirrorFlagStatus {
  if (raw === 'true') return 'enabled';
  if (raw === 'false' || raw === undefined || raw === '') return 'disabled';
  return 'unknown';
}
