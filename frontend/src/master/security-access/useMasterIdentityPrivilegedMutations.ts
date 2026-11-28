import { useCallback, useRef } from 'react';
import {
  shouldClearPendingIamMutation,
  shouldRetainPendingIamMutation,
  type MasterIamPendingMutation,
} from '../organizations/master-organization-iam-mutation';

export function useMasterIdentityPrivilegedMutations() {
  const pendingRef = useRef<MasterIamPendingMutation | null>(null);
  const inFlightRef = useRef(false);

  const clearPending = useCallback(() => {
    pendingRef.current = null;
  }, []);

  const runWithStepUp = useCallback(
    async (
      run: () => Promise<void>,
      options?: { onSuccess?: () => void | Promise<void>; isStepUpRetry?: boolean },
    ) => {
      if (inFlightRef.current) {
        throw new Error('IDENTITY_MUTATION_IN_FLIGHT');
      }
      inFlightRef.current = true;
      try {
        await run();
        pendingRef.current = null;
        if (options?.onSuccess) await options.onSuccess();
      } catch (err) {
        if (shouldRetainPendingIamMutation(err)) {
          if (!options?.isStepUpRetry) {
            pendingRef.current = { run, onSuccess: options?.onSuccess };
          }
        } else if (shouldClearPendingIamMutation(err) || !shouldRetainPendingIamMutation(err)) {
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
    await runWithStepUp(pending.run, {
      onSuccess: pending.onSuccess,
      isStepUpRetry: true,
    });
    return true;
  }, [runWithStepUp]);

  return {
    runWithStepUp,
    retryPendingAfterStepUp,
    clearPending,
    hasPending: () => Boolean(pendingRef.current),
  };
}

export type MasterIdentityPrivilegedMutations = ReturnType<typeof useMasterIdentityPrivilegedMutations>;