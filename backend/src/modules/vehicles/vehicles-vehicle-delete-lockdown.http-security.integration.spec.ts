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
import { VehicleOwnershipGuard } from '@shared/auth/vehicle-ownership.guard';
import { PrismaService } from '@shared/database/prisma.service';
import {
  LEGACY_VEHICLE_DELETE_DISABLED_ACTION,
  LEGACY_VEHICLE_DESTRUCTION_DISABLED_CODE,
} from './legacy-vehicle-destruction.errors';
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
  'fleet-mgr|org-a': {
    role: 'WORKER',
    status: 'ACTIVE',
    permissions: { fleet: { read: true, write: true, manage: true } },
  },
  'reader|org-a': {
    role: 'WORKER',
    status: 'ACTIVE',
    permissions: { dashboard: { read: true, write: false, manage: false } },
  },
  'org-admin|org-a': { role: 'ORG_ADMIN', status: 'ACTIVE', permissions: {} },
  'inactive|org-a': {
    role: 'WORKER',
    status: 'INACTIVE',
    permissions: { fleet: { manage: true } },
  },
  'fleet-mgr|org-b': {
    role: 'WORKER',
    status: 'ACTIVE',
    permissions: { fleet: { manage: true } },
  },
};

const VEHICLES: Record<string, { id: string; organizationId: string }> = {
  'veh-owned': { id: 'veh-owned', organizationId: 'org-a' },
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
      findUnique: jest.fn(async () => ({ id: 'org-a' })),
    },
    vehicle: {
      findFirst: jest.fn(async (args: { where: { id?: string; organizationId?: string } }) => {
        const id = args.where.id;
        if (!id) return null;
        const row = VEHICLES[id];
        if (!row) return null;
        if (args.where.organizationId && row.organizationId !== args.where.organizationId) {
          return null;
        }
        return { id: row.id };
      }),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      update: jest.fn(),
    },
    userMfaFactor: { findFirst: jest.fn() },
  };
}

