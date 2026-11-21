import { ForbiddenException } from '@nestjs/common';

export type AuthenticatedOrgActor = {
  platformRole?: string | null;
  organizationId?: string | null;
};

export function isMasterAdminActor(user: AuthenticatedOrgActor | undefined): boolean {
  return user?.platformRole === 'MASTER_ADMIN';
}

/**
 * Resolves the authoritative tenant organization for HM register routes.
 * Ordinary users: JWT org only. Master Admin may supply body org when set.
 */
export function resolveHighMobilityTenantOrganizationId(
  user: AuthenticatedOrgActor | undefined,
  bodyOrganizationId?: string | null,
): string {
  if (!user) {
    throw new ForbiddenException('Authentication required');
  }
  if (isMasterAdminActor(user)) {
    const orgId = bodyOrganizationId ?? user.organizationId;
    if (!orgId) {
      throw new ForbiddenException('Organization context required');
    }
    return orgId;
  }
  if (!user.organizationId) {
    throw new ForbiddenException('Organization context required');
  }
  if (bodyOrganizationId && bodyOrganizationId !== user.organizationId) {
    throw new ForbiddenException({
      message: 'organizationId does not match the authenticated organization',
      code: 'ORGANIZATION_CONTEXT_MISMATCH',
    });
  }
  return user.organizationId;
}

type HmTenantScopedRecord = {
  organizationId: string | null;
};

export function assertHighMobilityRecordTenantAccess(
  record: HmTenantScopedRecord,
  tenantOrganizationId: string,
  isMasterAdmin: boolean,
): void {
  if (isMasterAdmin) return;
  if (record.organizationId && record.organizationId !== tenantOrganizationId) {
    throw new ForbiddenException('High Mobility record is not available for this organization');
  }
}

export function highMobilityRecordOrgWhere(
  tenantOrganizationId: string,
  isMasterAdmin: boolean,
): { OR: Array<{ organizationId: string | null }> } | undefined {
  if (isMasterAdmin) return undefined;
  return {
    OR: [{ organizationId: null }, { organizationId: tenantOrganizationId }],
  };
}