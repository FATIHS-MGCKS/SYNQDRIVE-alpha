import { MembershipRole } from '@prisma/client';
import type { PermissionLevel } from '@shared/decorators/require-permission.decorator';
import {
  evaluateModuleAccessDecision,
  isModuleAccessAllowed,
  type EffectiveAccessResult,
} from '@modules/users/policies/effective-access-engine';
import {
  COMMUNICATION_LEGACY_BRIDGE_ENABLED,
  COMMUNICATION_OPERATOR_EXCLUDED_ROLES,
  COMMUNICATION_PERMISSION_MODULE,
  INTERNAL_AI_ASSISTANT_MODULE,
  VOICE_ASSISTANT_PERMISSION_MODULE,
  VOICE_OPERATIONAL_STAFF_ROLES,
  type CommunicationCompatContext,
  type VoiceAssistantCompatContext,
} from './communication-permission.constants';

function isExcludedOperatorRole(
  role: EffectiveAccessResult['effectiveRole'],
): boolean {
  if (!role || role === 'MASTER_ADMIN') return false;
  return (COMMUNICATION_OPERATOR_EXCLUDED_ROLES as readonly string[]).includes(role);
}

function isVoiceOperationalStaffRole(
  role: EffectiveAccessResult['effectiveRole'],
): boolean {
  if (!role || role === 'MASTER_ADMIN') return false;
  return (VOICE_OPERATIONAL_STAFF_ROLES as readonly string[]).includes(role);
}

function hasLegacyAiAssistantAccess(
  access: EffectiveAccessResult,
  level: PermissionLevel,
): boolean {
  if (!COMMUNICATION_LEGACY_BRIDGE_ENABLED) return false;
  return isModuleAccessAllowed(access, INTERNAL_AI_ASSISTANT_MODULE, level);
}

function hasVoiceOperationalLegacyAccess(
  access: EffectiveAccessResult,
  level: PermissionLevel,
  context: CommunicationCompatContext,
): boolean {
  if (!COMMUNICATION_LEGACY_BRIDGE_ENABLED) return false;
  if (!context.voiceOperationalLegacy) return false;
  if (level === 'manage') return false;
  if (!access.membershipActive) return false;
  if (isExcludedOperatorRole(access.effectiveRole)) return false;
  return isVoiceOperationalStaffRole(access.effectiveRole);
}

/**
 * Canonical Communication permission with one-way legacy bridge:
 * communication.* may be satisfied by ai-assistant.* during migration window.
 * ai-assistant.* must never be satisfied by communication.*.
 */
export function isCommunicationPermissionGranted(
  access: EffectiveAccessResult,
  level: PermissionLevel,
  context: CommunicationCompatContext = {},
): boolean {
  if (isModuleAccessAllowed(access, COMMUNICATION_PERMISSION_MODULE, level)) {
    return true;
  }

  if (hasLegacyAiAssistantAccess(access, level)) {
    return true;
  }

  if (hasVoiceOperationalLegacyAccess(access, level, context)) {
    return true;
  }

  return false;
}

export function evaluateCommunicationPermissionDecision(
  access: EffectiveAccessResult,
  level: PermissionLevel,
  context: CommunicationCompatContext = {},
) {
  if (isCommunicationPermissionGranted(access, level, context)) {
    return {
      decision: 'ALLOW' as const,
      module: COMMUNICATION_PERMISSION_MODULE,
      level,
      reasons: [`allow:${COMMUNICATION_PERMISSION_MODULE}.${level}`],
    };
  }

  const canonical = evaluateModuleAccessDecision(
    access,
    COMMUNICATION_PERMISSION_MODULE,
    level,
  );
  return {
    ...canonical,
    reasons: [
      ...canonical.reasons,
      ...(hasLegacyAiAssistantAccess(access, level)
        ? [`legacy-bridge:${INTERNAL_AI_ASSISTANT_MODULE}.${level}`]
        : []),
      ...(hasVoiceOperationalLegacyAccess(access, level, context)
        ? ['legacy-bridge:voice-operational-staff']
        : []),
    ],
  };
}

/**
 * Deep Voice administration permission with legacy SUB_ADMIN admin-route bridge.
 * Operational read may also flow through communication.read (including legacy paths).
 */
export function isVoiceAssistantPermissionGranted(
  access: EffectiveAccessResult,
  level: PermissionLevel,
  context: VoiceAssistantCompatContext = {},
): boolean {
  if (isModuleAccessAllowed(access, VOICE_ASSISTANT_PERMISSION_MODULE, level)) {
    return true;
  }

  if (
    COMMUNICATION_LEGACY_BRIDGE_ENABLED &&
    context.voiceAdminLegacy &&
    access.membershipActive &&
    access.effectiveRole === MembershipRole.SUB_ADMIN
  ) {
    return true;
  }

  if (level === 'read') {
    return isCommunicationPermissionGranted(access, 'read', {
      voiceOperationalLegacy: true,
    });
  }

  return false;
}

export function evaluateVoiceAssistantPermissionDecision(
  access: EffectiveAccessResult,
  level: PermissionLevel,
  context: VoiceAssistantCompatContext = {},
) {
  if (isVoiceAssistantPermissionGranted(access, level, context)) {
    return {
      decision: 'ALLOW' as const,
      module: VOICE_ASSISTANT_PERMISSION_MODULE,
      level,
      reasons: [`allow:${VOICE_ASSISTANT_PERMISSION_MODULE}.${level}`],
    };
  }

  return evaluateModuleAccessDecision(access, VOICE_ASSISTANT_PERMISSION_MODULE, level);
}

/** Internal fleet AI — no communication legacy bridge. */
export function isInternalAiAssistantPermissionGranted(
  access: EffectiveAccessResult,
  level: PermissionLevel,
): boolean {
  return isModuleAccessAllowed(access, INTERNAL_AI_ASSISTANT_MODULE, level);
}
