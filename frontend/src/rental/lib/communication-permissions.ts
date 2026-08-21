export type HasPermissionFn = (
  module: string,
  level: 'read' | 'write' | 'manage',
) => boolean;

const VOICE_OPERATIONAL_STAFF_ROLES = ['ORG_ADMIN', 'SUB_ADMIN', 'WORKER'] as const;
const COMMUNICATION_OPERATOR_EXCLUDED_ROLES = ['DRIVER'] as const;

/** Mirrors backend voiceOperationalLegacy staff bridge (nav visibility only). */
export function hasVoiceOperationalLegacyAccess(
  membershipRole: string | null | undefined,
): boolean {
  if (!membershipRole) return false;
  if ((COMMUNICATION_OPERATOR_EXCLUDED_ROLES as readonly string[]).includes(membershipRole)) {
    return false;
  }
  return (VOICE_OPERATIONAL_STAFF_ROLES as readonly string[]).includes(membershipRole);
}

/**
 * Communication Center operator permission with legacy ai-assistant bridge (frontend only).
 * Backend PermissionsGuard remains authoritative.
 */
export function hasCommunicationPermission(
  hasPermission: HasPermissionFn,
  level: 'read' | 'write' | 'manage',
  membershipRole?: string | null,
): boolean {
  if (hasPermission('communication', level)) return true;
  if (level === 'manage') {
    return hasPermission('ai-assistant', 'manage');
  }
  if (level === 'write') {
    return hasPermission('communication', 'write')
      || hasPermission('ai-assistant', 'write')
      || hasPermission('ai-assistant', 'manage');
  }
  if (
    hasPermission('communication', 'read')
    || hasPermission('ai-assistant', 'read')
    || hasPermission('ai-assistant', 'write')
    || hasPermission('ai-assistant', 'manage')
  ) {
    return true;
  }
  if (level === 'read' && hasVoiceOperationalLegacyAccess(membershipRole)) {
    return true;
  }
  return false;
}

export function hasVoiceAssistantAdminPermission(
  hasPermission: HasPermissionFn,
  level: 'read' | 'write' | 'manage',
  membershipRole?: string | null,
): boolean {
  if (hasPermission('voice-assistant', level)) return true;
  if (level === 'read') {
    return hasCommunicationPermission(hasPermission, 'read', membershipRole);
  }
  return false;
}

/** Voice nav: deep admin OR operational comms (including legacy staff bridge). */
export function hasVoiceNavigationAccess(
  hasPermission: HasPermissionFn,
  membershipRole: string | null | undefined,
): boolean {
  return hasVoiceAssistantAdminPermission(hasPermission, 'read', membershipRole);
}

/** Internal fleet AI — must not inherit communication permissions. */
export function hasInternalAiAssistantPermission(
  hasPermission: HasPermissionFn,
  level: 'read' | 'write' | 'manage',
): boolean {
  return hasPermission('ai-assistant', level);
}
