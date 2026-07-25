import type { ReactNode } from 'react';
import type { OperatorPermissionAction } from '../lib/operatorPermissions';
import { useOperatorPermissions, type OperatorPermissionCheckOptions } from '../hooks/useOperatorPermissions';

interface OperatorPermissionGateProps {
  action: OperatorPermissionAction;
  options?: OperatorPermissionCheckOptions;
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Renders children only when the operator action is permitted.
 * Use for sections that must not mount (and must not prefetch data) without read access.
 */
export function OperatorPermissionGate({
  action,
  options,
  fallback = null,
  children,
}: OperatorPermissionGateProps) {
  const { loading, can } = useOperatorPermissions();

  if (loading) return null;
  if (!can(action, options)) return <>{fallback}</>;
  return <>{children}</>;
}
