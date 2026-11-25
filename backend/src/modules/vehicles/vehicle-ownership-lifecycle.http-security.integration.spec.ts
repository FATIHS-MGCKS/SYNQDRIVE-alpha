import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { OrganizationStatus, RefreshTokenScope, UserPlatformRole } from '@prisma/client';
import * as request from 'supertest';
import { AuthGuard } from '@shared/auth/auth.guard';
import { UserAccessAuthorityService } from '@shared/auth/user-access-authority.service';
import { PlatformPermissionService } from '@modules/users/platform-permissions/platform-permission.service';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { VehicleOwnershipGuard } from '@shared/auth/vehicle-ownership.guard';
import { PrismaService } from '@shared/database/prisma.service';
import type { RefreshTokenMembershipContext } from '@modules/auth/refresh-token.service';
import { createRefreshTokenHarness } from '@modules/users/iam-security-regression.harness';
import { ORGANIZATION_LIFECYCLE_DENIED_CODE } from '@shared/auth/organization-lifecycle-access.policy';
import { VehicleExteriorImagesService } from './vehicle-exterior-images.service';
import { VehiclesController } from './vehicles.controller';
import { VehiclesOperationalService } from './vehicles-operational.service';
import { VehiclesService } from './vehicles.service';
import { VehicleCleaningTaskService } from '@modules/tasks/vehicle-cleaning-task.service';
import { IamMfaStepUpService } from '@modules/iam-mfa/iam-mfa-step-up.service';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';

type MembershipRow = { role: string; status: string; permissions: unknown };

const ORG_STATUS: Record<string, OrganizationStatus> = {
  'org-a': OrganizationStatus.ACTIVE,
  'org-b': OrganizationStatus.ACTIVE,
  'org-suspended': OrganizationStatus.SUSPENDED,
};

const MEMBERSHIPS: Record<string, MembershipRow> = {
  'fleet-mgr|org-a': {
    role: 'WORKER',
    status: 'ACTIVE',
    permissions: { fleet: { read: true, write: true, manage: false } },
  },
  'reader|org-a': {
    role: 'WORKER',
    status: 'ACTIVE',
    permissions: { fleet: { read: true, write: false, manage: false } },
  },
  'fleet-mgr|org-suspended': {
    role: 'WORKER',
    status: 'ACTIVE',
    permissions: { fleet: { read: true, write: true, manage: false } },
  },
  'inactive|org-a': { role: 'WORKER', status: 'INACTIVE', permissions: {} },
  'fleet-mgr|org-b': {
    role: 'WORKER',
    status: 'ACTIVE',
    permissions: { fleet: { read: true, write: true, manage: false } },
  },
};

const VEHICLES: Record<string, { id: string; organizationId: string }> = {
  'veh-owned': { id: 'veh-owned', organizationId: 'org-a' },
  'veh-suspended-org': { id: 'veh-suspended-org', organizationId: 'org-suspended' },
  'veh-foreign': { id: 'veh-foreign', organizationId: 'org-b' },
};

function makePrisma() {
  return {
    organizationMembership: {
      findFirst: jest.fn(
        async (args: {
          where: {
            id?: string;
            userId?: string;
            organizationId?: string;
            status?: string;
          };
        }) => {
          const where = args.where;
          if (where.status && where.status !== 'ACTIVE') return null;

          if (where.id) {
            for (const [key, row] of Object.entries(MEMBERSHIPS)) {
              const memId = `m-${key}`;
              if (memId !== where.id) continue;
              const [userId, organizationId] = key.split('|');
              if (where.userId && where.userId !== userId) continue;
              if (row.status !== 'ACTIVE') return null;
              return {
                id: memId,
                role: row.role,
                permissions: row.permissions,
                membershipVersion: 1,
                organizationId,
                organization: {
                  status: ORG_STATUS[organizationId] ?? OrganizationStatus.ACTIVE,
                  companyName: organizationId,
                },
              };
            }
            return null;
          }

          const key = `${where.userId}|${where.organizationId}`;
          const row = MEMBERSHIPS[key];
          if (!row) return null;
          if (row.status !== 'ACTIVE') return null;
          const organizationId = where.organizationId!;
          return {
            id: `m-${key}`,
            role: row.role,
            permissions: row.permissions,
            membershipVersion: 1,
            organizationId,
            organization: {
              status: ORG_STATUS[organizationId] ?? OrganizationStatus.ACTIVE,
              companyName: organizationId,
            },
          };
        },
      ),
    },
    organization: {
      findUnique: jest.fn(async (args: { where: { id: string } }) => {
        const status = ORG_STATUS[args.where.id];
        if (!status) return null;
        return { id: args.where.id, status };
      }),
    },
    vehicle: {
      findFirst: jest.fn(
        async (args: { where: { id?: string; organizationId?: string } }) => {
          const id = args.where.id;
          if (!id) return null;
          const row = VEHICLES[id];
          if (!row) return null;
          if (args.where.organizationId && row.organizationId !== args.where.organizationId) {
            return null;
          }
          const status = ORG_STATUS[row.organizationId] ?? OrganizationStatus.ACTIVE;
          return { id: row.id, organization: { status } };
        },
      ),
    },
  };
}

