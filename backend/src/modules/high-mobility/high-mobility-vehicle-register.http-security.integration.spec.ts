import { INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { OrganizationStatus, UserPlatformRole } from '@prisma/client';
import * as request from 'supertest';
import { AuthGuard } from '@shared/auth/auth.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { VehicleOwnershipGuard } from '@shared/auth/vehicle-ownership.guard';
import { PrismaService } from '@shared/database/prisma.service';
import { HighMobilityVehicleRegisterController } from './high-mobility-vehicle-register.controller';
import { HighMobilityVehicleLinkService } from './high-mobility-vehicle-link.service';
import { HighMobilityRegistrationService } from './high-mobility-registration.service';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const ORG_SUSPENDED = 'org-suspended';
const ORG_PENDING = 'org-pending';
const ORG_ARCHIVED = 'org-archived';
const VEH_A = 'veh-a';
const VEH_B = 'veh-b';
const HM_ORG_A = 'hm-a';
const HM_ORG_B = 'hm-b';

function authHeader(user: Record<string, unknown>): [string, string] {
  return ['x-test-user', JSON.stringify(user)];
}

describe('HighMobilityVehicleRegisterController HTTP security', () => {
  let app: INestApplication;
  const linkMutations = { activate: 0, telemetry: 0 };
  const registrations = { called: 0 };

  const linkService = {
    checkAvailability: jest.fn(async (vin: string) => ({
      vin,
      available: true,
      hmVehicleId: HM_ORG_A,
      linkedVehicleId: null,
    })),
    checkAvailabilityForOrganization: jest.fn(async (vin: string, orgId: string) => {
      if (vin === 'VINSECRET' && orgId === ORG_B) {
        return { vin, hmVehicleId: HM_ORG_B, available: true, linkedVehicleId: VEH_B };
      }
      if (vin === 'VINSHARED' && orgId === ORG_A) {
        return { vin, hmVehicleId: HM_ORG_A, available: true, linkedVehicleId: null };
      }
      return { vin, available: false, hmVehicleId: null, linkedVehicleId: null };
    }),
    activateHealthLink: jest.fn(async () => {
      linkMutations.activate += 1;
    }),
    linkFullTelemetry: jest.fn(async () => {
      linkMutations.telemetry += 1;
    }),
  };

  const registrationService = {
    registerHmOnlyVehicle: jest.fn(async () => {
      registrations.called += 1;
      return { success: true };
    }),
    getHmOnlyCandidates: jest.fn(async (orgId: string) =>
      orgId === ORG_A ? [{ id: HM_ORG_A, vin: 'VIN1' }] : [],
    ),
  };

  const memberships: Record<string, { role: string; permissions: object }> = {
    [`writer|${ORG_A}`]: {
      role: 'WORKER',
      permissions: { fleet: { read: true, write: true } },
    },
    [`reader|${ORG_A}`]: {
      role: 'WORKER',
      permissions: { fleet: { read: true, write: false } },
    },
    [`writer|${ORG_SUSPENDED}`]: {
      role: 'WORKER',
      permissions: { fleet: { read: true, write: true } },
    },
    [`writer|${ORG_PENDING}`]: {
      role: 'WORKER',
      permissions: { fleet: { read: true, write: true } },
    },
    [`writer|${ORG_ARCHIVED}`]: {
      role: 'WORKER',
      permissions: { fleet: { read: true, write: true } },
    },
  };

  const vehicles: Record<string, { organizationId: string }> = {
    [VEH_A]: { organizationId: ORG_A },
    [VEH_B]: { organizationId: ORG_B },
    'veh-suspended-org': { organizationId: ORG_SUSPENDED },
  };

  const orgStatus: Record<string, OrganizationStatus> = {
    [ORG_A]: OrganizationStatus.ACTIVE,
    [ORG_B]: OrganizationStatus.ACTIVE,
    [ORG_SUSPENDED]: OrganizationStatus.SUSPENDED,
    [ORG_PENDING]: OrganizationStatus.PENDING,
    [ORG_ARCHIVED]: OrganizationStatus.ARCHIVED,
  };

  const prisma = {
    organizationMembership: {
      findFirst: jest.fn(async (args: { where: { userId: string; organizationId: string; status?: string } }) => {
        const key = `${args.where.userId}|${args.where.organizationId}`;
        if (!memberships[key]) return null;
        if (args.where.status && args.where.status !== 'ACTIVE') return null;
        return {
          id: `m-${key}`,
          role: memberships[key].role,
          permissions: memberships[key].permissions,
        };
      }),
    },
    vehicle: {
      findFirst: jest.fn(async (args: { where: { id?: string; organizationId?: string } }) => {
        const row = args.where.id ? vehicles[args.where.id] : null;
        if (!row) return null;
        if (args.where.organizationId && row.organizationId !== args.where.organizationId) {
          return null;
        }
        const status = orgStatus[row.organizationId];
        return { id: args.where.id, organization: { status } };
      }),
      findUnique: jest.fn(async (args: { where: { id: string } }) => {
        const row = vehicles[args.where.id];
        if (!row) return null;
        const status = orgStatus[row.organizationId];
        return {
          id: args.where.id,
          organizationId: row.organizationId,
          organization: { status },
        };
      }),
    },
    organization: {
      findUnique: jest.fn(async (args: { where: { id: string } }) => {
        const status = orgStatus[args.where.id];
        return status ? { id: args.where.id, status } : null;
      }),
    },
  };

  class TestAuthGuard {
    async canActivate(context: any) {
      const req = context.switchToHttp().getRequest();
      const raw = req.headers['x-test-user'];
      if (!raw) throw new Error('unauthorized');
      req.user = JSON.parse(raw);
      return true;
    }
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HighMobilityVehicleRegisterController],
      providers: [
        { provide: HighMobilityVehicleLinkService, useValue: linkService },
        { provide: HighMobilityRegistrationService, useValue: registrationService },
        { provide: PrismaService, useValue: prisma },
        Reflector,
        RolesGuard,
        VehicleOwnershipGuard,
        PermissionsGuard,
        { provide: APP_GUARD, useClass: TestAuthGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    linkMutations.activate = 0;
    linkMutations.telemetry = 0;
    registrations.called = 0;
    jest.clearAllMocks();
  });

  const tenant = (userId: string, orgId: string) => ({
    id: userId,
    platformRole: UserPlatformRole.USER,
    organizationId: orgId,
    membershipRole: 'WORKER',
  });

  it('allows own org vehicle health activation', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/vehicles/${VEH_A}/activate-high-mobility-health`)
      .set(...authHeader(tenant('writer', ORG_A)))
      .send({ hmVehicleId: HM_ORG_A })
      .expect((res) => expect([200, 201]).toContain(res.status));
    expect(linkMutations.activate).toBe(1);
  });

  it('denies foreign vehicle activation', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/vehicles/${VEH_B}/activate-high-mobility-health`)
      .set(...authHeader(tenant('writer', ORG_A)))
      .send({ hmVehicleId: HM_ORG_B })
      .expect(404);
    expect(linkMutations.activate).toBe(0);
  });

  it('denies suspended org operational mutation', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/vehicles/veh-suspended-org/activate-high-mobility-health`)
      .set(...authHeader(tenant('writer', ORG_SUSPENDED)))
      .send({ hmVehicleId: HM_ORG_A })
      .expect(403);
    expect(linkMutations.activate).toBe(0);
  });

  it('denies missing fleet.write', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/vehicles/${VEH_A}/activate-high-mobility-health`)
      .set(...authHeader(tenant('reader', ORG_A)))
      .send({ hmVehicleId: HM_ORG_A })
      .expect(403);
    expect(linkMutations.activate).toBe(0);
  });

  it('rejects hm-only body organizationId mismatch', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/vehicles/register/hm-only')
      .set(...authHeader(tenant('writer', ORG_A)))
      .send({ hmVehicleId: HM_ORG_A, organizationId: ORG_B })
      .expect(403);
    expect(registrations.called).toBe(0);
  });

  it('does not disclose foreign HM identifiers on discovery', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/vehicles/register/high-mobility-availability?vin=VINSECRET')
      .set(...authHeader(tenant('reader', ORG_A)))
      .expect(200);
    expect(res.body.hmVehicleId).toBeNull();
  });

  it('denies PENDING tenant HM_ONLY register before service', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/vehicles/register/hm-only')
      .set(...authHeader(tenant('writer', ORG_PENDING)))
      .send({ hmVehicleId: HM_ORG_A, organizationId: ORG_PENDING })
      .expect(403);
    expect(registrations.called).toBe(0);
  });

  it('denies ARCHIVED tenant HM_ONLY register before service', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/vehicles/register/hm-only')
      .set(...authHeader(tenant('writer', ORG_ARCHIVED)))
      .send({ hmVehicleId: HM_ORG_A, organizationId: ORG_ARCHIVED })
      .expect(403);
    expect(registrations.called).toBe(0);
  });

  it('denies PENDING tenant HM discovery', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/vehicles/register/high-mobility-availability?vin=VINSHARED')
      .set(...authHeader(tenant('reader', ORG_PENDING)))
      .expect(403);
    expect(linkService.checkAvailabilityForOrganization).not.toHaveBeenCalled();
  });

  it('allows Master Admin discovery without tenant org', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/vehicles/register/high-mobility-availability?vin=VINSHARED')
      .set(
        ...authHeader({
          id: 'ma-1',
          platformRole: UserPlatformRole.MASTER_ADMIN,
          organizationId: null,
        }),
      )
      .expect(200);
    expect(linkService.checkAvailability).toHaveBeenCalled();
  });

  it('allows Master Admin vehicle link without JWT org', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/vehicles/${VEH_A}/activate-high-mobility-health`)
      .set(
        ...authHeader({
          id: 'ma-1',
          platformRole: UserPlatformRole.MASTER_ADMIN,
          organizationId: null,
        }),
      )
      .send({ hmVehicleId: HM_ORG_A })
      .expect((res) => expect([200, 201]).toContain(res.status));
    expect(linkMutations.activate).toBe(1);
  });

  it('requires explicit org for Master Admin HM_ONLY', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/vehicles/register/hm-only')
      .set(
        ...authHeader({
          id: 'ma-1',
          platformRole: UserPlatformRole.MASTER_ADMIN,
          organizationId: null,
        }),
      )
      .send({ hmVehicleId: HM_ORG_A })
      .expect(400);
    expect(registrations.called).toBe(0);
  });

  it('allows ACTIVE tenant HM_ONLY with fleet.write', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/vehicles/register/hm-only')
      .set(...authHeader(tenant('writer', ORG_A)))
      .send({ hmVehicleId: HM_ORG_A, organizationId: ORG_A })
      .expect(201);
    expect(registrations.called).toBe(1);
  });
});