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

/**
 * Derive communication / voice-assistant flags from legacy ai-assistant for idempotent backfill.
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
} {
  const base = { ...(existing ?? {}) } as MembershipPermissionsMap;
  const patch = deriveCommunicationPermissionsFromLegacy(base);
  if (Object.keys(patch).length === 0) {
    return { next: existing ?? null, changed: false };
  }

  for (const [key, flags] of Object.entries(patch)) {
    base[key as keyof MembershipPermissionsMap] = flags;
  }

  return { next: base, changed: true };
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
