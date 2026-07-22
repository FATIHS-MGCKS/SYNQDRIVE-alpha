/**
 * Shared effective-access evaluation for IAM regression tests and API preview.
 * Delegates to the canonical EffectiveAccessEngine (Prompt 9/22).
 */
import { MembershipRole, MembershipStatus } from '@prisma/client';
import type { PermissionLevel } from '@shared/decorators/require-permission.decorator';
import {
  computeEffectiveAccess,
  isModuleAccessAllowed,
  type EffectiveAccessOrganizationRoleInput,
} from './effective-access-engine';

export interface LegacyEffectiveAccessInput {
  platformRole?: string | null;
  membershipRole?: MembershipRole | string | null;
  permissions?: unknown;
  module: string;
  level: PermissionLevel;
  membershipStatus?: MembershipStatus;
  organizationRole?: EffectiveAccessOrganizationRoleInput | null;
  organizationId?: string;
}

export function computeEffectiveModuleAccess(
  input: LegacyEffectiveAccessInput,
): boolean {
  const result = computeEffectiveAccess({
    platformRole: input.platformRole,
    membership: input.membershipRole
      ? {
          role: input.membershipRole as MembershipRole,
          status: input.membershipStatus ?? MembershipStatus.ACTIVE,
          organizationId: input.organizationId,
          permissions: input.permissions,
        }
      : null,
    organizationRole: input.organizationRole ?? null,
    resourceContext: input.organizationId
      ? { organizationId: input.organizationId }
      : undefined,
  });
  return isModuleAccessAllowed(result, input.module, input.level);
}

export function effectiveAccessMatchesPreview(
  guardDecision: boolean,
  previewPermissions: unknown,
  module: string,
  level: PermissionLevel,
  membershipRole: MembershipRole | string,
  options: {
    organizationRole?: EffectiveAccessOrganizationRoleInput | null;
    organizationId?: string;
  } = {},
): boolean {
  const previewDecision = computeEffectiveModuleAccess({
    membershipRole,
    permissions: previewPermissions,
    module,
    level,
    organizationRole: options.organizationRole,
    organizationId: options.organizationId,
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

export { computeEffectiveAccess, isModuleAccessAllowed } from './effective-access-engine';
export type { EffectiveAccessResult } from './effective-access-engine';
