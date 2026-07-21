/**
 * Shared effective-access evaluation for IAM regression tests (Prompt 2/22).
 * Mirrors PermissionsGuard / assertMembershipPermission semantics.
 */
import { MembershipRole } from '@prisma/client';
import {
  evaluateModulePermission,
  normalizeMembershipPermissions,
  type MembershipPermissionsMap,
} from '@shared/auth/permission.util';
import type { PermissionLevel } from '@shared/decorators/require-permission.decorator';

export interface EffectiveAccessInput {
  platformRole?: string | null;
  membershipRole?: MembershipRole | string | null;
  permissions?: unknown;
  module: string;
  level: PermissionLevel;
}

export function computeEffectiveModuleAccess(
  input: EffectiveAccessInput,
): boolean {
  if (input.platformRole === 'MASTER_ADMIN') return true;
  if (input.membershipRole === MembershipRole.ORG_ADMIN) return true;

  const normalized = normalizeMembershipPermissions(input.permissions);
  return evaluateModulePermission(normalized, input.module, input.level);
}

export function effectiveAccessMatchesPreview(
  guardDecision: boolean,
  previewPermissions: unknown,
  module: string,
  level: PermissionLevel,
  membershipRole: MembershipRole | string,
): boolean {
  const previewDecision = computeEffectiveModuleAccess({
    membershipRole,
    permissions: previewPermissions,
    module,
    level,
  });
  return guardDecision === previewDecision;
}

export type EffectiveAccessSurface = 'GUARD' | 'API_PREVIEW' | 'FRONTEND';

export function surfacesAgree(
  decisions: Partial<Record<EffectiveAccessSurface, boolean>>,
): boolean {
  const values = Object.values(decisions).filter((v) => v !== undefined);
  if (values.length < 2) return true;
  return values.every((v) => v === values[0]);
}
