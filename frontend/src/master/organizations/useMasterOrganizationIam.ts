import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  api,
  getErrorMessage,
  type IamTeamListItemDto,
  type OrganizationInviteDto,
  type OrganizationRoleDto,
} from '../../lib/api';

export function useMasterOrganizationIam(orgId: string) {
  const [team, setTeam] = useState<IamTeamListItemDto[]>([]);
  const [invites, setInvites] = useState<OrganizationInviteDto[]>([]);
  const [roles, setRoles] = useState<OrganizationRoleDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!orgId?.trim()) {
      setTeam([]);
      setInvites([]);
      setRoles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [teamRes, inviteRes, roleRes] = await Promise.all([
        api.iam.teamList(orgId, search.trim() || undefined),
        api.organizationInvites.list(orgId),
        api.organizationRoles.list(orgId),
      ]);
      setTeam(Array.isArray(teamRes) ? teamRes : []);
      setInvites(Array.isArray(inviteRes) ? inviteRes : []);
      setRoles(Array.isArray(roleRes) ? roleRes : []);
    } catch (e) {
      setTeam([]);
      setInvites([]);
      setRoles([]);
      setError(getErrorMessage(e, 'IAM data could not be loaded'));
    } finally {
      setLoading(false);
    }
  }, [orgId, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const members = useMemo(
    () => team.filter((row) => row.kind === 'MEMBER'),
    [team],
  );

  const pendingInvites = useMemo(
    () => invites.filter((i) => i.status === 'PENDING'),
    [invites],
  );

  return {
    team,
    members,
    invites,
    pendingInvites,
    roles,
    loading,
    error,
    search,
    setSearch,
    refresh: load,
  };
}