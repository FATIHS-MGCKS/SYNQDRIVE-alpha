import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { OrgProductPlan, OrgProductStatus, OrganizationStatus, ProductSlug } from '@prisma/client';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import { AuthGuard } from '@shared/auth/auth.guard';
import { UserAccessAuthorityService } from '@shared/auth/user-access-authority.service';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import {
  attachHttpSecurityAuthorityPrismaMocks,
  signHttpSecurityAccessToken,
} from '@shared/auth/testing/http-security-jwt.util';
import { PlatformPermissionService } from '@modules/users/platform-permissions/platform-permission.service';
import { PrismaService } from '@shared/database/prisma.service';
import { CoreEntitlementsReadController } from './core-entitlements-read.controller';
import { EntitlementsQueryService } from './entitlements-query.service';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const USER_MEMBER = 'user-member';
const USER_FOREIGN = 'user-foreign';
const USER_SUSPENDED = 'user-suspended';
const MASTER_ADMIN = 'master-admin';

const MEMBERSHIPS: Record<
  string,
  { id: string; role: string; organization: { status: OrganizationStatus } } | null
> = {
  [`${USER_MEMBER}|${ORG_A}`]: {
    id: 'mem-1',
    role: 'WORKER',
    organization: { status: OrganizationStatus.ACTIVE },
  },
  [`${USER_FOREIGN}|${ORG_A}`]: null,
  [`${USER_FOREIGN}|${ORG_B}`]: {
    id: 'mem-2',
    role: 'WORKER',
    organization: { status: OrganizationStatus.ACTIVE },
  },
  [`${USER_SUSPENDED}|${ORG_A}`]: null,
};

