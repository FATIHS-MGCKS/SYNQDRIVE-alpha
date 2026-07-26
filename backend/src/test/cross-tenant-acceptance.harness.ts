import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { Reflector } from '@nestjs/core';

/**
 * Deterministic fixture IDs for cross-tenant acceptance tests.
 * Two organizations, two tenant users, and foreign entity UUIDs for IDOR probes.
 */
export const CROSS_TENANT_IDS = {
  orgA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  orgB: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  userA: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  userB: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  membershipA: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  membershipB: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  vehicleA: '11111111-1111-4111-8111-111111111111',
  vehicleB: '22222222-2222-4222-8222-222222222222',
  bookingA: '33333333-3333-4333-8333-333333333333',
  bookingB: '44444444-4444-4444-8444-444444444444',
  customerA: '55555555-5555-4555-8555-555555555555',
  customerB: '66666666-6666-4666-8666-666666666666',
  documentA: '77777777-7777-4777-8777-777777777777',
  documentB: '88888888-8888-4888-8888-888888888888',
  invoiceA: '99999999-9999-4999-8999-999999999999',
  invoiceB: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  notificationA: '10101010-1010-4101-8101-101010101010',
  notificationB: '20202020-2020-4202-8202-202020202020',
  workflowA: '30303030-3030-4303-8303-303030303030',
  workflowB: '40404040-4040-4404-8404-404040404040',
  dimoEpisodeA: '50505050-5050-4505-8505-505050505050',
  dimoEpisodeB: '60606060-6060-4606-8606-606060606060',
} as const;

export type CrossTenantTestCase = {
  id: string;
  domain: string;
  attack: 'read' | 'write' | 'uuid-direct' | 'id-manipulation' | 'auth';
  description: string;
};

export type AuthenticatedTenantUser = {
  id: string;
  organizationId: string;
  platformRole: 'USER';
  membershipRole: MembershipRole;
};

export function buildTenantUser(
  orgId: string,
  userId: string,
  membershipRole: MembershipRole = MembershipRole.ORG_ADMIN,
): AuthenticatedTenantUser {
  return {
    id: userId,
    organizationId: orgId,
    platformRole: 'USER',
    membershipRole,
  };
}

export function buildHttpContext(params: {
  orgId: string;
  user?: AuthenticatedTenantUser | Record<string, unknown>;
  params?: Record<string, string>;
  query?: Record<string, string>;
  permission?: { module: string; level: string };
}): ExecutionContext {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(params.permission) };
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        params: { orgId: params.orgId, ...params.params },
        query: params.query ?? {},
        user: params.user,
      }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
    reflector,
  } as unknown as ExecutionContext;
}

export function createGuardHarness() {
  const prisma = {
    organizationMembership: { findFirst: jest.fn() },
  };
  const reflector = { getAllAndOverride: jest.fn() };
  const orgScopingGuard = new OrgScopingGuard(prisma as never);
  const permissionsGuard = new PermissionsGuard(reflector as unknown as Reflector, prisma as never);

  return { prisma, reflector, orgScopingGuard, permissionsGuard };
}

export async function expectCrossOrgGuardDenied(
  guard: OrgScopingGuard,
  homeOrgId: string,
  foreignOrgId: string,
  userId: string,
): Promise<void> {
  const user = buildTenantUser(homeOrgId, userId);
  await expect(
    guard.canActivate(buildHttpContext({ orgId: foreignOrgId, user }) as never),
  ).rejects.toBeInstanceOf(ForbiddenException);
}

export function scopedWhere(orgId: string, entityId: string) {
  return { id: entityId, organizationId: orgId };
}
