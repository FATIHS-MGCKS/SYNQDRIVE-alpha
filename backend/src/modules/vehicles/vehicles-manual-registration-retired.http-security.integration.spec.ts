import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { UserPlatformRole } from '@prisma/client';
import * as request from 'supertest';
import { VehicleCleaningTaskService } from '@modules/tasks/vehicle-cleaning-task.service';
import { IamMfaStepUpService } from '@modules/iam-mfa/iam-mfa-step-up.service';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PrismaService } from '@shared/database/prisma.service';
import {
  CANONICAL_DIMO_REGISTRATION_ROUTE,
  CANONICAL_HM_ONLY_REGISTRATION_ROUTE,
  MANUAL_VEHICLE_REGISTRATION_RETIRED_CODE,
} from './legacy-manual-vehicle-registration.errors';
import { VehicleExteriorImagesService } from './vehicle-exterior-images.service';
import { VehiclesController } from './vehicles.controller';
import { VehiclesOperationalService } from './vehicles-operational.service';
import { VehiclesService } from './vehicles.service';

@Injectable()
class TestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (!req.user) throw new UnauthorizedException('Missing authentication token');
    return true;
  }
}

function auth(user: Record<string, unknown> | null): [string, string] {
  return ['x-test-user', JSON.stringify(user)];
}

function conflictPayload(body: Record<string, unknown>) {
  const nested = body.message;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }
  return body;
}

type MembershipRow = { role: string; status: string; permissions: unknown };

const MEMBERSHIPS: Record<string, MembershipRow> = {
  'fleet-writer|org-a': {
    role: 'WORKER',
    status: 'ACTIVE',
    permissions: { fleet: { read: true, write: true, manage: false } },
  },
  'reader|org-a': {
    role: 'WORKER',
    status: 'ACTIVE',
    permissions: { fleet: { read: true, write: false, manage: false } },
  },
  'org-admin|org-a': { role: 'ORG_ADMIN', status: 'ACTIVE', permissions: {} },
  'inactive|org-a': {
    role: 'WORKER',
    status: 'ACTIVE',
    permissions: { fleet: { write: true } },
  },
  'fleet-writer|org-b': {
    role: 'WORKER',
    status: 'ACTIVE',
    permissions: { fleet: { write: true, manage: true } },
  },
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
          return {
            id: `m-${key}`,
            role: row.role,
            permissions: row.permissions,
            organization: { status: 'ACTIVE' },
          };
        },
      ),
    },
    organization: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        status: 'ACTIVE',
      })),
    },
    vehicle: {
      create: jest.fn(),
      update: jest.fn(),
    },
    userMfaFactor: { findFirst: jest.fn() },
  };
}