describe('CoreEntitlementsReadController — HTTP security integration', () => {
  let app: INestApplication;
  const originalSecret = process.env.JWT_SECRET;
  const jwtSecret = 'p2-pr2-entitlements-http-security-test-secret';

  const platformPermissions = {
    resolveJwtPermissions: jest.fn().mockResolvedValue([]),
  };

  const prisma = {
    organization: {
      findUnique: jest.fn(async (args: { where: { id: string } }) =>
        args.where.id === ORG_A || args.where.id === ORG_B
          ? { id: args.where.id, status: OrganizationStatus.ACTIVE, companyName: args.where.id }
          : null,
      ),
    },
    organizationMembership: {
      findFirst: jest.fn(
        async (args: { where: { userId: string; organizationId: string; status?: string } }) => {
          const key = `${args.where.userId}|${args.where.organizationId}`;
          const row = MEMBERSHIPS[key];
          if (!row) return null;
          if (args.where.status && args.where.status !== 'ACTIVE') return null;
          return row;
        },
      ),
    },
    organizationProduct: {
      findMany: jest.fn(async () => [
        {
          productId: 'prod-rental',
          status: OrgProductStatus.ACTIVE,
          plan: OrgProductPlan.STARTER,
          activatedAt: new Date('2026-01-01T00:00:00.000Z'),
          expiresAt: null,
          product: { id: 'prod-rental', slug: ProductSlug.RENTAL, name: 'Rental' },
        },
      ]),
      findFirst: jest.fn(
        async (args: { where: { organizationId: string; product: { slug: string } } }) => {
          if (args.where.product.slug === ProductSlug.RENTAL) {
            return {
              productId: 'prod-rental',
              status: OrgProductStatus.ACTIVE,
              plan: OrgProductPlan.STARTER,
              activatedAt: new Date('2026-01-01T00:00:00.000Z'),
              expiresAt: null,
              product: { id: 'prod-rental', slug: ProductSlug.RENTAL, name: 'Rental' },
            };
          }
          return null;
        },
      ),
    },
  };

  attachHttpSecurityAuthorityPrismaMocks(prisma as never);

  function signToken(claims: Record<string, unknown>): string {
    const id = claims.id as string;
    (prisma as { registerHttpSecurityUser?: (uid: string, row?: object) => void }).registerHttpSecurityUser?.(
      id,
      { platformRole: claims.platformRole as string },
    );
    return signHttpSecurityAccessToken(jwtSecret, claims);
  }

  function bearer(claims: Record<string, unknown>): string {
    return `Bearer ${signToken(claims)}`;
  }

  const routeList = `/api/v1/core/entitlements/v1/organizations/${ORG_A}`;
  const routeSingle = `/api/v1/core/entitlements/v1/organizations/${ORG_A}/products/RENTAL`;
  const routeInvalidSlug = `/api/v1/core/entitlements/v1/organizations/${ORG_A}/products/NOT_A_PRODUCT`;
  const routeVymodUnassigned = `/api/v1/core/entitlements/v1/organizations/${ORG_A}/products/VYMOD`;

  beforeAll(async () => {
    process.env.JWT_SECRET = jwtSecret;
    const moduleRef = await Test.createTestingModule({
      controllers: [CoreEntitlementsReadController],
      providers: [
        EntitlementsQueryService,
        OrgScopingGuard,
        { provide: PrismaService, useValue: prisma },
        UserAccessAuthorityService,
        { provide: PlatformPermissionService, useValue: platformPermissions },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    process.env.JWT_SECRET = originalSecret;
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('denies request without JWT (global AuthGuard)', async () => {
    await request(app.getHttpServer()).get(routeList).expect(401);
  });

  it('denies invalid JWT', async () => {
    await request(app.getHttpServer())
      .get(routeList)
      .set('Authorization', 'Bearer not-a-valid-jwt')
      .expect(401);
  });

  it('allows member JWT for own organization list', async () => {
    await request(app.getHttpServer())
      .get(routeList)
      .set('Authorization', bearer({ id: USER_MEMBER, organizationId: ORG_A }))
      .expect(200)
      .expect((res) => {
        expect(res.body.organizationId).toBe(ORG_A);
        expect(res.body.m2mProductionReady).toBe(false);
        expect(res.body.products).toHaveLength(1);
      });
  });

  it('allows member JWT for own organization single product', async () => {
    await request(app.getHttpServer())
      .get(routeSingle)
      .set('Authorization', bearer({ id: USER_MEMBER, organizationId: ORG_A }))
      .expect(200)
      .expect((res) => {
        expect(res.body.productSlug).toBe(ProductSlug.RENTAL);
        expect(res.body.entitled).toBe(true);
      });
  });

  it('denies JWT holder for foreign organization (OrgScopingGuard)', async () => {
    await request(app.getHttpServer())
      .get(routeList)
      .set('Authorization', bearer({ id: USER_FOREIGN, organizationId: ORG_B }))
      .expect(403);
  });

  it('denies user without active membership in target org', async () => {
    await request(app.getHttpServer())
      .get(routeList)
      .set('Authorization', bearer({ id: USER_SUSPENDED, organizationId: ORG_A }))
      .expect(401);
  });

  it('allows MASTER_ADMIN cross-org per OrgScopingGuard pass-through', async () => {
    await request(app.getHttpServer())
      .get(routeList)
      .set(
        'Authorization',
        bearer({
          id: MASTER_ADMIN,
          platformRole: 'MASTER_ADMIN',
          organizationId: ORG_B,
        }),
      )
      .expect(200);
  });

  it('returns 404 for invalid product slug', async () => {
    await request(app.getHttpServer())
      .get(routeInvalidSlug)
      .set('Authorization', bearer({ id: USER_MEMBER, organizationId: ORG_A }))
      .expect(404);
  });

  it('TRIAL reports UI capability without operational vehicle activation', async () => {
    (prisma.organizationProduct.findFirst as jest.Mock).mockResolvedValueOnce({
      productId: 'prod-rental',
      status: OrgProductStatus.TRIAL,
      plan: OrgProductPlan.STARTER,
      activatedAt: new Date('2026-01-01T00:00:00.000Z'),
      expiresAt: null,
      product: { id: 'prod-rental', slug: ProductSlug.RENTAL, name: 'Rental' },
    });

    await request(app.getHttpServer())
      .get(routeSingle)
      .set('Authorization', bearer({ id: USER_MEMBER, organizationId: ORG_A }))
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe(OrgProductStatus.TRIAL);
        expect(res.body.entitled).toBe(true);
        expect(res.body.capabilities).toEqual({
          canAccessProductUi: true,
          canActivateVehicles: false,
        });
        expect(res.body.expiresAtPolicy).toBe('NOT_ENFORCED_STATUS_ONLY_PARITY');
      });
  });

  it('returns non-entitled record for known unassigned VYMOD', async () => {
    await request(app.getHttpServer())
      .get(routeVymodUnassigned)
      .set('Authorization', bearer({ id: USER_MEMBER, organizationId: ORG_A }))
      .expect(200)
      .expect((res) => {
        expect(res.body.productSlug).toBe(ProductSlug.VYMOD);
        expect(res.body.entitled).toBe(false);
        expect(res.body.status).toBeNull();
      });
  });
});