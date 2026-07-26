export type NotificationsV2Mode = 'off' | 'shadow' | 'on';

let cachedOrgAllowlist: Set<string> | null | undefined;

function parseFrontendOrgAllowlist(): Set<string> | null {
  if (cachedOrgAllowlist !== undefined) return cachedOrgAllowlist;
  const raw = (import.meta.env.VITE_NOTIFICATIONS_V2_ORG_ALLOWLIST ?? '')
    .toString()
    .trim();
  if (!raw) {
    cachedOrgAllowlist = null;
    return cachedOrgAllowlist;
  }
  const ids = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  cachedOrgAllowlist = ids.length > 0 ? new Set(ids) : null;
  return cachedOrgAllowlist;
}

/** Test helper — reset memoized allowlist between tests. */
export function resetNotificationsV2OrgAllowlistCache(): void {
  cachedOrgAllowlist = undefined;
}

function isOrgInFrontendRollout(orgId: string | null | undefined): boolean {
  const allowlist = parseFrontendOrgAllowlist();
  if (!allowlist) return true;
  if (!orgId) return true;
  return allowlist.has(orgId);
}

/**
 * Frontend gate for Notification Engine V2 dashboard cutover.
 *
 * `VITE_NOTIFICATIONS_V2`:
 * - unset / `false` / `off` → V1 ActionQueue sources only
 * - `shadow` → V1 UI + background V2 fetch/compare (diagnostics only)
 * - `true` / `on` → V2 API is the sole notification box source
 *
 * Optional `VITE_NOTIFICATIONS_V2_ORG_ALLOWLIST` (comma-separated org UUIDs) limits
 * V2 UI to pilot orgs while the build flag is on.
 */
export function getNotificationsV2Mode(): NotificationsV2Mode {
  const raw = (import.meta.env.VITE_NOTIFICATIONS_V2 ?? 'off').toString().trim().toLowerCase();
  if (raw === 'true' || raw === 'on' || raw === '1') return 'on';
  if (raw === 'shadow') return 'shadow';
  return 'off';
}

export function isNotificationsV2Active(orgId?: string | null): boolean {
  return getNotificationsV2Mode() === 'on' && isOrgInFrontendRollout(orgId);
}

export function isNotificationsV2Shadow(orgId?: string | null): boolean {
  return getNotificationsV2Mode() === 'shadow' && isOrgInFrontendRollout(orgId);
}

export function shouldUseV2NotificationSource(orgId?: string | null): boolean {
  return isNotificationsV2Active(orgId);
}

export function shouldFetchV2NotificationsInBackground(orgId?: string | null): boolean {
  const mode = getNotificationsV2Mode();
  if (mode !== 'on' && mode !== 'shadow') return false;
  return isOrgInFrontendRollout(orgId);
}
