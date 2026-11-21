import { useCallback, useRef } from 'react';
import { api } from '../../lib/api';
import {
  shouldClearPendingOrgPatch,
  shouldRetainPendingOrgPatch,
  type MasterOrgPatchPending,
} from './master-organization-patch';

export function useMasterOrganizationPatch() {
  const pendingRef = useRef<MasterOrgPatchPending | null>(null);
  const inFlightRef = useRef(false);

  const clearPending = useCallback(() => {
    pendingRef.current = null;
  }, []);

  const patchOrganization = useCallback(
    async (
      orgId: string,
      data: Record<string, unknown>,
      options?: { onSuccess?: () => void | Promise<void>; isStepUpRetry?: boolean },
    ) => {
      if (inFlightRef.current) {
        throw new Error('ORG_PATCH_IN_FLIGHT');
      }
      inFlightRef.current = true;
      try {
        await api.organizations.update(orgId, data);
        pendingRef.current = null;
        if (options?.onSuccess) await options.onSuccess();
      } catch (err) {
        if (shouldRetainPendingOrgPatch(err)) {
          if (!options?.isStepUpRetry) {
            pendingRef.current = { orgId, data, onSuccess: options?.onSuccess };
          }
        } else if (shouldClearPendingOrgPatch(err) || !shouldRetainPendingOrgPatch(err)) {
          pendingRef.current = null;
        }
        throw err;
      } finally {
        inFlightRef.current = false;
      }
    },
    [],
  );

  const retryPendingAfterStepUp = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending) return false;
    await patchOrganization(pending.orgId, pending.data, {
      onSuccess: pending.onSuccess,
      isStepUpRetry: true,
    });
    return true;
  }, [patchOrganization]);

  return {
    patchOrganization,
    retryPendingAfterStepUp,
    clearPending,
    hasPending: () => Boolean(pendingRef.current),
  };
}