/** Read-only DIMO Identity privilege recheck — separate from live provider disconnect mutations. */
export function isDimoPrivilegeRecheckEnabled(): boolean {
  return process.env.ORGANIZATION_OFFBOARDING_DIMO_PRIVILEGE_RECHECK_ENABLED === '1';
}

export const DIMO_OWNER_HANDOFF_MAX_RECORDS = 50;