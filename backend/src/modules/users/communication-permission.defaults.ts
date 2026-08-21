import type { MembershipPermissionsMap } from '@shared/auth/permission.util';
import {
  COMMUNICATION_PERMISSION_MODULE,
  INTERNAL_AI_ASSISTANT_MODULE,
  VOICE_ASSISTANT_PERMISSION_MODULE,
} from '@shared/auth/communication-permission.constants';

const all = (read: boolean, write: boolean, manage = false) => ({ read, write, manage });

function levelFrom(
  perms: MembershipPermissionsMap | null | undefined,
  module: string,
): { read: boolean; write: boolean; manage: boolean } | null {
  const flags = perms?.[module as keyof MembershipPermissionsMap];
  if (!flags) return null;
  return {
    read: flags.read === true || flags.write === true || flags.manage === true,
    write: flags.write === true || flags.manage === true,
    manage: flags.manage === true,
  };
}

function hasExplicitModule(
  perms: MembershipPermissionsMap | null | undefined,
  module: string,
): boolean {
  return Boolean(perms && Object.prototype.hasOwnProperty.call(perms, module));
}

export type CommunicationPermissionBackfillMeta = {
  hasExplicitCommunication: boolean;
  hasExplicitVoiceAssistant: boolean;
  patchedCommunication: boolean;
  patchedVoiceAssistant: boolean;
};

/**
 * Derive communication / voice-assistant flags from legacy ai-assistant for idempotent backfill.
 * Each domain is evaluated independently; explicit keys (including revoke) are never overwritten.
 * Never grants communication.manage from ai-assistant alone.
 */
export function deriveCommunicationPermissionsFromLegacy(
  permissions: MembershipPermissionsMap | null | undefined,
): Partial<MembershipPermissionsMap> {
  const patch: Partial<MembershipPermissionsMap> = {};
  const ai = levelFrom(permissions, INTERNAL_AI_ASSISTANT_MODULE);
  if (!ai) return patch;

  if (!hasExplicitModule(permissions, COMMUNICATION_PERMISSION_MODULE)) {
    if (ai.read || ai.write || ai.manage) {
      patch[COMMUNICATION_PERMISSION_MODULE] = all(ai.read, ai.write, false);
    }
  }

  if (!hasExplicitModule(permissions, VOICE_ASSISTANT_PERMISSION_MODULE)) {
    if (ai.manage) {
      patch[VOICE_ASSISTANT_PERMISSION_MODULE] = all(true, true, true);
    } else if (ai.write) {
      patch[VOICE_ASSISTANT_PERMISSION_MODULE] = all(true, true, false);
    } else if (ai.read) {
      patch[VOICE_ASSISTANT_PERMISSION_MODULE] = all(true, false, false);
    }
  }

  return patch;
}

export function mergeCommunicationPermissionBackfill(
  existing: MembershipPermissionsMap | null | undefined,
): {
  next: MembershipPermissionsMap | null;
  changed: boolean;
  meta: CommunicationPermissionBackfillMeta;
} {
  const base = { ...(existing ?? {}) } as MembershipPermissionsMap;
  const hasExplicitCommunication = hasExplicitModule(base, COMMUNICATION_PERMISSION_MODULE);
  const hasExplicitVoiceAssistant = hasExplicitModule(base, VOICE_ASSISTANT_PERMISSION_MODULE);
  const patch = deriveCommunicationPermissionsFromLegacy(base);
  const patchedCommunication = Object.prototype.hasOwnProperty.call(
    patch,
    COMMUNICATION_PERMISSION_MODULE,
  );
  const patchedVoiceAssistant = Object.prototype.hasOwnProperty.call(
    patch,
    VOICE_ASSISTANT_PERMISSION_MODULE,
  );

  const meta: CommunicationPermissionBackfillMeta = {
    hasExplicitCommunication,
    hasExplicitVoiceAssistant,
    patchedCommunication,
    patchedVoiceAssistant,
  };

  if (!patchedCommunication && !patchedVoiceAssistant) {
    return { next: existing ?? null, changed: false, meta };
  }

  for (const [key, flags] of Object.entries(patch)) {
    base[key as keyof MembershipPermissionsMap] = flags;
  }

  return { next: base, changed: true, meta };
}

/** Default communication permissions bundled into org role templates. */
export function communicationOperatorPermissions(
  read: boolean,
  write: boolean,
  manage = false,
): MembershipPermissionsMap {
  return {
    [COMMUNICATION_PERMISSION_MODULE]: all(read, write, manage),
  };
}

export function voiceAssistantAdminPermissions(
  read: boolean,
  write: boolean,
  manage = false,
): MembershipPermissionsMap {
  return {
    [VOICE_ASSISTANT_PERMISSION_MODULE]: all(read, write, manage),
  };
}
