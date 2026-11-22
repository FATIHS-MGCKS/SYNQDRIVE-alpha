import {
  Controller,
  Get,
  INestApplication,
  UseGuards,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { UserPlatformRole } from '@prisma/client';
import * as request from 'supertest';
import { AuthGuard } from '@shared/auth/auth.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PrismaService } from '@shared/database/prisma.service';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { Roles } from '@shared/decorators/roles.decorator';
import { UiAuditWriteDenyGuard } from './ui-audit-write-deny.guard';
import { UiAuditSessionEnforcementGuard } from './ui-audit-session-enforcement.guard';
import { createRefreshTokenHarness } from '@modules/users/iam-security-regression.harness';
import { PlatformPermissionService } from '@modules/users/platform-permissions/platform-permission.service';

const ORG_A = 'org-audit-a';
const ORG_B = 'org-audit-b';

type MembershipRow = {
  role: string;
  status: string;
  permissions: Record<string, { read: boolean; write: boolean; manage?: boolean }>;
};

const MEMBERSHIPS: Record<string, MembershipRow> = {
  'rental-audit|org-audit-a': {
    role: 'WORKER',
    status: 'ACTIVE',
    permissions: {
      bookings: { read: true, write: false },
      dashboard: { read: true, write: false },
    },
  },
  'operator-audit|org-audit-a': {
    role: 'WORKER',
    status: 'ACTIVE',
    permissions: {
      bookings: { read: true, write: false },
      fleet: { read: true, write: false },
    },
  },
  'operator-audit-only|org-audit-a': {
    role: 'WORKER',
    status: 'ACTIVE',
    permissions: {
      bookings: { read: true, write: false },
    },
  },
  'rental-audit|org-audit-b': {
    role: 'WORKER',
    status: 'ACTIVE',
    permissions: { bookings: { read: true, write: false } },
  },
  'inactive-audit|org-audit-a': {
    role: 'WORKER',
    status: 'INACTIVE',
    permissions: { bookings: { read: true, write: false } },
  },
};

function membershipKey(userId: string, orgId: string): string {
  return `${userId}|${orgId}`;
}

@Controller('api/v1')
@UseGuards(RolesGuard, OrgScopingGuard)
class UiAuditProbeController {
  @Get('organizations/:orgId/bookings')
  @RequirePermission('bookings', 'read')
  bookings() {
    return { ok: true };
  }

  @Get('organizations/:orgId/dashboard')
  @RequirePermission('dashboard', 'read')
  dashboard() {
    return { ok: true };
  }

  @Get('organizations/:orgId/bookings/today/pickups')
  @RequirePermission('bookings', 'read')
  todayPickups() {
    return { ok: true };
  }

  @Get('organizations/:orgId/settings/profile')
  settingsProfile() {
    return { sensitive: true };
  }

  @Get('admin/dashboard/operational')
  @Roles('MASTER_ADMIN')
  masterDash() {
    return { ok: true };
  }

  @Get('admin/organizations')
  @Roles('MASTER_ADMIN')
  masterOrgs() {
    return { sensitive: true };
  }
}

describe('UI audit — HTTP security integration', () => {
  let app: INestApplication;
  let platformPermissions: { resolveJwtPermissions: jest.Mock };
  const priorJwt = process.env.JWT_SECRET;

  let tokenRentalA: string;
  let tokenRentalAStale: string;
  let tokenOperatorA: string;
  let tokenMasterAudit: string;
  let tokenWrongOrg: string;
  let tokenNoMembership: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret';
    const harness = createRefreshTokenHarness();

    platformPermissions = {
      resolveJwtPermissions: jest.fn(async (userId: string) => {
        if (userId === 'rental-audit-stale') return [];
        if (userId === 'rental-audit' || userId === 'inactive-audit') return ['ui-audit-rental'];
        if (userId === 'operator-audit-only') return ['ui-audit-operator'];
        if (userId === 'master-audit') return ['ui-audit-master'];
        return [];
      }),
    };
    harness.platformPermissions.resolveJwtPermissions.mockImplementation(
      platformPermissions.resolveJwtPermissions,
    );
    harness.prisma.refreshToken.create.mockResolvedValue({ id: 'rt-ui-audit-http' });

    const prismaMembership = {
      findFirst: jest.fn(async (args: { where: { userId: string; organizationId: string; status?: string } }) => {
        const key = membershipKey(args.where.userId, args.where.organizationId);
        const row = MEMBERSHIPS[key];
        if (!row) return null;
        if (args.where.status && row.status !== args.where.status) return null;
        return {
          id: `mem-${key}`,
          role: row.role,
          permissions: row.permissions,
          organization: { status: 'ACTIVE' },
        };
      }),
    };

    const prisma = {
      ...harness.prisma,
      organizationMembership: prismaMembership,
      user: {
        findUnique: jest.fn(async (args: { where: { id: string } }) => {
          const id = args.where.id;
          if (id === 'no-membership') {
            return {
              status: 'ACTIVE',
              platformRole: UserPlatformRole.USER,
              sessionVersion: 1,
            };
          }
          return {
            status: 'ACTIVE',
            platformRole: UserPlatformRole.USER,
            sessionVersion: id === 'rental-audit-stale' ? 2 : 1,
          };
        }),
      },
    };

    const membershipA = {
      role: 'WORKER',
      organizationId: ORG_A,
      organizationName: 'Org A',
      organizationLogoUrl: null,
      permissions: MEMBERSHIPS['rental-audit|org-audit-a']!.permissions,
      membershipId: 'mem-rental-a',
      membershipVersion: 1,
      organizationRoleId: null,
    };

    tokenRentalAStale = (
      await harness.service.issueTokenPair(
        {
          id: 'rental-audit',
          email: 'stale@test.example',
          name: 'Stale',
          platformRole: UserPlatformRole.USER,
          sessionVersion: 0,
        },
        membershipA,
      )
    ).accessToken;

    const rentalAuditJwt = (
      await harness.service.issueTokenPair(
        {
          id: 'rental-audit',
          email: 'rental@test.example',
          name: 'Rental Audit',
          platformRole: UserPlatformRole.USER,
          sessionVersion: 1,
        },
        membershipA,
      )
    ).accessToken;
    tokenRentalA = rentalAuditJwt;

    tokenOperatorA = (
      await harness.service.issueTokenPair(
        {
          id: 'operator-audit-only',
          email: 'op@test.example',
          name: 'Operator',
          platformRole: UserPlatformRole.USER,
          sessionVersion: 1,
        },
        membershipA,
      )
    ).accessToken;

    tokenMasterAudit = (
      await harness.service.issueTokenPair(
        {
          id: 'master-audit',
          email: 'master-audit@test.example',
          name: 'Master Audit',
          platformRole: UserPlatformRole.USER,
          sessionVersion: 1,
        },
        null,
      )
    ).accessToken;

    tokenWrongOrg = (
      await harness.service.issueTokenPair(
        {
          id: 'rental-audit',
          email: 'rental@test.example',
          name: 'Rental Audit',
          platformRole: UserPlatformRole.USER,
          sessionVersion: 1,
        },
        { ...membershipA, organizationId: ORG_B, membershipId: 'mem-rental-b' },
      )
    ).accessToken;

    tokenNoMembership = (
      await harness.service.issueTokenPair(
        {
          id: 'no-membership',
          email: 'none@test.example',
          name: 'None',
          platformRole: UserPlatformRole.USER,
          sessionVersion: 1,
        },
        { ...membershipA, organizationId: ORG_A },
      )
    ).accessToken;

    const moduleRef = await Test.createTestingModule({
      controllers: [UiAuditProbeController],
      providers: [
        AuthGuard,
        RolesGuard,
        OrgScopingGuard,
        PermissionsGuard,
        Reflector,
        UiAuditWriteDenyGuard,
        UiAuditSessionEnforcementGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: PlatformPermissionService, useValue: platformPermissions },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: UiAuditSessionEnforcementGuard },
        { provide: APP_GUARD, useClass: UiAuditWriteDenyGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (priorJwt === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = priorJwt;
  });

  it('allows rental audit GET bookings in org A', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${ORG_A}/bookings`)
      .set('Authorization', `Bearer ${tokenRentalA}`)
      .expect(200);
  });

  it('denies cross-tenant org B route with JWT bound to org B against org A path', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${ORG_A}/bookings`)
      .set('Authorization', `Bearer ${tokenWrongOrg}`)
      .expect(403);
  });

  it('denies inactive membership', async () => {
    const harness = createRefreshTokenHarness();
    harness.prisma.refreshToken.create.mockResolvedValue({ id: 'rt-inactive' });
    const inactiveHarness = createRefreshTokenHarness();
    inactiveHarness.platformPermissions.resolveJwtPermissions.mockResolvedValue(['ui-audit-rental']);
    inactiveHarness.prisma.refreshToken.create.mockResolvedValue({ id: 'rt-inactive' });
    const inactive = (
      await inactiveHarness.service.issueTokenPair(
        {
          id: 'inactive-audit',
          email: 'inactive@test.example',
          name: 'Inactive',
          platformRole: UserPlatformRole.USER,
          sessionVersion: 1,
        },
        {
          role: 'WORKER',
          organizationId: ORG_A,
          organizationName: 'Org A',
          organizationLogoUrl: null,
          permissions: { bookings: { read: true, write: false } },
          membershipId: 'mem-inactive',
          membershipVersion: 1,
          organizationRoleId: null,
        },
      )
    ).accessToken;

    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${ORG_A}/bookings`)
      .set('Authorization', `Bearer ${inactive}`)
      .expect(403);
  });

  it('denies operator grant on rental dashboard path', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${ORG_A}/dashboard`)
      .set('Authorization', `Bearer ${tokenOperatorA}`)
      .expect(403);
  });

  it('allows operator grant on today pickups path', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${ORG_A}/bookings/today/pickups`)
      .set('Authorization', `Bearer ${tokenOperatorA}`)
      .expect(200);
  });

  it('denies rental grant on settings subtree', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${ORG_A}/settings/profile`)
      .set('Authorization', `Bearer ${tokenRentalA}`)
      .expect(403);
  });

  it('allows master audit on allowlisted operational dashboard', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/dashboard/operational')
      .set('Authorization', `Bearer ${tokenMasterAudit}`)
      .expect(200);
  });

  it('denies master audit on blocked organizations directory', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/organizations')
      .set('Authorization', `Bearer ${tokenMasterAudit}`)
      .expect(403);
  });

  it('denies stale sessionVersion for audit identity', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${ORG_A}/bookings`)
      .set('Authorization', `Bearer ${tokenRentalAStale}`)
      .expect(401);
  });

  it('denies audit identity when DB grants were revoked', async () => {
    platformPermissions.resolveJwtPermissions.mockResolvedValueOnce([]);
    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${ORG_A}/bookings`)
      .set('Authorization', `Bearer ${tokenRentalA}`)
      .expect(401);
  });
});