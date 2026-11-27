/** Governed global profile fields (USR-P3A) — excludes security-sensitive columns. */
export const MASTER_GLOBAL_PROFILE_ALLOWLIST = [
  'name',
  'firstName',
  'lastName',
  'phone',
  'mobile',
  'address',
  'language',
  'timezone',
  'dateFormat',
] as const;

export type MasterGlobalProfileField = (typeof MASTER_GLOBAL_PROFILE_ALLOWLIST)[number];