import { useCallback, useRef } from 'react';
import {
  captureAuthRequestDispatchIdentity,
  type AuthRequestDispatchIdentity,
} from '../../lib/auth-api-transport';
import {
  shouldClearPendingIamMutation,
  shouldRetainPendingIamMutation,
} from '../organizations/master-organization-iam-mutation';
import {
  authDispatchIdentityMatches,
  cloneIdentityPendingOp,
  executeIdentityPrivilegedMutation,
  type MasterIdentityPendingOp,
} from './master-identity-privileged-admission';

export type MasterIdentityPrivilegedRunRequest = {
  op: MasterIdentityPendingOp;
  assertStillAdmitted: () => boolean;
  onSuccess?: (result: unknown) => void | Promise<void>;
  isStepUpRetry?: boolean;
};

type StoredPending = {
  op: MasterIdentityPendingOp;
  authIdentity: AuthRequestDispatchIdentity;
  assertStillAdmitted: () => boolean;
  onSuccess?: (result: unknown) => void | Promise<void>;
};

function assertPreDispatch(pending: StoredPending): void {
  if (!pending.assertStillAdmitted()) {
    throw new Error('IDENTITY_ADMISSION_STALE');
  }
  if (!authDispatchIdentityMatches(pending.authIdentity)) {
    throw new Error('IDENTITY_AUTH_DISPATCH_CHANGED');
  }
}

export function useMasterIdentityPrivilegedMutations() {
  const pendingRef = useRef<StoredPending | null>(null);
  const inFlightRef = useRef(false);

  const clearPending = useCallback(() => {
    pendingRef.current = null;
  }, []);

  const clearPendingIf = useCallback((predicate: (op: MasterIdentityPendingOp) => boolean) => {
    const pending = pendingRef.current;
    if (pending && predicate(pending.op)) {
      pendingRef.current = null;
    }
  }, []);

  const isPendingFor = useCallback(
    (predicate: (op: MasterIdentityPendingOp) => boolean) => {
      const pending = pendingRef.current;
      return Boolean(pending && predicate(pending.op));
    },
    [],
  );

  const runWithStepUp = useCallback(async (request: MasterIdentityPrivilegedRunRequest) => {
    if (inFlightRef.current) {
      throw new Error('IDENTITY_MUTATION_IN_FLIGHT');
    }
    const stored: StoredPending = {
      op: cloneIdentityPendingOp(request.op),
      authIdentity: captureAuthRequestDispatchIdentity(),
      assertStillAdmitted: request.assertStillAdmitted,
      onSuccess: request.onSuccess,
    };
    inFlightRef.current = true;
    try {
      assertPreDispatch(stored);
      const result = await executeIdentityPrivilegedMutation(stored.op);
      assertPreDispatch(stored);
      pendingRef.current = null;
      if (request.onSuccess) await request.onSuccess(result);
    } catch (err) {
      if (shouldRetainPendingIamMutation(err)) {
        if (!request.isStepUpRetry) {
          pendingRef.current = stored;
        }
      } else if (shouldClearPendingIamMutation(err) || !shouldRetainPendingIamMutation(err)) {
        pendingRef.current = null;
      }
      throw err;
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const retryPendingAfterStepUp = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending) return false;
    try {
      assertPreDispatch(pending);
    } catch {
      pendingRef.current = null;
      throw new Error('IDENTITY_ADMISSION_STALE');
    }
    await runWithStepUp({
      op: pending.op,
      assertStillAdmitted: pending.assertStillAdmitted,
      onSuccess: pending.onSuccess,
      isStepUpRetry: true,
    });
    return true;
  }, [runWithStepUp]);

  return {
    runWithStepUp,
    retryPendingAfterStepUp,
    clearPending,
    clearPendingIf,
    hasPending: () => Boolean(pendingRef.current),
    isPendingFor,
  };
}

export type MasterIdentityPrivilegedMutations = ReturnType<typeof useMasterIdentityPrivilegedMutations>;