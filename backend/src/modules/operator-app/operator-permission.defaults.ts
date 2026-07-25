import type { MembershipPermissionsMap } from '@shared/auth/permission.util';

const all = (read: boolean, write: boolean, manage = false) => ({ read, write, manage });

/** Operator shell: today board, scan, read-only navigation. */
export function operatorAppReadPermissions(): MembershipPermissionsMap {
  return {
    'operator-app': all(true, false, false),
  };
}

/** Full field handover operator (pickup/return, capture, tasks) without org admin powers. */
export function operatorFieldAgentWritePermissions(): MembershipPermissionsMap {
  return {
    'operator-app': all(true, true, false),
  };
}

/** Supervisor / stationsleiter operator surface including verify + cancel paths. */
export function operatorSupervisorPermissions(): MembershipPermissionsMap {
  return {
    'operator-app': all(true, true, true),
  };
}
