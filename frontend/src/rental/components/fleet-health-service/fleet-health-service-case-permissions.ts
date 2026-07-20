export interface ServiceCasePermissionSet {
  canRead: boolean;
  canUpdate: boolean;
  canSchedule: boolean;
  canComplete: boolean;
  canCancel: boolean;
  canManageCosts: boolean;
  canComment: boolean;
}

/**
 * Mirrors backend `SERVICE_CASE_PERMISSION_REQUIREMENTS` via vendor-management module flags.
 */
export function resolveServiceCasePermissions(input: {
  membershipRole: string | null;
  hasPermission: (module: string, level: 'read' | 'write' | 'manage') => boolean;
}): ServiceCasePermissionSet {
  if (input.membershipRole === 'ORG_ADMIN') {
    return {
      canRead: true,
      canUpdate: true,
      canSchedule: true,
      canComplete: true,
      canCancel: true,
      canManageCosts: true,
      canComment: true,
    };
  }

  const canRead = input.hasPermission('vendor-management', 'read');
  const canWrite = input.hasPermission('vendor-management', 'write');
  const canManage = input.hasPermission('vendor-management', 'manage');

  return {
    canRead,
    canUpdate: canWrite,
    canSchedule: canWrite,
    canComplete: canWrite,
    canCancel: canWrite,
    canManageCosts: canManage,
    canComment: canWrite,
  };
}
