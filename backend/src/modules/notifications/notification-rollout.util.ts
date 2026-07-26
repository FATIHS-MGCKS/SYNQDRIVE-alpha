export const NOTIFICATIONS_V2_ORG_ALLOWLIST_ENV = 'NOTIFICATIONS_V2_ORG_ALLOWLIST';

export function parseNotificationV2OrgAllowlist(
  env: NodeJS.ProcessEnv = process.env,
): Set<string> | null {
  const raw = env[NOTIFICATIONS_V2_ORG_ALLOWLIST_ENV]?.trim();
  if (!raw) return null;
  const ids = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return ids.length > 0 ? new Set(ids) : null;
}

export function isOrgInNotificationV2Rollout(
  organizationId: string,
  allowlist: Set<string> | null,
): boolean {
  if (!allowlist) return true;
  return allowlist.has(organizationId);
}

export function isNotificationV2EnabledForOrg(
  globalEnabled: boolean,
  organizationId: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!globalEnabled) return false;
  if (!organizationId) return true;
  return isOrgInNotificationV2Rollout(organizationId, parseNotificationV2OrgAllowlist(env));
}
