import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  api,
  type OrganizationInviteDto,
  type OrganizationInviteStatus,
  type OrganizationRoleDto,
  type OrgUserDto,
  type Station,
} from '../../../lib/api';
import { extractApiError } from './utils';

export function useAccessControlCenter(orgId: string | undefined) {
  const [users, setUsers] = useState<OrgUserDto[]>([]);
  const [invites, setInvites] = useState<OrganizationInviteDto[]>([]);
  const [roles, setRoles] = useState<OrganizationRoleDto[]>([]);
  const [stations, setStations] = useState<Station[]>([]);

  const [usersLoading, setUsersLoading] = useState(true);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [stationsLoading, setStationsLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [invitesError, setInvitesError] = useState<string | null>(null);
  const [rolesError, setRolesError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    if (!orgId?.trim()) {
      setUsers([]);
      setUsersLoading(false);
      return;
    }
    setUsersLoading(true);
    setUsersError(null);
    try {
      const list = await api.users.listByOrg(orgId);
      setUsers(
        (Array.isArray(list) ? list : []).filter(
          (u: OrgUserDto) => u.membershipStatus !== 'REMOVED',
        ),
      );
    } catch (err) {
      setUsers([]);
      setUsersError(extractApiError(err, 'Benutzer konnten nicht geladen werden.'));
    } finally {
      setUsersLoading(false);
    }
  }, [orgId]);

  const loadInvites = useCallback(
    async (status?: OrganizationInviteStatus) => {
      if (!orgId?.trim()) {
        setInvites([]);
        return;
      }
      setInvitesLoading(true);
      setInvitesError(null);
      try {
        const list = await api.organizationInvites.list(orgId, status);
        setInvites(Array.isArray(list) ? list : []);
      } catch (err) {
        setInvites([]);
        setInvitesError(extractApiError(err, 'Einladungen konnten nicht geladen werden.'));
      } finally {
        setInvitesLoading(false);
      }
    },
    [orgId],
  );

  const loadRoles = useCallback(async () => {
    if (!orgId?.trim()) {
      setRoles([]);
      return;
    }
    setRolesLoading(true);
    setRolesError(null);
    try {
      const list = await api.organizationRoles.list(orgId);
      setRoles(Array.isArray(list) ? list : []);
    } catch (err) {
      setRoles([]);
      setRolesError(extractApiError(err, 'Rollen konnten nicht geladen werden.'));
    } finally {
      setRolesLoading(false);
    }
  }, [orgId]);

  const loadStations = useCallback(async () => {
    if (!orgId?.trim()) {
      setStations([]);
      return;
    }
    setStationsLoading(true);
    try {
      const list = await api.stations.list(orgId);
      setStations(Array.isArray(list) ? list : []);
    } catch {
      setStations([]);
    } finally {
      setStationsLoading(false);
    }
  }, [orgId]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadUsers(), loadInvites(), loadRoles(), loadStations()]);
  }, [loadUsers, loadInvites, loadRoles, loadStations]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const stationNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of stations) map.set(s.id, s.name);
    return map;
  }, [stations]);

  const pendingInviteCount = useMemo(
    () => invites.filter((i) => i.status === 'PENDING').length,
    [invites],
  );

  const kpis = useMemo(() => {
    const active = users.filter((u) => u.status === 'Active').length;
    const admins = users.filter(
      (u) => u.roleKey === 'ORG_ADMIN' || u.roleKey === 'SUB_ADMIN',
    ).length;
    const scoped = users.filter(
      (u) => Boolean(u.stationScope?.trim()) || (u.stationIds?.length ?? 0) > 0,
    ).length;
    return {
      total: users.length,
      active,
      pendingInvites: pendingInviteCount,
      admins,
      scoped,
    };
  }, [users, pendingInviteCount]);

  const notifySuccess = (msg: string) => toast.success(msg);
  const notifyError = (err: unknown, fallback: string) =>
    toast.error(extractApiError(err, fallback));

  return {
    users,
    invites,
    roles,
    stations,
    stationNameById,
    kpis,
    usersLoading,
    invitesLoading,
    rolesLoading,
    stationsLoading,
    usersError,
    invitesError,
    rolesError,
    loadUsers,
    loadInvites,
    loadRoles,
    loadStations,
    refreshAll,
    notifySuccess,
    notifyError,
  };
}
