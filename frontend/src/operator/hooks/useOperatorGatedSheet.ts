import { useCallback } from 'react';
import { useOperatorShell } from '../context/OperatorShellContext';
import type { OperatorSheetAction } from '../lib/operatorTypes';
import { operatorSheetPermission } from '../lib/operatorPermissionGate.utils';
import { useOperatorPermissions } from './useOperatorPermissions';

/**
 * Wraps `openSheet` with operator permission checks (UX gate).
 * Returns false when the action is denied so callers can skip navigation side-effects.
 */
export function useOperatorGatedSheet() {
  const { openSheet } = useOperatorShell();
  const { can } = useOperatorPermissions();

  return useCallback(
    (action: OperatorSheetAction): boolean => {
      const permission = operatorSheetPermission(action);
      if (!can(permission)) return false;
      openSheet(action);
      return true;
    },
    [can, openSheet],
  );
}
