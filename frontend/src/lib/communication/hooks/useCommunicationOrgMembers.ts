import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api';

export interface CommunicationOrgMember {
  id: string;
  displayName: string;
  isActive: boolean;
}

function mapOrgMember(user: {
  id: string;
  name?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  status?: string;
  membershipStatus?: string;
}): CommunicationOrgMember {
  const displayName =
    user.displayName
    || user.name
    || `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()
    || user.email
    || user.id;
  const isActive = user.status === 'Active' && user.membershipStatus === 'ACTIVE';
  return { id: user.id, displayName, isActive };
}

export function useCommunicationOrgMembers(orgId: string | null | undefined) {
  const [members, setMembers] = useState<CommunicationOrgMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const loadedOrgRef = useRef<string | null>(null);
  const inflightOrgRef = useRef<string | null>(null);

  useEffect(() => {
    if (orgId !== loadedOrgRef.current) {
      setMembers([]);
      setLoadError(false);
      loadedOrgRef.current = null;
    }
  }, [orgId]);

  const ensureLoaded = useCallback(async () => {
    if (!orgId) return;
    if (loadedOrgRef.current === orgId) return;
    if (inflightOrgRef.current === orgId) return;

    const requestOrgId = orgId;
    inflightOrgRef.current = requestOrgId;
    setLoading(true);
    setLoadError(false);

    try {
      const response = await api.users.listByOrg(requestOrgId);
      if (inflightOrgRef.current !== requestOrgId) return;
      const list = Array.isArray(response) ? response : [];
      setMembers(list.map(mapOrgMember));
      loadedOrgRef.current = requestOrgId;
    } catch {
      if (inflightOrgRef.current === requestOrgId) {
        setLoadError(true);
        setMembers([]);
      }
    } finally {
      if (inflightOrgRef.current === requestOrgId) {
        inflightOrgRef.current = null;
        setLoading(false);
      }
    }
  }, [orgId]);

  const eligibleMembers = members.filter((member) => member.isActive);

  return {
    members: eligibleMembers,
    allMembers: members,
    loading,
    loadError,
    ensureLoaded,
    isLoaded: loadedOrgRef.current === orgId,
  };
}

export type UseCommunicationOrgMembersResult = ReturnType<typeof useCommunicationOrgMembers>;
