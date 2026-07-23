import type { MembershipPermissionsMap } from '@shared/auth/permission.util';

const all = (read: boolean, write: boolean, manage = false) => ({ read, write, manage });

/** Full data-processing review, approval, and lifecycle control. */
export function dataProcessingFullPermissions(): MembershipPermissionsMap {
  return {
    'data-authorization': all(true, true, true),
  };
}

/** Privacy reviewer — read + privacy review (via manage on data-authorization for migration compat). */
export function dataProcessingPrivacyReviewerPermissions(): MembershipPermissionsMap {
  return {
    'data-authorization': all(true, false, true),
  };
}

/** Security reviewer — read + security review. */
export function dataProcessingSecurityReviewerPermissions(): MembershipPermissionsMap {
  return {
    'data-authorization': all(true, false, true),
  };
}

/** View-only + audit read. */
export function dataProcessingViewerPermissions(): MembershipPermissionsMap {
  return {
    'data-authorization': all(true, false, false),
  };
}
