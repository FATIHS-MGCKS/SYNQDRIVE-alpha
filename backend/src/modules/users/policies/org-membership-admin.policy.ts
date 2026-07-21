import { BadRequestException } from '@nestjs/common';
import type { UpdateOrgUserDto } from '../dto';

/**
 * Org admins manage organization membership only — not global identity.
 * See iam-global-identity.policy.ts for credential/email/global-status rules.
 */

/** Global profile / identity fields — org admin PATCH must not accept these. */
export const ORG_ADMIN_FORBIDDEN_GLOBAL_FIELDS = [
  'email',
  'firstName',
  'lastName',
  'phone',
  'mobile',
  'address',
  'language',
  'timezone',
  'dateFormat',
] as const satisfies ReadonlyArray<keyof UpdateOrgUserDto>;

export type OrgAdminForbiddenGlobalField =
  (typeof ORG_ADMIN_FORBIDDEN_GLOBAL_FIELDS)[number];

/** Membership-scoped fields org admins may change via PATCH. */
export const ORG_ADMIN_MEMBERSHIP_FIELDS = [
  'role',
  'roleLabel',
  'permissions',
  'stationScope',
  'stationIds',
  'fieldAgentAccess',
  'department',
  'position',
  'status',
] as const satisfies ReadonlyArray<keyof UpdateOrgUserDto>;

export function listForbiddenGlobalFieldsInUpdate(
  dto: UpdateOrgUserDto,
): OrgAdminForbiddenGlobalField[] {
  return ORG_ADMIN_FORBIDDEN_GLOBAL_FIELDS.filter(
    (field) => dto[field] !== undefined,
  );
}

export function assertOrgAdminUpdateDoesNotTouchGlobalIdentity(
  dto: UpdateOrgUserDto,
): void {
  const violations = listForbiddenGlobalFieldsInUpdate(dto);
  if (violations.length === 0) return;

  throw new BadRequestException(
    `Cannot modify global identity fields via organization membership administration: ${violations.join(', ')}. ` +
      'Global email and profile changes require verified self-service or master admin support.',
  );
}

export const ORG_ADMIN_DIRECT_PASSWORD_WRITE_MESSAGE =
  'Direct password changes by organization administrators are not allowed. ' +
  'Use POST /organizations/:orgId/users/:userId/request-password-reset to initiate a password reset request.';

export const ORG_ADMIN_EXISTING_USER_PASSWORD_MESSAGE =
  'Cannot set a password for an existing user during organization provisioning. ' +
  'Use the password reset request flow instead.';
