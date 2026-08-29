import { useCallback, useEffect, useRef, useState } from 'react';
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
import { translateKey, useLanguage, type SupportedLocale } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';

function resolveHostToastMessage(
  err: unknown,
  hostKey: TranslationKey,
  locale: SupportedLocale,
): string {
  if (err instanceof Error && err.message) return err.message;
  return translateKey(locale, hostKey).text;
}

export function useIamTeam(orgId: string | undefined) {
  const { locale } = useLanguage();
  const localeRef = useRef(locale);
  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  const [kpis, setKpis] = useState<IamTeamKpisDto | null>(null);
  const [team, setTeam] = useState<IamTeamListItemDto[]>([]);
  const [roles, setRoles] = useState<IamRoleListItemDto[]>([]);
  const [security, setSecurity] = useState<IamSecurityOverviewDto | null>(null);
  const [selectedMember, setSelectedMember] = useState<IamTeamMemberDetailDto | null>(null);
  const [selectedRole, setSelectedRole] = useState<IamRoleDetailDto | null>(null);

  const [loading, setLoading] = useState(true);
  const [memberLoading, setMemberLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorHostKey, setErrorHostKey] = useState<TranslationKey | null>(null);

  const loadTeam = useCallback(
    async (search?: string) => {
      if (!orgId?.trim()) return;
      setLoading(true);
      setError(null);
      setErrorHostKey(null);
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
        if (err instanceof Error && err.message) {
          setError(err.message);
          setErrorHostKey(null);
        } else {
          setError(null);
          setErrorHostKey('iam.member.error.loadTeam');
        }
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
      toast.error(resolveHostToastMessage(err, 'iam.member.error.loadSecurity', localeRef.current));
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
        toast.error(resolveHostToastMessage(err, 'iam.member.error.loadMember', localeRef.current));
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
        toast.error(resolveHostToastMessage(err, 'iam.member.error.loadRole', localeRef.current));
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
    errorHostKey,
    loadTeam,
    loadSecurity,
    openMember,
    openRole,
    setSelectedMember,
    setSelectedRole,
    refreshAll,
  };
}
