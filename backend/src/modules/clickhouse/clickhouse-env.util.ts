/**
 * ClickHouse / HF mirror feature flags — shared across diagnostics and Data Analyse.
 * Defaults: all mirrors off; trip assist on when ClickHouse is available.
 */

export function isHfMirrorEnabled(
  raw: string | undefined = process.env.HF_MIRROR_ENABLED,
): boolean {
  return raw === 'true';
}

export function isWaypointMirrorEnabled(
  raw: string | undefined = process.env.WAYPOINT_MIRROR_ENABLED,
): boolean {
  return raw === 'true';
}

export function isActivityWindowMirrorEnabled(
  raw: string | undefined = process.env.ACTIVITY_WINDOW_MIRROR_ENABLED,
): boolean {
  return raw === 'true';
}

/**
 * When true (default), guarded ClickHouse-assisted trip start/continuity/repair
 * detectors may influence PostgreSQL trip lifecycle. Explicit opt-out only.
 */
export function isClickHouseTripAssistEnabled(
  raw: string | undefined = process.env.CLICKHOUSE_TRIP_ASSIST_ENABLED,
): boolean {
  if (raw === 'false') return false;
  return true;
}

export type HfMirrorFlagStatus = 'enabled' | 'disabled' | 'unknown';

export function resolveHfMirrorFlagStatus(
  raw: string | undefined = process.env.HF_MIRROR_ENABLED,
): HfMirrorFlagStatus {
  if (raw === 'true') return 'enabled';
  if (raw === 'false' || raw === undefined || raw === '') return 'disabled';
  return 'unknown';
}

export type MirrorFlagStatus = HfMirrorFlagStatus;

export function resolveMirrorFlagStatus(
  raw: string | undefined,
): MirrorFlagStatus {
  if (raw === 'true') return 'enabled';
  if (raw === 'false' || raw === undefined || raw === '') return 'disabled';
  return 'unknown';
}
