import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { getStoredUser } from '../lib/auth';
import { api } from '../lib/api';

interface RentalContextValue {
  orgId: string;
  orgName: string;
  loading: boolean;
  userRole: string | null;
  userPermissions: Record<string, { read: boolean; write: boolean }> | null;
  hasPermission: (module: string, level: 'read' | 'write') => boolean;
}

const RentalCtx = createContext<RentalContextValue>({
  orgId: '',
  orgName: '',
  loading: true,
  userRole: null,
  userPermissions: null,
  hasPermission: () => false,
});

export function RentalProvider({ children }: { children: ReactNode }) {
  const [orgId, setOrgId] = useState('');
  const [orgName, setOrgName] = useState('');
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userPermissions, setUserPermissions] = useState<Record<string, { read: boolean; write: boolean }> | null>(null);

  useEffect(() => {
    const user = getStoredUser();
    if (user?.organizationId) {
      setOrgId(user.organizationId);
      setOrgName(user.organizationName ?? '');
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

  return (
    <RentalCtx.Provider value={{ orgId, orgName, loading, userRole, userPermissions, hasPermission }}>
      {children}
    </RentalCtx.Provider>
  );
}

export function useRentalOrg() {
  return useContext(RentalCtx);
}
