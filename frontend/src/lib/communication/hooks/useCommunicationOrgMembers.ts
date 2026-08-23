import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import {
  mapOrgUserToCommunicationMember,
  type OrgUserListRecord,
} from '../org-member-display';

export interface CommunicationOrgMember {
  id: string;
  displayName: string;
  isActive: boolean;
}

export type CommunicationOrgMembersLoadError = 'permission_denied' | 'network' | 'unknown' | null;

export function useCommunicationOrgMembers(orgId: string | null | undefined) {
  const [members, setMembers] = useState<CommunicationOrgMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<CommunicationOrgMembersLoadError>(null);
  const activeOrgRef = useRef<string | null>(orgId ?? null);
  const loadedOrgRef = useRef<string | null>(null);
  const requestGenerationRef = useRef(0);

  useEffect(() => {
    activeOrgRef.current = orgId ?? null;
    requestGenerationRef.current += 1;
    setMembers([]);
    setLoadError(null);
    loadedOrgRef.current = null;
    setLoading(false);
  }, [orgId]);

  const ensureLoaded = useCallback(async () => {
    const requestOrgId = activeOrgRef.current;
    if (!requestOrgId) return;
    if (loadedOrgRef.current === requestOrgId) return;

    const requestGeneration = requestGenerationRef.current;
    setLoading(true);
    setLoadError(null);

    try {
      const response = await api.users.listByOrg(requestOrgId);
      if (
        requestGenerationRef.current !== requestGeneration
        || activeOrgRef.current !== requestOrgId
      ) {
        return;
      }
      const list = Array.isArray(response) ? response : [];
      setMembers(list.map((user) => mapOrgUserToCommunicationMember(user as OrgUserListRecord)));
      loadedOrgRef.current = requestOrgId;
    } catch (err: unknown) {
      if (
        requestGenerationRef.current !== requestGeneration
        || activeOrgRef.current !== requestOrgId
      ) {
        return;
      }
      const status = (err as { status?: number })?.status;
      const message = err instanceof Error ? err.message : '';
      if (status === 403 || status === 401 || message.includes('403')) {
        setLoadError('permission_denied');
      } else if (message.includes('API error 5') || message.toLowerCase().includes('network')) {
        setLoadError('network');
      } else {
        setLoadError('unknown');
      }
      setMembers([]);
      loadedOrgRef.current = null;
    } finally {
      if (
        requestGenerationRef.current === requestGeneration
        && activeOrgRef.current === requestOrgId
      ) {
        setLoading(false);
      }
    }
  }, []);

  const eligibleMembers = members.filter((member) => member.isActive);

  return {
    members: eligibleMembers,
    allMembers: members,
    loading,
    loadError,
    ensureLoaded,
    isLoaded: loadedOrgRef.current === orgId,
    canLoadDirectory: loadError !== 'permission_denied',
  };
}

export type UseCommunicationOrgMembersResult = ReturnType<typeof useCommunicationOrgMembers>;
