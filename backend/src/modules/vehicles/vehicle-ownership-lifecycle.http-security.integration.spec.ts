import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { OrganizationStatus, UserPlatformRole } from '@prisma/client';
import * as request from 'supertest';
import { AuthGuard } from '@shared/auth/auth.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { VehicleOwnershipGuard } from '@shared/auth/vehicle-ownership.guard';
import { PrismaService } from '@shared/database/prisma.service';
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
          where: { userId: string; organizationId: string; status?: string };
        }) => {
          const key = `${args.where.userId}|${args.where.organizationId}`;
          const row = MEMBERSHIPS[key];
          if (!row) return null;
          if (args.where.status && row.status !== args.where.status) return null;
          return { id: `m-${key}`, role: row.role, permissions: row.permissions };
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
    refreshToken: { create: jest.fn().mockResolvedValue({ id: 'rt-1' }) },
  };
}

describe('VehiclesController — vehicle ownership lifecycle HTTP security', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof makePrisma>;
  let vehiclesService: {
    findById: jest.Mock;
    update: jest.Mock;
  };

  const priorJwtSecret = process.env.JWT_SECRET;
  let accessTokenOrgA: string;
  let accessTokenSuspended: string;
  let accessTokenOrgB: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret';
    const harness = createRefreshTokenHarness();
    harness.prisma.refreshToken.create.mockResolvedValue({ id: 'rt-http-lifecycle' });

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

    accessTokenOrgA = (
      await harness.service.issueTokenPair(
        {
          id: 'fleet-mgr',
          email: 'fleet@test.example',
          name: 'Fleet',
          platformRole: UserPlatformRole.USER,
          sessionVersion: 0,
        },
        {
          ...membershipA,
          organizationId: 'org-a',
        },
      )
    ).accessToken;

    accessTokenSuspended = (
      await harness.service.issueTokenPair(
        {
          id: 'fleet-mgr',
          email: 'susp@test.example',
          name: 'Susp',
          platformRole: UserPlatformRole.USER,
          sessionVersion: 0,
        },
        {
          ...membershipA,
          organizationId: 'org-suspended',
          membershipId: 'm-fleet-mgr|org-suspended',
        },
      )
    ).accessToken;

    accessTokenOrgB = (
      await harness.service.issueTokenPair(
        {
          id: 'fleet-mgr',
          email: 'b@test.example',
          name: 'B',
          platformRole: UserPlatformRole.USER,
          sessionVersion: 0,
        },
        {
          ...membershipA,
          organizationId: 'org-b',
          membershipId: 'm-fleet-mgr|org-b',
        },
      )
    ).accessToken;

    Object.assign(harness.prisma, makePrisma());
    prisma = harness.prisma as unknown as ReturnType<typeof makePrisma>;

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
    const harness = createRefreshTokenHarness();
    harness.prisma.refreshToken.create.mockResolvedValue({ id: 'rt-inactive' });
    const inactiveToken = (
      await harness.service.issueTokenPair(
        {
          id: 'inactive',
          email: 'in@test.example',
          name: 'Inactive',
          platformRole: UserPlatformRole.USER,
          sessionVersion: 0,
        },
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
      )
    ).accessToken;

    await request(app.getHttpServer())
      .get('/api/v1/vehicles/veh-owned')
      .set('Authorization', `Bearer ${inactiveToken}`)
      .expect(403);
    expect(vehiclesService.findById).not.toHaveBeenCalled();
  });

  it('6 — missing fleet.write denies PATCH', async () => {
    const harness = createRefreshTokenHarness();
    harness.prisma.refreshToken.create.mockResolvedValue({ id: 'rt-reader' });
    const readerToken = (
      await harness.service.issueTokenPair(
        {
          id: 'reader',
          email: 'r@test.example',
          name: 'R',
          platformRole: UserPlatformRole.USER,
          sessionVersion: 0,
        },
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
      )
    ).accessToken;

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
    const harness = createRefreshTokenHarness();
    harness.prisma.refreshToken.create.mockResolvedValue({ id: 'rt-ma' });
    const maToken = (
      await harness.service.issueTokenPair(
        {
          id: 'ma',
          email: 'ma@test.example',
          name: 'MA',
          platformRole: UserPlatformRole.MASTER_ADMIN,
          sessionVersion: 0,
        },
        null,
      )
    ).accessToken;
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