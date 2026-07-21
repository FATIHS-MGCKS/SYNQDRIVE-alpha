import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import {
  getRefreshToken,
  getStoredUser,
  patchStoredUser,
  setAuth,
  type AuthOrganizationOption,
  type AuthUser,
} from '../lib/auth';
import { api } from '../lib/api';

interface RentalContextValue {
  orgId: string;
  orgName: string;
  orgLogoUrl: string | null;
  loading: boolean;
  userRole: string | null;
  userPermissions: Record<string, { read: boolean; write: boolean; manage?: boolean }> | null;
  availableOrganizations: AuthOrganizationOption[];
  switchingOrganization: boolean;
  hasPermission: (module: string, level: 'read' | 'write' | 'manage') => boolean;
  switchOrganization: (organizationId: string) => Promise<void>;
  setOrgBranding: (patch: { orgName?: string; orgLogoUrl?: string | null }) => void;
}

const RentalCtx = createContext<RentalContextValue>({
  orgId: '',
  orgName: '',
  orgLogoUrl: null,
  loading: true,
  userRole: null,
  userPermissions: null,
  availableOrganizations: [],
  switchingOrganization: false,
  hasPermission: () => false,
  switchOrganization: async () => undefined,
  setOrgBranding: () => {},
});

function applyUserToState(
  user: AuthUser,
  setters: {
    setOrgId: (value: string) => void;
    setOrgName: (value: string) => void;
    setOrgLogoUrl: (value: string | null) => void;
    setUserRole: (value: string | null) => void;
    setUserPermissions: (
      value: Record<string, { read: boolean; write: boolean; manage?: boolean }> | null,
    ) => void;
  },
) {
  setters.setOrgId(user.organizationId ?? '');
  setters.setOrgName(user.organizationName ?? '');
  setters.setOrgLogoUrl(user.organizationLogoUrl ?? null);
  setters.setUserRole(user.membershipRole);
  setters.setUserPermissions(user.permissions ?? null);
}

export function RentalProvider({ children }: { children: ReactNode }) {
  const [orgId, setOrgId] = useState('');
  const [orgName, setOrgName] = useState('');
  const [orgLogoUrl, setOrgLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userPermissions, setUserPermissions] = useState<Record<
    string,
    { read: boolean; write: boolean; manage?: boolean }
  > | null>(null);
  const [availableOrganizations, setAvailableOrganizations] = useState<AuthOrganizationOption[]>([]);
  const [switchingOrganization, setSwitchingOrganization] = useState(false);

  const hydrateFromUser = useCallback((user: AuthUser) => {
    applyUserToState(user, {
      setOrgId,
      setOrgName,
      setOrgLogoUrl,
      setUserRole,
      setUserPermissions,
    });
  }, []);

  const loadMemberships = useCallback(async () => {
    try {
      const response = await api.auth.memberships();
      setAvailableOrganizations(response.organizations ?? []);
    } catch {
      setAvailableOrganizations([]);
    }
  }, []);

  useEffect(() => {
    const user = getStoredUser();
    if (user?.organizationId) {
      hydrateFromUser(user);
      setLoading(false);
      void loadMemberships();
      return;
    }
    api.organizations.list().then((res) => {
      const rental = (res.data || []).find(
        (o: any) => o.business_type === 'Rental' && o.status === 'Active',
      );
      if (rental) {
        setOrgId(rental.id);
        setOrgName(rental.company_name ?? '');
        setOrgLogoUrl(rental.logo_url ?? rental.logoUrl ?? null);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [hydrateFromUser, loadMemberships]);

  const hasPermission = useCallback((module: string, level: 'read' | 'write' | 'manage'): boolean => {
    if (userRole === 'ORG_ADMIN') return true;
    if (!userPermissions) return false;
    const perm = userPermissions[module];
    if (!perm) return false;
    if (level === 'read') return perm.read === true || perm.write === true || perm.manage === true;
    if (level === 'write') return perm.write === true || perm.manage === true;
    return perm.manage === true;
  }, [userRole, userPermissions]);

  const switchOrganization = useCallback(async (organizationId: string) => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      throw new Error('Refresh token missing — please sign in again');
    }
    setSwitchingOrganization(true);
    try {
      const result = await api.auth.switchOrganization(organizationId, refreshToken);
      const storedUser = getStoredUser();
      const nextUser: AuthUser = {
        ...(storedUser ?? result.user),
        ...result.user,
        organizationId: result.user.organizationId,
        organizationName: result.user.organizationName,
        organizationLogoUrl: result.user.organizationLogoUrl,
        membershipRole: result.user.membershipRole,
        membershipId: result.user.membershipId,
        permissions: result.user.permissions,
      };
      setAuth(result.accessToken, nextUser, result.refreshToken);
      hydrateFromUser(nextUser);
      setAvailableOrganizations(result.organizations ?? []);
      window.location.reload();
    } finally {
      setSwitchingOrganization(false);
    }
  }, [hydrateFromUser]);

  const setOrgBranding = useCallback(
    (patch: { orgName?: string; orgLogoUrl?: string | null }) => {
      const storedPatch: Partial<{
        organizationName: string | null;
        organizationLogoUrl: string | null;
      }> = {};
      if (typeof patch.orgName === 'string') {
        setOrgName(patch.orgName);
        storedPatch.organizationName = patch.orgName;
      }
      if (patch.orgLogoUrl !== undefined) {
        setOrgLogoUrl(patch.orgLogoUrl);
        storedPatch.organizationLogoUrl = patch.orgLogoUrl;
      }
      if (Object.keys(storedPatch).length > 0) {
        patchStoredUser(storedPatch);
      }
    },
    [],
  );

  return (
    <RentalCtx.Provider
      value={{
        orgId,
        orgName,
        orgLogoUrl,
        loading,
        userRole,
        userPermissions,
        availableOrganizations,
        switchingOrganization,
        hasPermission,
        switchOrganization,
        setOrgBranding,
      }}
    >
      {children}
    </RentalCtx.Provider>
  );
}

export function useRentalOrg() {
  return useContext(RentalCtx);
}
