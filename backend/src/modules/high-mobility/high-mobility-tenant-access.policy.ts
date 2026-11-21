import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrganizationStatus } from '@prisma/client';
import { assertOrganizationAllowsTenantSurface } from '@shared/auth/organization-lifecycle-access.policy';
import type { PrismaService } from '@shared/database/prisma.service';

export type AuthenticatedOrgActor = {
  platformRole?: string | null;
  organizationId?: string | null;
};

export type ResolveHighMobilityOrgOptions = {
  /** Master Admin discovery may omit org (platform scope). */
  allowMasterAdminWithoutOrg?: boolean;
  /** Master Admin HM_ONLY must pass explicit destination org in body. */
  requireMasterAdminDestinationOrg?: boolean;
};

export function isMasterAdminActor(user: AuthenticatedOrgActor | undefined): boolean {
  return user?.platformRole === 'MASTER_ADMIN';
}

/**
 * Resolves the authoritative tenant organization for HM register routes.
 * Ordinary users: JWT org only. Master Admin rules depend on options.
 */
export function resolveHighMobilityTenantOrganizationId(
  user: AuthenticatedOrgActor | undefined,
  bodyOrganizationId?: string | null,
  options?: ResolveHighMobilityOrgOptions,
): string | null {
  if (!user) {
    throw new ForbiddenException('Authentication required');
  }
  if (isMasterAdminActor(user)) {
    if (options?.requireMasterAdminDestinationOrg) {
      if (!bodyOrganizationId?.trim()) {
        throw new BadRequestException('organizationId is required');
      }
      return bodyOrganizationId.trim();
    }
    if (options?.allowMasterAdminWithoutOrg) {
      return bodyOrganizationId ?? user.organizationId ?? null;
    }
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

export async function assertHighMobilityTenantOperationalOrganization(
  prisma: PrismaService,
  organizationId: string,
  isMasterAdmin: boolean,
): Promise<OrganizationStatus> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { status: true },
  });
  if (!org) {
    throw new NotFoundException('Organization not found');
  }
  if (!isMasterAdmin) {
    assertOrganizationAllowsTenantSurface(org.status, 'TENANT_OPERATIONAL');
  }
  return org.status;
}

export async function resolveHighMobilityVehicleScopedAccess(
  prisma: PrismaService,
  vehicleId: string,
  user: AuthenticatedOrgActor | undefined,
): Promise<{ tenantOrganizationId: string; isMasterAdmin: boolean }> {
  if (!user) {
    throw new ForbiddenException('Authentication required');
  }
  const isMasterAdmin = isMasterAdminActor(user);
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: {
      organizationId: true,
      organization: { select: { status: true } },
    },
  });
  if (!vehicle) {
    throw new NotFoundException('Vehicle not found');
  }
  if (!isMasterAdmin) {
    if (user.organizationId !== vehicle.organizationId) {
      throw new NotFoundException('Vehicle not found');
    }
    assertOrganizationAllowsTenantSurface(vehicle.organization?.status, 'TENANT_OPERATIONAL');
  }
  return { tenantOrganizationId: vehicle.organizationId, isMasterAdmin };
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