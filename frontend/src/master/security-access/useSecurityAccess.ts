import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, getErrorMessage } from '../../lib/api';
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

type LoadErrorKey = 'attention' | 'users' | 'userDetail' | 'platformRoles' | 'orgRoles' | 'auditLog' | 'own';

export function useSecurityAttentionSummary(loadError: (k: LoadErrorKey) => string) {
  const [data, setData] = useState<SecurityAttentionSummaryDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await api.admin.securityAccess.attentionSummary();
      if (requestId !== requestIdRef.current) return;
      setData(res);
      setFetchedAt(Date.now());
    } catch (e: unknown) {
      if (requestId !== requestIdRef.current) return;
      setError(getErrorMessage(e, loadError('attention')));
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [loadError]);

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

export function useSecurityUsers(query: SecurityUsersQuery, enabled: boolean, loadError: (k: LoadErrorKey) => string) {
  const [result, setResult] = useState<PaginatedResponse<GovernanceUserListItemDto> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const queryKey = JSON.stringify(query);

  const load = useCallback(async () => {
    if (!enabled) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await api.admin.securityAccess.listUsers(query);
      if (requestId !== requestIdRef.current) return;
      setResult(res);
    } catch (e: unknown) {
      if (requestId !== requestIdRef.current) return;
      setError(getErrorMessage(e, loadError('users')));
      setResult(null);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [enabled, loadError, queryKey]);

  useEffect(() => {
    void load();
  }, [load]);

  return { result, loading, error, refresh: load };
}

export function useSecurityUserDetail(userId: string | null, loadError: (k: LoadErrorKey) => string) {
  const [detail, setDetail] = useState<GovernanceUserDetailDto | null>(null);
  const [sessions, setSessions] = useState<GovernanceUserSessionDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const detailRequestRef = useRef(0);
  const sessionsRequestRef = useRef(0);

  useLayoutEffect(() => {
    detailRequestRef.current += 1;
    sessionsRequestRef.current += 1;
    setDetail(null);
    setSessions([]);
    setError(null);
    setSessionsError(null);
    setLoading(!!userId);
    setSessionsLoading(!!userId);
  }, [userId]);

  const load = useCallback(async () => {
    if (!userId) {
      setDetail(null);
      setSessions([]);
      setSessionsError(null);
      setLoading(false);
      setSessionsLoading(false);
      return;
    }
    const requestId = ++detailRequestRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await api.admin.securityAccess.getUser(userId);
      if (requestId !== detailRequestRef.current) return;
      setDetail(res);
    } catch (e: unknown) {
      if (requestId !== detailRequestRef.current) return;
      setError(getErrorMessage(e, loadError('userDetail')));
      setDetail(null);
    } finally {
      if (requestId === detailRequestRef.current) setLoading(false);
    }
  }, [userId, loadError]);

  const loadSessions = useCallback(async () => {
    if (!userId) return;
    const requestId = ++sessionsRequestRef.current;
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const res = await api.admin.securityAccess.listUserSessions(userId);
      if (requestId !== sessionsRequestRef.current) return;
      setSessions(res);
    } catch (e: unknown) {
      if (requestId !== sessionsRequestRef.current) return;
      setSessionsError(getErrorMessage(e, loadError('users')));
      setSessions([]);
    } finally {
      if (requestId === sessionsRequestRef.current) setSessionsLoading(false);
    }
  }, [userId, loadError]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (userId) void loadSessions();
  }, [userId, loadSessions]);

  return {
    detail,
    sessions,
    loading,
    sessionsLoading,
    error,
    sessionsError,
    refresh: load,
    refreshSessions: loadSessions,
  };
}

export function usePlatformRoles(loadError: (k: LoadErrorKey) => string) {
  const [roles, setRoles] = useState<PlatformRoleSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await api.admin.securityAccess.listPlatformRoles();
      if (requestId !== requestIdRef.current) return;
      setRoles(Array.isArray(res) ? res : (res as { roles?: PlatformRoleSummaryDto[] }).roles ?? []);
    } catch (e: unknown) {
      if (requestId !== requestIdRef.current) return;
      setError(getErrorMessage(e, loadError('platformRoles')));
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [loadError]);

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

export function useOrgRoles(query: OrgRolesQuery, loadError: (k: LoadErrorKey) => string) {
  const [result, setResult] = useState<PaginatedResponse<OrgRoleSummaryDto> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const queryKey = JSON.stringify(query);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await api.admin.securityAccess.listOrgRoles(query);
      if (requestId !== requestIdRef.current) return;
      setResult(res);
    } catch (e: unknown) {
      if (requestId !== requestIdRef.current) return;
      setError(getErrorMessage(e, loadError('orgRoles')));
      setResult(null);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [loadError, queryKey]);

  useEffect(() => {
    void load();
  }, [load]);

  return { result, loading, error, refresh: load };
}

export function useRoleDetail(
  roleId: string | null,
  scope: 'platform' | 'organization' | null,
  organizationId?: string | null,
) {
  const [detail, setDetail] = useState<GovernanceRoleDetailDto | null>(null);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);

  useLayoutEffect(() => {
    requestIdRef.current += 1;
    setDetail(null);
    setLoading(!!roleId && !!scope);
  }, [roleId, scope, organizationId]);

  useEffect(() => {
    if (!roleId || !scope) {
      setDetail(null);
      setLoading(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    setLoading(true);
    void api.admin.securityAccess
      .getRole(roleId, scope, organizationId ?? undefined)
      .then((res) => {
        if (requestId !== requestIdRef.current) return;
        setDetail(res);
      })
      .catch(() => {
        if (requestId !== requestIdRef.current) return;
        setDetail(null);
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });
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

export function useAuditLog(query: AuditLogQuery, loadError: (k: LoadErrorKey) => string) {
  const [result, setResult] = useState<PaginatedResponse<AuditLogListItemDto> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const queryKey = JSON.stringify(query);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await api.admin.activityLog(query);
      if (requestId !== requestIdRef.current) return;
      setResult(res as PaginatedResponse<AuditLogListItemDto>);
    } catch (e: unknown) {
      if (requestId !== requestIdRef.current) return;
      setError(getErrorMessage(e, loadError('auditLog')));
      setResult(null);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [loadError, queryKey]);

  useEffect(() => {
    void load();
  }, [load]);

  return { result, loading, error, refresh: load };
}

export function useAuditDetail(auditId: string | null) {
  const [detail, setDetail] = useState<AuditLogDetailDto | null>(null);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);

  useLayoutEffect(() => {
    requestIdRef.current += 1;
    setDetail(null);
    setLoading(!!auditId);
  }, [auditId]);

  useEffect(() => {
    if (!auditId) {
      setDetail(null);
      setLoading(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    setLoading(true);
    void api.admin.activityLogDetail(auditId)
      .then((res) => {
        if (requestId !== requestIdRef.current) return;
        setDetail(res);
      })
      .catch(() => {
        if (requestId !== requestIdRef.current) return;
        setDetail(null);
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });
  }, [auditId]);

  return { detail, loading };
}