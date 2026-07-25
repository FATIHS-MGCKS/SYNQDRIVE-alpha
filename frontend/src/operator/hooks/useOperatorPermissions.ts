import { useCallback, useMemo } from 'react';
import { getStoredUser, isMasterAdmin } from '../../lib/auth';
import { useRentalOrg } from '../../rental/RentalContext';
import {
  evaluateOperatorPermission,
  type OperatorPermissionAction,
} from '../lib/operatorPermissions';
import { operatorPermissionDenialMessage } from '../lib/operatorPermissionMessages';
import {
  mergeOperatorGates,
  permissionGate,
  type OperatorActionGate,
} from '../lib/operatorPermissionGate.utils';

export interface OperatorPermissionCheckOptions {
  allowSupervisorFallback?: boolean;
}

/**
 * Central Operator RBAC hook — wraps membership permissions + field-agent flag.
 * Frontend gates are UX only; backend enforcement remains authoritative.
 */
export function useOperatorPermissions() {
  const { loading, userRole, userPermissions } = useRentalOrg();
  const storedUser = getStoredUser();
  const fieldAgentAccess = storedUser?.fieldAgentAccess ?? false;
  const masterAdmin = isMasterAdmin();

  const context = useMemo(
    () => ({
      membershipRole: userRole,
      fieldAgentAccess,
    }),
    [userRole, fieldAgentAccess],
  );

  const permissionsReady = !loading && (masterAdmin || userPermissions != null);

  const can = useCallback(
    (action: OperatorPermissionAction, options: OperatorPermissionCheckOptions = {}): boolean => {
      if (masterAdmin) return true;
      if (!permissionsReady) return false;
      return evaluateOperatorPermission(userPermissions, action, {
        ...context,
        allowSupervisorFallback: options.allowSupervisorFallback ?? false,
      });
    },
    [context, masterAdmin, permissionsReady, userPermissions],
  );

  const reason = useCallback(
    (action: OperatorPermissionAction): string => operatorPermissionDenialMessage(action),
    [],
  );

  const gate = useCallback(
    (
      action: OperatorPermissionAction,
      options: OperatorPermissionCheckOptions = {},
    ): OperatorActionGate => {
      if (loading) {
        return { allowed: false, reason: 'Berechtigungen werden geladen…' };
      }
      if (!permissionsReady && !masterAdmin) {
        return { allowed: false, reason: 'Berechtigungen nicht verfügbar.' };
      }
      return permissionGate(
        can(action, options),
        reason(action),
      );
    },
    [can, loading, masterAdmin, permissionsReady, reason],
  );

  const gateFor = useCallback(
    (
      action: OperatorPermissionAction,
      businessGate?: OperatorActionGate,
      options?: OperatorPermissionCheckOptions,
    ): OperatorActionGate => {
      return mergeOperatorGates(gate(action, options), businessGate ?? { allowed: true });
    },
    [gate],
  );

  return {
    loading,
    permissionsReady,
    isMasterAdmin: masterAdmin,
    fieldAgentAccess,
    can,
    reason,
    gate,
    gateFor,
    mergeGates: mergeOperatorGates,
  };
}