describe('VehiclesController — manual registration retirement HTTP security integration', () => {
  let app: INestApplication;
  let vehiclesService: {
    create: jest.Mock;
    registerFromDimo: jest.Mock;
    activateVehicleOnboarding: jest.Mock;
  };
  let prisma: ReturnType<typeof makePrisma>;

  const orgA = 'org-a';
  const orgB = 'org-b';
  const path = (orgId: string) => `/api/v1/organizations/${orgId}/vehicles`;
  const payload = { vin: 'VINRETIRED001', make: 'Test', model: 'Manual', year: 2026 };

  const originalEnv = process.env;

  beforeAll(async () => {
    process.env = {
      ...originalEnv,
      IAM_MFA_MASTER_ADMIN_ENABLED: 'true',
      IAM_MFA_STEP_UP_ENFORCED: 'true',
      IAM_MFA_PRIVILEGED_ENROLLMENT_REQUIRED: 'false',
    };

    prisma = makePrisma();
    vehiclesService = {
      create: jest.fn(),
      registerFromDimo: jest.fn(),
      activateVehicleOnboarding: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [VehiclesController],
      providers: [
        Reflector,
        RolesGuard,
        OrgScopingGuard,
        PermissionsGuard,
        MasterAdminMfaGuard,
        { provide: VehiclesService, useValue: vehiclesService },
        {
          provide: IamMfaStepUpService,
          useValue: { validateGrant: jest.fn().mockResolvedValue(false) },
        },
        { provide: PrismaService, useValue: prisma },
        { provide: VehicleExteriorImagesService, useValue: {} },
        { provide: VehicleCleaningTaskService, useValue: {} },
        { provide: VehiclesOperationalService, useValue: {} },
        { provide: APP_GUARD, useClass: TestAuthGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(
      (req: { headers: Record<string, string>; user?: unknown }, _res: unknown, next: () => void) => {
        const header = req.headers['x-test-user'];
        if (header && header !== 'null') req.user = JSON.parse(header);
        next();
      },
    );
    await app.init();
  });

  afterAll(async () => {
    process.env = originalEnv;
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const fleetWriterA = {
    id: 'fleet-writer',
    platformRole: 'USER',
    organizationId: orgA,
  };
  const readerA = { id: 'reader', platformRole: 'USER', organizationId: orgA };
  const orgAdminA = { id: 'org-admin', platformRole: 'USER', organizationId: orgA };
  const inactiveA = { id: 'inactive', platformRole: 'USER', organizationId: orgA };
  const fleetWriterB = { id: 'fleet-writer', platformRole: 'USER', organizationId: orgB };
  const masterAdmin = { id: 'ma-1', platformRole: UserPlatformRole.MASTER_ADMIN };

  function expectManualRetirementContract(res: request.Response) {
    const body = conflictPayload(res.body as Record<string, unknown>);
    expect(body).toMatchObject({
      code: MANUAL_VEHICLE_REGISTRATION_RETIRED_CODE,
      action: 'USE_PROVIDER_REGISTRATION_CHANNEL',
      allowedChannels: ['DIMO', 'HIGH_MOBILITY'],
      canonicalRoutes: {
        dimo: CANONICAL_DIMO_REGISTRATION_ROUTE,
        highMobility: CANONICAL_HM_ONLY_REGISTRATION_ROUTE,
      },
    });
  }

  function expectZeroSideEffects() {
    expect(vehiclesService.create).not.toHaveBeenCalled();
    expect(vehiclesService.registerFromDimo).not.toHaveBeenCalled();
    expect(vehiclesService.activateVehicleOnboarding).not.toHaveBeenCalled();
    expect(prisma.vehicle.create).not.toHaveBeenCalled();
    expect(prisma.vehicle.update).not.toHaveBeenCalled();
  }

  it('A — anonymous POST denied (401)', async () => {
    await request(app.getHttpServer()).post(path(orgA)).send(payload).expect(401);
    expectZeroSideEffects();
  });

  it('B — tenant from wrong organization denied (403)', async () => {
    await request(app.getHttpServer())
      .post(path(orgA))
      .set(...auth(fleetWriterB))
      .send(payload)
      .expect(403);
    expectZeroSideEffects();
  });

  it('C — tenant without fleet.write denied (403)', async () => {
    await request(app.getHttpServer())
      .post(path(orgA))
      .set(...auth(readerA))
      .send(payload)
      .expect(403);
    expectZeroSideEffects();
  });

  it('D — authorized fleet.write receives HTTP 409 retirement contract', async () => {
    const res = await request(app.getHttpServer())
      .post(path(orgA))
      .set(...auth(fleetWriterA))
      .send(payload)
      .expect(409);
    expectManualRetirementContract(res);
    expectZeroSideEffects();
  });

  it('E — ORG_ADMIN in own organization receives HTTP 409', async () => {
    const res = await request(app.getHttpServer())
      .post(path(orgA))
      .set(...auth(orgAdminA))
      .send(payload)
      .expect(409);
    expectManualRetirementContract(res);
    expectZeroSideEffects();
  });

  it('F — MASTER_ADMIN receives HTTP 409 (no registration bypass)', async () => {
    const res = await request(app.getHttpServer())
      .post(path(orgA))
      .set(...auth(masterAdmin))
      .send(payload)
      .expect(409);
    expectManualRetirementContract(res);
    expectZeroSideEffects();
  });

  it('G — no legacy top-level POST /vehicles create route (404)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/vehicles')
      .set(...auth(fleetWriterA))
      .send(payload)
      .expect(404);
    expectZeroSideEffects();
  });
});