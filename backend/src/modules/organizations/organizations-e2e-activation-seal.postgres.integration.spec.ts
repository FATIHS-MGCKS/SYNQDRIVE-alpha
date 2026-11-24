/**
 * ORG_E2E_ACTIVATION_P5B1_PG=1
 * DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/synqdrive_org_e2e_activation_p5b1_test
 */
import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  MembershipRole,
  OrganizationRoleVersionStatus,
  OrganizationStatus,
  OrgProductStatus,
  PrismaClient,
  ProductSlug,
} from '@prisma/client';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import { resolveEntitlementCapabilities } from '@modules/products/entitlements/entitlements-policy';
import { assertOrganizationProductEntitled } from '@modules/vehicle-onboarding/readiness/product-entitlement.authority';
import { VehicleOnboardingError } from '@modules/vehicle-onboarding/errors/vehicle-onboarding.errors';
import { DEFAULT_ORGANIZATION_ROLE_TEMPLATES } from '@modules/users/defaults/organization-role.defaults';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { ORGANIZATION_LIFECYCLE_DENIED_CODE } from '@shared/auth/organization-lifecycle-access.policy';
import { VehicleOwnershipGuard } from '@shared/auth/vehicle-ownership.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import {
  assertOrgE2eActivationP5b1DisposablePostgresPreflight,
  isOrgE2eActivationP5b1PostgresOptIn,
} from './testing/org-e2e-activation-p5b1-disposable-postgres-preflight';
import {
  assignFleetProductActive,
  assignFleetProductTrial,
  bootstrapOrganizationWithAdmin,
  buildOrganizationsService,
  buildProductsService,
  buildVehiclesService,
  cleanupOrgGraph,
  createFleetVehicle,
  createMasterAdminActor,
  ensureCatalogProducts,
  loadOrgAdminMembership,
  P5B1_JWT_SECRET,
  setOrganizationStatus,
  tenantJwtUser,
} from './testing/org-e2e-activation-p5b1-pg.harness';

const LIVE = isOrgE2eActivationP5b1PostgresOptIn();

function httpContext(input: {
  orgId?: string;
  vehicleId?: string;
  user?: Record<string, unknown>;
  method?: string;
  url?: string;
}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        params: { orgId: input.orgId, vehicleId: input.vehicleId },
        user: input.user,
        method: input.method ?? 'GET',
        url: input.url ?? `/api/v1/organizations/${input.orgId}/vehicles`,
      }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as ExecutionContext;
}