describe('VehiclesController — vehicle ownership lifecycle HTTP security', () => {
  let app: INestApplication;
  let harness: ReturnType<typeof createRefreshTokenHarness>;
  let prisma: ReturnType<typeof createRefreshTokenHarness>['prisma'];
  let vehiclesService: {
    findById: jest.Mock;
    update: jest.Mock;
  };

  const priorJwtSecret = process.env.JWT_SECRET;
  let accessTokenOrgA: string;
  let accessTokenSuspended: string;
  let accessTokenOrgB: string;

  const membershipA = {
    role: 'WORKER',
    organizationId: 'org-a',
    organizationName: 'Org A',
    organizationLogoUrl: null,
    permissions: { fleet: { read: true, write: true } },
    membershipId: 'm-fleet-mgr|org-a',
    membershipVersion: 1,
    organizationRoleId: null,
  };

  async function issueMembershipToken(
    user: { id: string; email: string; name: string },
    membership: RefreshTokenMembershipContext,
  ): Promise<string> {
    harness.registerRefreshHarnessUser({
      id: user.id,
      email: user.email,
      name: user.name,
      platformRole: UserPlatformRole.USER,
      sessionVersion: 0,
    });
    return (
      await harness.service.issueTokenPair(
        {
          id: user.id,
          email: user.email,
          name: user.name,
          platformRole: UserPlatformRole.USER,
          sessionVersion: 0,
        },
        membership,
      )
    ).accessToken;
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret';
    harness = createRefreshTokenHarness();
    const extraPrisma = makePrisma();
    harness.prisma.organizationMembership.findFirst = extraPrisma.organizationMembership.findFirst;
    harness.prisma.organization = extraPrisma.organization;
    Object.assign(harness.prisma, { vehicle: extraPrisma.vehicle });
    prisma = harness.prisma;

    const refreshBindings = new Map<
      string,
      {
        family: string;
        scope: RefreshTokenScope;
        organizationId: string | null;
        membershipId: string | null;
        sessionVersion: number;
        membershipVersion: number | null;
      }
    >();
    const baseRefreshCreate = harness.prisma.refreshToken.create.getMockImplementation();
    harness.prisma.refreshToken.create.mockImplementation(async (args: { data: Record<string, unknown> }) => {
      const created = await baseRefreshCreate!(args);
      const data = args.data;
      const userId = data.userId as string;
      const family = data.family as string;
      refreshBindings.set(`${userId}:${family}`, {
        family,
        scope: data.scope as RefreshTokenScope,
        organizationId: (data.organizationId as string | null | undefined) ?? null,
        membershipId: (data.membershipId as string | null | undefined) ?? null,
        sessionVersion: (data.sessionVersion as number | undefined) ?? 0,
        membershipVersion: (data.membershipVersion as number | null | undefined) ?? null,
      });
      return created;
    });
    harness.prisma.refreshToken.findFirst.mockImplementation(
      async (query: {
        where: {
          userId?: string;
          family?: string;
          revokedAt?: null;
          replacedBy?: null;
          expiresAt?: { gt: Date };
        };
      }) => {
        const w = query.where;
        if (!w.userId || !w.family || w.revokedAt !== null) {
          return null;
        }
        const row = refreshBindings.get(`${w.userId}:${w.family}`);
        if (!row) {
          return null;
        }
        return {
          id: 'rt-bound',
          family: row.family,
          scope: row.scope,
          organizationId: row.organizationId,
          membershipId: row.membershipId,
          sessionVersion: row.sessionVersion,
          membershipVersion: row.membershipVersion,
        };
      },
    );

    accessTokenOrgA = await issueMembershipToken(
      { id: 'fleet-mgr', email: 'fleet@test.example', name: 'Fleet' },
      { ...membershipA, organizationId: 'org-a' },
    );

    ORG_STATUS['org-suspended'] = OrganizationStatus.ACTIVE;
    accessTokenSuspended = await issueMembershipToken(
      { id: 'fleet-mgr', email: 'susp@test.example', name: 'Susp' },
      {
        ...membershipA,
        organizationId: 'org-suspended',
        membershipId: 'm-fleet-mgr|org-suspended',
      },
    );
    ORG_STATUS['org-suspended'] = OrganizationStatus.SUSPENDED;

    accessTokenOrgB = await issueMembershipToken(
      { id: 'fleet-mgr', email: 'b@test.example', name: 'B' },
      {
        ...membershipA,
        organizationId: 'org-b',
        membershipId: 'm-fleet-mgr|org-b',
      },
    );

    vehiclesService = {
      findById: jest.fn().mockResolvedValue({ id: 'veh-owned' }),
      update: jest.fn().mockResolvedValue({ id: 'veh-owned' }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [VehiclesController],
      providers: [
        Reflector,
        AuthGuard,
        RolesGuard,
        OrgScopingGuard,
        PermissionsGuard,
        VehicleOwnershipGuard,
        MasterAdminMfaGuard,
        {
          provide: IamMfaStepUpService,
          useValue: { validateGrant: jest.fn().mockResolvedValue(false) },
        },
        { provide: VehiclesService, useValue: vehiclesService },
        { provide: PrismaService, useValue: prisma },
        { provide: VehicleExteriorImagesService, useValue: { listByVehicle: jest.fn() } },
        { provide: VehicleCleaningTaskService, useValue: {} },
        { provide: VehiclesOperationalService, useValue: {} },
        UserAccessAuthorityService,
        { provide: PlatformPermissionService, useValue: harness.platformPermissions },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    if (priorJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = priorJwtSecret;
    if (app) await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    ORG_STATUS['org-a'] = OrganizationStatus.ACTIVE;
    ORG_STATUS['org-suspended'] = OrganizationStatus.SUSPENDED;
    vehiclesService.findById.mockResolvedValue({ id: 'veh-owned' });
    vehiclesService.update.mockResolvedValue({ id: 'veh-owned' });
  });

  it('1 — signed JWT + ACTIVE org allows GET vehicle', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/vehicles/veh-owned')
      .set('Authorization', `Bearer ${accessTokenOrgA}`)
      .expect(200);
    expect(vehiclesService.findById).toHaveBeenCalled();
  });

  it('2 — same JWT shape after org SUSPENDED denies GET and PATCH', async () => {
    const resGet = await request(app.getHttpServer())
      .get('/api/v1/vehicles/veh-suspended-org')
      .set('Authorization', `Bearer ${accessTokenSuspended}`)
      .expect(403);
    expect(resGet.body.code).toBe(ORGANIZATION_LIFECYCLE_DENIED_CODE);
    expect(vehiclesService.findById).not.toHaveBeenCalled();

    const resPatch = await request(app.getHttpServer())
      .patch('/api/v1/vehicles/veh-suspended-org')
      .set('Authorization', `Bearer ${accessTokenSuspended}`)
      .send({ nickname: 'x' })
      .expect(403);
    expect(resPatch.body.code).toBe(ORGANIZATION_LIFECYCLE_DENIED_CODE);
    expect(vehiclesService.update).not.toHaveBeenCalled();
  });

  it('3 — ARCHIVED org denies vehicle GET', async () => {
    ORG_STATUS['org-a'] = OrganizationStatus.ARCHIVED;
    const res = await request(app.getHttpServer())
      .get('/api/v1/vehicles/veh-owned')
      .set('Authorization', `Bearer ${accessTokenOrgA}`)
      .expect(403);
    expect(res.body.code).toBe(ORGANIZATION_LIFECYCLE_DENIED_CODE);
  });

  it('4 — PENDING org denies operational vehicle GET', async () => {
    ORG_STATUS['org-a'] = OrganizationStatus.PENDING;
    await request(app.getHttpServer())
      .get('/api/v1/vehicles/veh-owned')
      .set('Authorization', `Bearer ${accessTokenOrgA}`)
      .expect(403);
  });

  it('5 — revoked membership denies before vehicle lookup', async () => {
    const inactiveToken = await issueMembershipToken(
      { id: 'inactive', email: 'in@test.example', name: 'Inactive' },
      {
        role: 'WORKER',
        organizationId: 'org-a',
        organizationName: 'Org A',
        organizationLogoUrl: null,
        permissions: {},
        membershipId: 'm-inactive|org-a',
        membershipVersion: 1,
        organizationRoleId: null,
      },
    );

    await request(app.getHttpServer())
      .get('/api/v1/vehicles/veh-owned')
      .set('Authorization', `Bearer ${inactiveToken}`)
      .expect(401);
    expect(vehiclesService.findById).not.toHaveBeenCalled();
  });

  it('6 — missing fleet.write denies PATCH', async () => {
    const readerToken = await issueMembershipToken(
      { id: 'reader', email: 'r@test.example', name: 'R' },
      {
        role: 'WORKER',
        organizationId: 'org-a',
        organizationName: 'Org A',
        organizationLogoUrl: null,
        permissions: { fleet: { read: true, write: false } },
        membershipId: 'm-reader|org-a',
        membershipVersion: 1,
        organizationRoleId: null,
      },
    );

    await request(app.getHttpServer())
      .patch('/api/v1/vehicles/veh-owned')
      .set('Authorization', `Bearer ${readerToken}`)
      .send({ nickname: 'blocked' })
      .expect(403);
    expect(vehiclesService.update).not.toHaveBeenCalled();
  });

  it('7 — cross-tenant vehicle returns 404', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/vehicles/veh-foreign')
      .set('Authorization', `Bearer ${accessTokenOrgA}`)
      .expect(404);
  });

  it('8 — MASTER_ADMIN bypasses lifecycle on GET', async () => {
    ORG_STATUS['org-a'] = OrganizationStatus.SUSPENDED;
    harness.registerRefreshHarnessUser({
      id: 'ma',
      email: 'ma@test.example',
      name: 'MA',
      platformRole: UserPlatformRole.MASTER_ADMIN,
      sessionVersion: 0,
    });
    const maToken = (await harness.service.issueTokenPair(
      {
        id: 'ma',
        email: 'ma@test.example',
        name: 'MA',
        platformRole: UserPlatformRole.MASTER_ADMIN,
        sessionVersion: 0,
      },
      null,
    )).accessToken;
    vehiclesService.findById.mockResolvedValue({ id: 'veh-owned' });
    await request(app.getHttpServer())
      .get('/api/v1/vehicles/veh-owned')
      .set('Authorization', `Bearer ${maToken}`)
      .expect(200);
  });

  it('9 — org B remains accessible when JWT targets org B', async () => {
    vehiclesService.findById.mockResolvedValue({ id: 'veh-foreign' });
    await request(app.getHttpServer())
      .get('/api/v1/vehicles/veh-foreign')
      .set('Authorization', `Bearer ${accessTokenOrgB}`)
      .expect(200);
  });

  it('F2 — same signed JWT after DB suspension denies GET and PATCH', async () => {
    const token = accessTokenOrgA;
    ORG_STATUS['org-a'] = OrganizationStatus.ACTIVE;

    await request(app.getHttpServer())
      .get('/api/v1/vehicles/veh-owned')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(vehiclesService.findById).toHaveBeenCalledTimes(1);

    vehiclesService.findById.mockClear();
    vehiclesService.update.mockClear();

    await request(app.getHttpServer())
      .patch('/api/v1/vehicles/veh-owned')
      .set('Authorization', `Bearer ${token}`)
      .send({ nickname: 'before-suspend' })
      .expect(200);
    expect(vehiclesService.update).toHaveBeenCalledTimes(1);

    ORG_STATUS['org-a'] = OrganizationStatus.SUSPENDED;
    vehiclesService.findById.mockClear();
    vehiclesService.update.mockClear();

    const deniedGet = await request(app.getHttpServer())
      .get('/api/v1/vehicles/veh-owned')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    expect(deniedGet.body.code).toBe(ORGANIZATION_LIFECYCLE_DENIED_CODE);
    expect(vehiclesService.findById).not.toHaveBeenCalled();

    const deniedPatch = await request(app.getHttpServer())
      .patch('/api/v1/vehicles/veh-owned')
      .set('Authorization', `Bearer ${token}`)
      .send({ nickname: 'after-suspend' })
      .expect(403);
    expect(deniedPatch.body.code).toBe(ORGANIZATION_LIFECYCLE_DENIED_CODE);
    expect(vehiclesService.update).not.toHaveBeenCalled();
  });

  it('10 — PATCH success does not run service when lifecycle denies', async () => {
    ORG_STATUS['org-suspended'] = OrganizationStatus.SUSPENDED;
    await request(app.getHttpServer())
      .patch('/api/v1/vehicles/veh-suspended-org')
      .set('Authorization', `Bearer ${accessTokenSuspended}`)
      .send({ nickname: 'nope' })
      .expect(403);
    expect(vehiclesService.update).not.toHaveBeenCalled();
  });
});