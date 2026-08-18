import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { SECURITY_ACCESS_REFRESH_MS, SECURITY_ACCESS_STALE_MS } from './security-access.utils';
import type {
  AuditLogDetailDto,
  AuditLogListItemDto,
  GovernanceRoleDetailDto,
  GovernanceUserDetailDto,
  GovernanceUserListItemDto,
  GovernanceUserSessionDto,
  OrgRoleSummaryDto,
  PaginatedResponse,
  PlatformRoleSummaryDto,
  SecurityAttentionSummaryDto,
} from './types';

export function useSecurityAttentionSummary() {
  const [data, setData] = useState<SecurityAttentionSummaryDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.admin.securityAccess.attentionSummary();
      setData(res);
      setFetchedAt(Date.now());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Aufmerksamkeitsübersicht konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), SECURITY_ACCESS_REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const isStale = fetchedAt != null && Date.now() - fetchedAt > SECURITY_ACCESS_STALE_MS;

  return { data, loading, error, isStale, refresh: load };
}

export interface SecurityUsersQuery {
  page?: number;
  limit?: number;
  search?: string;
  platformRole?: string;
  mfaState?: string;
  attention?: string;
  organizationId?: string;
}

export function useSecurityUsers(query: SecurityUsersQuery, enabled = true) {
  const [result, setResult] = useState<PaginatedResponse<GovernanceUserListItemDto> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.admin.securityAccess.listUsers(query);
      setResult(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Benutzer konnten nicht geladen werden');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [enabled, query.page, query.limit, query.search, query.platformRole, query.mfaState, query.attention, query.organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { result, loading, error, refresh: load };
}

export function useSecurityUserDetail(userId: string | null) {
  const [detail, setDetail] = useState<GovernanceUserDetailDto | null>(null);
  const [sessions, setSessions] = useState<GovernanceUserSessionDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setDetail(null);
      setSessions([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.admin.securityAccess.getUser(userId);
      setDetail(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Benutzerdetails konnten nicht geladen werden');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const loadSessions = useCallback(async () => {
    if (!userId) return;
    setSessionsLoading(true);
    try {
      const res = await api.admin.securityAccess.listUserSessions(userId);
      setSessions(res);
    } catch {
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (userId) void loadSessions();
  }, [userId, loadSessions]);

  return { detail, sessions, loading, sessionsLoading, error, refresh: load, refreshSessions: loadSessions };
}

export function usePlatformRoles() {
  const [roles, setRoles] = useState<PlatformRoleSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.admin.securityAccess.listPlatformRoles();
      setRoles(Array.isArray(res) ? res : (res as { roles?: PlatformRoleSummaryDto[] }).roles ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Plattformrollen konnten nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { roles, loading, error, refresh: load };
}

export interface OrgRolesQuery {
  page?: number;
  limit?: number;
  organizationId?: string;
  search?: string;
}

export function useOrgRoles(query: OrgRolesQuery) {
  const [result, setResult] = useState<PaginatedResponse<OrgRoleSummaryDto> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.admin.securityAccess.listOrgRoles(query);
      setResult(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Mandantenrollen konnten nicht geladen werden');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [query.page, query.limit, query.organizationId, query.search]);

  useEffect(() => {
    void load();
  }, [load]);

  return { result, loading, error, refresh: load };
}

export function useRoleDetail(roleId: string | null, scope: 'platform' | 'organization' | null, organizationId?: string | null) {
  const [detail, setDetail] = useState<GovernanceRoleDetailDto | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!roleId || !scope) {
      setDetail(null);
      return;
    }
    setLoading(true);
    void api.admin.securityAccess
      .getRole(roleId, scope, organizationId ?? undefined)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [roleId, scope, organizationId]);

  return { detail, loading };
}

export interface AuditLogQuery {
  page?: number;
  limit?: number;
  entity?: string;
  action?: string;
  organizationId?: string;
  auditDomain?: string;
  securityOnly?: boolean;
  from?: string;
  to?: string;
  actorUserId?: string;
  search?: string;
}

export function useAuditLog(query: AuditLogQuery) {
  const [result, setResult] = useState<PaginatedResponse<AuditLogListItemDto> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.admin.activityLog(query);
      setResult(res as PaginatedResponse<AuditLogListItemDto>);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Audit-Protokoll konnte nicht geladen werden');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [
    query.page,
    query.limit,
    query.entity,
    query.action,
    query.organizationId,
    query.auditDomain,
    query.securityOnly,
    query.from,
    query.to,
    query.actorUserId,
    query.search,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  return { result, loading, error, refresh: load };
}

export function useAuditDetail(auditId: string | null) {
  const [detail, setDetail] = useState<AuditLogDetailDto | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!auditId) {
      setDetail(null);
      return;
    }
    setLoading(true);
    void api.admin.activityLogDetail(auditId)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [auditId]);

  return { detail, loading };
}
