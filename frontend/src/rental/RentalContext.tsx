import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { getStoredUser, patchStoredUser } from '../lib/auth';
import { api } from '../lib/api';

interface RentalContextValue {
  orgId: string;
  orgName: string;
  orgLogoUrl: string | null;
  loading: boolean;
  userRole: string | null;
  userPermissions: Record<string, { read: boolean; write: boolean }> | null;
  hasPermission: (module: string, level: 'read' | 'write') => boolean;
  /** Update orgName + orgLogoUrl in memory and persist to the stored auth user
   *  so other consumers (RightSidebar, TopBar, …) re-render immediately. */
  setOrgBranding: (patch: { orgName?: string; orgLogoUrl?: string | null }) => void;
}

const RentalCtx = createContext<RentalContextValue>({
  orgId: '',
  orgName: '',
  orgLogoUrl: null,
  loading: true,
  userRole: null,
  userPermissions: null,
  hasPermission: () => false,
  setOrgBranding: () => {},
});

export function RentalProvider({ children }: { children: ReactNode }) {
  const [orgId, setOrgId] = useState('');
  const [orgName, setOrgName] = useState('');
  const [orgLogoUrl, setOrgLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userPermissions, setUserPermissions] = useState<Record<string, { read: boolean; write: boolean }> | null>(null);

  useEffect(() => {
    const user = getStoredUser();
    if (user?.organizationId) {
      setOrgId(user.organizationId);
      setOrgName(user.organizationName ?? '');
      setOrgLogoUrl(user.organizationLogoUrl ?? null);
      setUserRole(user.membershipRole);
      setUserPermissions(user.permissions ?? null);
      setLoading(false);
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
  }, []);

  const hasPermission = useCallback((module: string, level: 'read' | 'write'): boolean => {
    if (userRole === 'ORG_ADMIN') return true;
    if (!userPermissions) return false;
    const perm = userPermissions[module];
    if (!perm) return false;
    return level === 'write' ? perm.write : perm.read;
  }, [userRole, userPermissions]);

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
    <RentalCtx.Provider value={{ orgId, orgName, orgLogoUrl, loading, userRole, userPermissions, hasPermission, setOrgBranding }}>
      {children}
    </RentalCtx.Provider>
  );
}

export function useRentalOrg() {
  return useContext(RentalCtx);
}
