import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { DEFAULT_ORG_TIMEZONE, resolveOrgLocale, resolveOrgTimezone } from '../../lib/datetime';

const profileCache = new Map<string, { timezone: string; locale: string }>();

export interface OrgTimezoneState {
  timezone: string;
  locale: string;
  loading: boolean;
}

/**
 * Loads the tenant's canonical IANA timezone + locale from org profile.
 * Cached per orgId — browser timezone is never used as business truth.
 */
export function useOrgTimezone(orgId: string | null | undefined): OrgTimezoneState {
  const cached = orgId ? profileCache.get(orgId) : undefined;
  const [state, setState] = useState<OrgTimezoneState>(() => ({
    timezone: cached?.timezone ?? DEFAULT_ORG_TIMEZONE,
    locale: cached?.locale ?? 'de-DE',
    loading: Boolean(orgId && !cached),
  }));

  useEffect(() => {
    if (!orgId?.trim()) {
      setState({
        timezone: DEFAULT_ORG_TIMEZONE,
        locale: 'de-DE',
        loading: false,
      });
      return;
    }

    const hit = profileCache.get(orgId);
    if (hit) {
      setState({ ...hit, loading: false });
      return;
    }

    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));

    api.organizations
      .getProfile(orgId)
      .then((profile) => {
        if (cancelled) return;
        const next = {
          timezone: resolveOrgTimezone(profile.timezone),
          locale: resolveOrgLocale(profile.language),
        };
        profileCache.set(orgId, next);
        setState({ ...next, loading: false });
      })
      .catch(() => {
        if (cancelled) return;
        const fallback = {
          timezone: DEFAULT_ORG_TIMEZONE,
          locale: 'de-DE',
        };
        profileCache.set(orgId, fallback);
        setState({ ...fallback, loading: false });
      });

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return state;
}

/** Invalidate cached org timezone (e.g. after profile update). */
export function invalidateOrgTimezoneCache(orgId?: string): void {
  if (orgId) profileCache.delete(orgId);
  else profileCache.clear();
}
