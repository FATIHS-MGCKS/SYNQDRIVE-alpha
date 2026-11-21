/** Supported Master Admin organization status transitions (backend PATCH contract). */
export type OrgLifecycleAction = 'activate' | 'suspend' | 'reactivate';

export function allowedOrgLifecycleActions(orgStatus: string): OrgLifecycleAction[] {
  switch (orgStatus) {
    case 'PENDING':
      return ['activate'];
    case 'ACTIVE':
      return ['suspend'];
    case 'SUSPENDED':
      return ['reactivate'];
    default:
      return [];
  }
}

export function orgLifecyclePatchStatus(action: OrgLifecycleAction): 'ACTIVE' | 'SUSPENDED' {
  switch (action) {
    case 'activate':
    case 'reactivate':
      return 'ACTIVE';
    case 'suspend':
      return 'SUSPENDED';
  }
}

export function isArchivingExposed(): boolean {
  return false;
}