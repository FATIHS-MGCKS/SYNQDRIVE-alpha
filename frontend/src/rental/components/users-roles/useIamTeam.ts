import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  api,
  type IamRoleDetailDto,
  type IamRoleListItemDto,
  type IamSecurityOverviewDto,
  type IamTeamKpisDto,
  type IamTeamListItemDto,
  type IamTeamMemberDetailDto,
} from '../../../lib/api';

function extractError(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function useIamTeam(orgId: string | undefined) {
  const [kpis, setKpis] = useState<IamTeamKpisDto | null>(null);
  const [team, setTeam] = useState<IamTeamListItemDto[]>([]);
  const [roles, setRoles] = useState<IamRoleListItemDto[]>([]);
  const [security, setSecurity] = useState<IamSecurityOverviewDto | null>(null);
  const [selectedMember, setSelectedMember] = useState<IamTeamMemberDetailDto | null>(null);
  const [selectedRole, setSelectedRole] = useState<IamRoleDetailDto | null>(null);

  const [loading, setLoading] = useState(true);
  const [memberLoading, setMemberLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTeam = useCallback(
    async (search?: string) => {
      if (!orgId?.trim()) return;
      setLoading(true);
      setError(null);
      try {
        const [kpiData, teamData, roleData] = await Promise.all([
          api.iam.teamKpis(orgId),
          api.iam.teamList(orgId, search),
          api.iam.rolesList(orgId),
        ]);
        setKpis(kpiData);
        setTeam(Array.isArray(teamData) ? teamData : []);
        setRoles(Array.isArray(roleData) ? roleData : []);
      } catch (err) {
        setError(extractError(err, 'Failed to load team'));
      } finally {
        setLoading(false);
      }
    },
    [orgId],
  );

  const loadSecurity = useCallback(async () => {
    if (!orgId?.trim()) return;
    try {
      const data = await api.iam.securityOverview(orgId);
      setSecurity(data);
    } catch (err) {
      toast.error(extractError(err, 'Failed to load security overview'));
    }
  }, [orgId]);

  const openMember = useCallback(
    async (membershipId: string) => {
      if (!orgId) return;
      setMemberLoading(true);
      try {
        const detail = await api.iam.teamMember(orgId, membershipId);
        setSelectedMember(detail);
      } catch (err) {
        toast.error(extractError(err, 'Failed to load member'));
      } finally {
        setMemberLoading(false);
      }
    },
    [orgId],
  );

  const openRole = useCallback(
    async (roleId: string) => {
      if (!orgId) return;
      try {
        const detail = await api.iam.roleDetail(orgId, roleId);
        setSelectedRole(detail);
      } catch (err) {
        toast.error(extractError(err, 'Failed to load role'));
      }
    },
    [orgId],
  );

  const refreshAll = useCallback(async () => {
    await Promise.all([loadTeam(), loadSecurity()]);
  }, [loadTeam, loadSecurity]);

  useEffect(() => {
    void loadTeam();
    void loadSecurity();
  }, [loadTeam, loadSecurity]);

  return {
    kpis,
    team,
    roles,
    security,
    selectedMember,
    selectedRole,
    loading,
    memberLoading,
    error,
    loadTeam,
    loadSecurity,
    openMember,
    openRole,
    setSelectedMember,
    setSelectedRole,
    refreshAll,
  };
}