(LIVE ? describe : describe.skip)('organizations E2E activation seal (postgres)', () => {
  let prisma: PrismaClient;
  let orgs: ReturnType<typeof buildOrganizationsService>;
  let products: ReturnType<typeof buildProductsService>;
  let vehicles: ReturnType<typeof buildVehiclesService>;
  let orgScoping: OrgScopingGuard;
  let vehicleOwnership: VehicleOwnershipGuard;
  let refreshTokens: RefreshTokenService;
  let maActorId: string;

  beforeAll(async () => {
    assertOrgE2eActivationP5b1DisposablePostgresPreflight();
    process.env.JWT_SECRET = P5B1_JWT_SECRET;
    prisma = new PrismaClient();
    await prisma.$connect();
    await ensureCatalogProducts(prisma);
    orgs = buildOrganizationsService(prisma);
    products = buildProductsService(prisma);
    vehicles = buildVehiclesService(prisma);
    orgScoping = new OrgScopingGuard(prisma as never);
    vehicleOwnership = new VehicleOwnershipGuard(prisma as never);
    refreshTokens = new RefreshTokenService(
      prisma as never,
      {
        get: (key: string) => {
          if (key === 'app.jwtSecret') return P5B1_JWT_SECRET;
          if (key === 'app.jwtExpiresIn') return '15m';
          return undefined;
        },
      } as never,
      { assertSessionPolicyForLogin: jest.fn() } as never,
      { resolveJwtPermissions: jest.fn().mockResolvedValue([]) } as never,
    );
    const ma = await createMasterAdminActor(prisma);
    maActorId = ma.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: maActorId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  describe('scenario A — new organization', () => {
    it('creates org, admin, roles, approved versions; remains PENDING', async () => {
      const boot = await bootstrapOrganizationWithAdmin(orgs, 'A');
      try {
        const org = await prisma.organization.findUniqueOrThrow({ where: { id: boot.orgId } });
        expect(org.status).toBe(OrganizationStatus.PENDING);
        const admin = await prisma.user.findUnique({ where: { email: boot.adminEmail } });
        expect(admin).not.toBeNull();
        const membership = await prisma.organizationMembership.findFirst({
          where: { organizationId: boot.orgId, userId: boot.adminId },
        });
        expect(membership?.role).toBe(MembershipRole.ORG_ADMIN);
        const roleCount = await prisma.organizationRole.count({
          where: { organizationId: boot.orgId, isSystemTemplate: true },
        });
        expect(roleCount).toBe(DEFAULT_ORGANIZATION_ROLE_TEMPLATES.length);
        for (const template of DEFAULT_ORGANIZATION_ROLE_TEMPLATES) {
          const role = await prisma.organizationRole.findFirst({
            where: { organizationId: boot.orgId, systemKey: template.systemKey },
          });
          expect(role).not.toBeNull();
          const version = await prisma.organizationRoleVersion.findFirst({
            where: {
              organizationRoleId: role!.id,
              status: OrganizationRoleVersionStatus.APPROVED,
            },
          });
          expect(version).not.toBeNull();
        }
      } finally {
        await cleanupOrgGraph(prisma, boot.orgId);
      }
    });
  });

  describe('scenario B — pending access denial', () => {
    it('denies tenant fleet operations while PENDING', async () => {
      const boot = await bootstrapOrganizationWithAdmin(orgs, 'B');
      try {
        const user = tenantJwtUser({ userId: boot.adminId, orgId: boot.orgId });
        await expect(
          orgScoping.canActivate(
            httpContext({
              orgId: boot.orgId,
              user,
              url: `/api/v1/organizations/${boot.orgId}/vehicles`,
            }),
          ),
        ).rejects.toMatchObject({
          response: { code: ORGANIZATION_LIFECYCLE_DENIED_CODE },
        });
        await expect(
          assertOrganizationProductEntitled(prisma, boot.orgId, ProductSlug.FLEET),
        ).rejects.toBeInstanceOf(VehicleOnboardingError);
      } finally {
        await cleanupOrgGraph(prisma, boot.orgId);
      }
    });
  });

  describe('scenario C — ACTIVE org without ACTIVE product entitlement', () => {
    it('keeps vehicle activation blocked under TRIAL product', async () => {
      const boot = await bootstrapOrganizationWithAdmin(orgs, 'C');
      try {
        await setOrganizationStatus(prisma, boot.orgId, OrganizationStatus.ACTIVE);
        await assignFleetProductTrial(prisma, boot.orgId);
        const row = await prisma.organizationProduct.findFirst({
          where: { organizationId: boot.orgId, product: { slug: ProductSlug.FLEET } },
        });
        expect(row?.status).toBe(OrgProductStatus.TRIAL);
        const caps = resolveEntitlementCapabilities(row?.status);
        expect(caps.canActivateVehicles).toBe(false);
        await expect(
          assertOrganizationProductEntitled(prisma, boot.orgId, ProductSlug.FLEET),
        ).rejects.toMatchObject({ code: 'PRODUCT_ENTITLEMENT_NOT_ACTIVE' });
      } finally {
        await cleanupOrgGraph(prisma, boot.orgId);
      }
    });
  });

  describe('scenario D — master admin product grant', () => {
    it('binds ACTIVE FLEET entitlement to organization', async () => {
      const boot = await bootstrapOrganizationWithAdmin(orgs, 'D');
      try {
        const assigned = await assignFleetProductActive(products, boot.orgId, maActorId);
        expect(assigned.status).toBe(OrgProductStatus.ACTIVE);
        expect(assigned.organizationId).toBe(boot.orgId);
        await expect(
          assertOrganizationProductEntitled(prisma, boot.orgId, ProductSlug.FLEET),
        ).resolves.toMatchObject({ status: OrgProductStatus.ACTIVE });
      } finally {
        await cleanupOrgGraph(prisma, boot.orgId);
      }
    });
  });

  describe('scenario E — authorized vehicle flow', () => {
    it('issues admin JWT, allows fleet guards, creates bound vehicle', async () => {
      const boot = await bootstrapOrganizationWithAdmin(orgs, 'E');
      try {
        await setOrganizationStatus(prisma, boot.orgId, OrganizationStatus.ACTIVE);
        await assignFleetProductActive(products, boot.orgId, maActorId);
        const membership = await loadOrgAdminMembership(prisma, boot.orgId, boot.adminId);
        const tokens = await refreshTokens.issueTokenPair(
          {
            id: membership.user.id,
            email: membership.user.email,
            name: membership.user.name,
            platformRole: 'USER',
          },
          {
            role: membership.role,
            organizationId: membership.organizationId,
            organizationName: membership.organization.companyName,
            organizationLogoUrl: membership.organization.logoUrl,
            membershipId: membership.id,
            membershipVersion: membership.membershipVersion,
            organizationRoleId: membership.organizationRoleId,
          },
          {},
        );
        const claims = jwt.verify(tokens.accessToken, P5B1_JWT_SECRET) as {
          organizationId?: string;
        };
        expect(claims.organizationId).toBe(boot.orgId);

        const jwtUser = tenantJwtUser({ userId: boot.adminId, orgId: boot.orgId });
        await expect(
          orgScoping.canActivate(
            httpContext({ orgId: boot.orgId, user: jwtUser }),
          ),
        ).resolves.toBe(true);

        const vehicle = await createFleetVehicle(prisma, boot.orgId, boot.adminId, 'E');
        expect(vehicle.organizationId).toBe(boot.orgId);

        const ctx = httpContext({
          vehicleId: vehicle.id,
          user: jwtUser,
        });
        await expect(vehicleOwnership.canActivate(ctx)).resolves.toBe(true);

        const reflector = new Reflector();
        const permGuard = new PermissionsGuard(reflector, prisma as never);
        jest
          .spyOn(reflector, 'getAllAndOverride')
          .mockReturnValue({ module: 'fleet', level: 'write' });
        await expect(
          permGuard.canActivate(httpContext({ orgId: boot.orgId, user: jwtUser })),
        ).resolves.toBe(true);
      } finally {
        await cleanupOrgGraph(prisma, boot.orgId);
      }
    });
  });

  describe('scenario F — tenant isolation', () => {
    it('blocks cross-org vehicle access and entitlement reuse', async () => {
      const bootA = await bootstrapOrganizationWithAdmin(orgs, 'FA');
      const bootB = await bootstrapOrganizationWithAdmin(orgs, 'FB');
      try {
        await setOrganizationStatus(prisma, bootA.orgId, OrganizationStatus.ACTIVE);
        await setOrganizationStatus(prisma, bootB.orgId, OrganizationStatus.ACTIVE);
        await assignFleetProductActive(products, bootA.orgId, maActorId);
        const vehicleA = await createFleetVehicle(prisma, bootA.orgId, bootA.adminId, 'A');
        const userB = tenantJwtUser({ userId: bootB.adminId, orgId: bootB.orgId });
        await expect(
          vehicleOwnership.canActivate(
            httpContext({ vehicleId: vehicleA.id, user: userB }),
          ),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
          assertOrganizationProductEntitled(prisma, bootB.orgId, ProductSlug.FLEET),
        ).rejects.toBeInstanceOf(VehicleOnboardingError);
      } finally {
        await cleanupOrgGraph(prisma, bootA.orgId);
        await cleanupOrgGraph(prisma, bootB.orgId);
      }
    });
  });

  describe('scenario G — post-activation suspension', () => {
    it('fail-closed on operational route with stale JWT after suspend', async () => {
      const boot = await bootstrapOrganizationWithAdmin(orgs, 'G');
      try {
        await setOrganizationStatus(prisma, boot.orgId, OrganizationStatus.ACTIVE);
        await assignFleetProductActive(products, boot.orgId, maActorId);
        const membership = await loadOrgAdminMembership(prisma, boot.orgId, boot.adminId);
        const tokens = await refreshTokens.issueTokenPair(
          {
            id: membership.user.id,
            email: membership.user.email,
            name: membership.user.name,
            platformRole: 'USER',
          },
          {
            role: membership.role,
            organizationId: membership.organizationId,
            organizationName: membership.organization.companyName,
            organizationLogoUrl: membership.organization.logoUrl,
            membershipId: membership.id,
            membershipVersion: membership.membershipVersion,
            organizationRoleId: membership.organizationRoleId,
          },
          {},
        );
        const jwtUser = tenantJwtUser({ userId: boot.adminId, orgId: boot.orgId });
        jwt.verify(tokens.accessToken, P5B1_JWT_SECRET);

        await setOrganizationStatus(prisma, boot.orgId, OrganizationStatus.SUSPENDED);
        await expect(
          orgScoping.canActivate(httpContext({ orgId: boot.orgId, user: jwtUser })),
        ).rejects.toBeInstanceOf(ForbiddenException);
      } finally {
        await cleanupOrgGraph(prisma, boot.orgId);
      }
    });
  });

  describe('IAM bootstrap — ORG_ADMIN without organizationRoleId', () => {
    it('passes fleet.write via ORG_ADMIN legacy fallback (no code change required)', async () => {
      const boot = await bootstrapOrganizationWithAdmin(orgs, 'IAM');
      try {
        const membership = await prisma.organizationMembership.findFirstOrThrow({
          where: { organizationId: boot.orgId, userId: boot.adminId },
        });
        expect(membership.organizationRoleId).toBeNull();
        await setOrganizationStatus(prisma, boot.orgId, OrganizationStatus.ACTIVE);
        const jwtUser = tenantJwtUser({ userId: boot.adminId, orgId: boot.orgId });
        const reflector = new Reflector();
        const permGuard = new PermissionsGuard(reflector, prisma as never);
        const ctx = httpContext({ orgId: boot.orgId, user: jwtUser });
        jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue({ module: 'fleet', level: 'write' });
        await expect(permGuard.canActivate(ctx)).resolves.toBe(true);
      } finally {
        await cleanupOrgGraph(prisma, boot.orgId);
      }
    });
  });
});