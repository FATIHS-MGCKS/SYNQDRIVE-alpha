import type { MembershipPermissionsMap } from '@shared/auth/permission.util';

const all = (read: boolean, write: boolean, manage = false) => ({ read, write, manage });

/** Full rental-rules administration (view, edit, publish, assign, overrides). */
export function rentalRulesFullPermissions(): MembershipPermissionsMap {
  return {
    'rental-rules': all(true, true, true),
    'rental-rules-publish': all(true, true, false),
    'rental-rules-assign': all(true, true, false),
    'rental-rules-overrides': all(true, true, false),
  };
}

/** Read-only rental rules (overview, effective rules preview). */
export function rentalRulesReadPermissions(): MembershipPermissionsMap {
  return {
    'rental-rules': all(true, false, false),
    'rental-rules-publish': all(false, false, false),
    'rental-rules-assign': all(false, false, false),
    'rental-rules-overrides': all(false, false, false),
  };
}

/** Draft editor — edit defaults/categories without publish or fleet assignment. */
export function rentalRulesEditorPermissions(): MembershipPermissionsMap {
  return {
    'rental-rules': all(true, true, false),
    'rental-rules-publish': all(false, false, false),
    'rental-rules-assign': all(false, false, false),
    'rental-rules-overrides': all(false, false, false),
  };
}

/** Local fleet operator — assign vehicles and manage overrides without org-wide publish. */
export function rentalRulesFleetOperatorPermissions(): MembershipPermissionsMap {
  return {
    'rental-rules': all(true, false, false),
    'rental-rules-publish': all(false, false, false),
    'rental-rules-assign': all(true, true, false),
    'rental-rules-overrides': all(true, true, false),
  };
}

/** Baseline viewer for org members who need operational context only. */
export function rentalRulesViewerPermissions(): MembershipPermissionsMap {
  return rentalRulesReadPermissions();
}