describe('VehiclesController — vehicle DELETE lockdown HTTP security integration', () => {
  let app: INestApplication;
  let vehiclesService: { delete: jest.Mock };
  let prisma: ReturnType<typeof makePrisma>;

  const orgA = 'org-a';
  const orgB = 'org-b';
  const ownedId = 'veh-owned';
  const foreignId = 'veh-foreign';
  const missingId = 'veh-missing';

  const originalEnv = process.env;

  beforeAll(async () => {
    process.env = {
      ...originalEnv,
      IAM_MFA_MASTER_ADMIN_ENABLED: 'true',
      IAM_MFA_STEP_UP_ENFORCED: 'true',
      IAM_MFA_PRIVILEGED_ENROLLMENT_REQUIRED: 'false',
    };

    prisma = makePrisma();
    vehiclesService = { delete: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [VehiclesController],
      providers: [
        Reflector,
        RolesGuard,
        OrgScopingGuard,
        PermissionsGuard,
        VehicleOwnershipGuard,
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

  const fleetManagerA = {
    id: 'fleet-mgr',
    platformRole: 'USER',
    organizationId: orgA,
  };
  const readerA = { id: 'reader', platformRole: 'USER', organizationId: orgA };
  const orgAdminA = { id: 'org-admin', platformRole: 'USER', organizationId: orgA };
  const inactiveA = { id: 'inactive', platformRole: 'USER', organizationId: orgA };
  const fleetManagerB = { id: 'fleet-mgr', platformRole: 'USER', organizationId: orgB };
  const masterAdmin = { id: 'ma-1', platformRole: UserPlatformRole.MASTER_ADMIN };

  function expectDeleteRetirement(res: request.Response) {
    const payload = conflictPayload(res.body as Record<string, unknown>);
    expect(payload).toMatchObject({
      code: LEGACY_VEHICLE_DESTRUCTION_DISABLED_CODE,
      action: LEGACY_VEHICLE_DELETE_DISABLED_ACTION,
    });
  }

  describe('org-scoped DELETE', () => {
    const path = (orgId: string, vehicleId: string) =>
      `/api/v1/organizations/${orgId}/vehicles/${vehicleId}`;

    it('A — anonymous denied (401)', async () => {
      await request(app.getHttpServer()).delete(path(orgA, ownedId)).expect(401);
      expect(vehiclesService.delete).not.toHaveBeenCalled();
    });

    it('B — tenant from wrong organization denied (403)', async () => {
      await request(app.getHttpServer())
        .delete(path(orgA, ownedId))
        .set(...auth(fleetManagerB))
        .expect(403);
      expect(vehiclesService.delete).not.toHaveBeenCalled();
    });

    it('C — inactive organization membership denied (403)', async () => {
      await request(app.getHttpServer())
        .delete(path(orgA, ownedId))
        .set(...auth(inactiveA))
        .expect(403);
      expect(vehiclesService.delete).not.toHaveBeenCalled();
    });

    it('D — tenant without fleet.manage denied (403)', async () => {
      await request(app.getHttpServer())
        .delete(path(orgA, ownedId))
        .set(...auth(readerA))
        .expect(403);
      expect(vehiclesService.delete).not.toHaveBeenCalled();
    });

    it('E — authorized fleet.manage receives 409 retirement', async () => {
      const res = await request(app.getHttpServer())
        .delete(path(orgA, ownedId))
        .set(...auth(fleetManagerA))
        .expect(409);
      expectDeleteRetirement(res);
      expect(vehiclesService.delete).not.toHaveBeenCalled();
      expect(prisma.vehicle.delete).not.toHaveBeenCalled();
    });

    it('F — ORG_ADMIN in own organization receives 409', async () => {
      const res = await request(app.getHttpServer())
        .delete(path(orgA, ownedId))
        .set(...auth(orgAdminA))
        .expect(409);
      expectDeleteRetirement(res);
      expect(vehiclesService.delete).not.toHaveBeenCalled();
    });

    it('G — MASTER_ADMIN receives 409', async () => {
      const res = await request(app.getHttpServer())
        .delete(path(orgA, ownedId))
        .set(...auth(masterAdmin))
        .expect(409);
      expectDeleteRetirement(res);
      expect(vehiclesService.delete).not.toHaveBeenCalled();
    });

    it('H — foreign vehicle id still 409 for authorized org caller (no existence leak)', async () => {
      const res = await request(app.getHttpServer())
        .delete(path(orgA, foreignId))
        .set(...auth(fleetManagerA))
        .expect(409);
      expectDeleteRetirement(res);
      expect(vehiclesService.delete).not.toHaveBeenCalled();
    });
  });

  describe('direct DELETE /vehicles/:vehicleId', () => {
    const path = (vehicleId: string) => `/api/v1/vehicles/${vehicleId}`;

    it('I — anonymous denied (401)', async () => {
      await request(app.getHttpServer()).delete(path(ownedId)).expect(401);
      expect(vehiclesService.delete).not.toHaveBeenCalled();
    });

    it('J — tenant without organization denied (404)', async () => {
      await request(app.getHttpServer())
        .delete(path(ownedId))
        .set(...auth({ id: 'no-org', platformRole: 'USER' }))
        .expect(404);
      expect(vehiclesService.delete).not.toHaveBeenCalled();
    });

    it('K — foreign vehicle not found (404)', async () => {
      await request(app.getHttpServer())
        .delete(path(foreignId))
        .set(...auth(fleetManagerA))
        .expect(404);
      expect(vehiclesService.delete).not.toHaveBeenCalled();
    });

    it('L — nonexistent tenant vehicle not found (404)', async () => {
      await request(app.getHttpServer())
        .delete(path(missingId))
        .set(...auth(fleetManagerA))
        .expect(404);
      expect(vehiclesService.delete).not.toHaveBeenCalled();
    });

    it('M — owned vehicle receives 409 after ownership guard', async () => {
      const res = await request(app.getHttpServer())
        .delete(path(ownedId))
        .set(...auth(fleetManagerA))
        .expect(409);
      expectDeleteRetirement(res);
      expect(vehiclesService.delete).not.toHaveBeenCalled();
      expect(prisma.vehicle.delete).not.toHaveBeenCalled();
    });

    it('N — MASTER_ADMIN receives 409 without requiring vehicle existence', async () => {
      const res = await request(app.getHttpServer())
        .delete(path(missingId))
        .set(...auth(masterAdmin))
        .expect(409);
      expectDeleteRetirement(res);
      expect(vehiclesService.delete).not.toHaveBeenCalled();
    });

    it('O — zero prisma vehicle.delete on authorized rejection', async () => {
      await request(app.getHttpServer())
        .delete(path(ownedId))
        .set(...auth(fleetManagerA))
        .expect(409);
      expect(prisma.vehicle.delete).not.toHaveBeenCalled();
      expect(prisma.vehicle.deleteMany).not.toHaveBeenCalled();
      expect(prisma.vehicle.update).not.toHaveBeenCalled();
    });
  });
});
