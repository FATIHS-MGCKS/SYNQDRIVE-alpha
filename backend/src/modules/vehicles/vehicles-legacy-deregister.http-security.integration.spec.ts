import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { UserPlatformRole } from '@prisma/client';
import * as request from 'supertest';
import { VehicleCleaningTaskService } from '@modules/tasks/vehicle-cleaning-task.service';
import { MFA_ERROR } from '@modules/iam-mfa/iam-mfa.policy';
import { IamMfaStepUpService } from '@modules/iam-mfa/iam-mfa-step-up.service';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import {
  buildMfaClaims,
  buildPasswordOnlyClaims,
} from '@shared/auth/auth-session-claims.types';
import { PrismaService } from '@shared/database/prisma.service';
import {
  CANONICAL_VEHICLE_OFFBOARD_ROUTE,
  LEGACY_VEHICLE_DESTRUCTION_DISABLED_CODE,
} from './legacy-vehicle-destruction.errors';
import { VehicleExteriorImagesService } from './vehicle-exterior-images.service';
import { VehiclesController } from './vehicles.controller';
import { VehiclesOperationalService } from './vehicles-operational.service';
import { VehiclesService } from './vehicles.service';

/**
 * Real HTTP guard-pipeline integration: request → TestAuthGuard → RolesGuard
 * (class + route metadata) → MasterAdminMfaGuard → VehiclesController handler.
 * Downstream domain services are mocked; guards and decorators execute for real.
 */

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

function retirementPayload(body: Record<string, unknown>) {
  const nested = body.message;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }
  return body;
}

function expectLegacyRetirementContract(body: Record<string, unknown>) {
  const payload = retirementPayload(body);
  expect(payload).toMatchObject({
    code: LEGACY_VEHICLE_DESTRUCTION_DISABLED_CODE,
    action: 'USE_CANONICAL_OFFBOARD',
    canonicalRoute: CANONICAL_VEHICLE_OFFBOARD_ROUTE,
    requiredFields: ['reason', 'idempotencyKey'],
  });
}

function forbiddenCode(body: Record<string, unknown>, code: string) {
  if (body.code === code) return;
  const message = body.message;
  if (message && typeof message === 'object' && !Array.isArray(message)) {
    expect(message).toMatchObject({ code });
    return;
  }
  const text = String(message ?? '');
  const patterns: Record<string, RegExp> = {
    [MFA_ERROR.STEP_UP_REQUIRED]: /Fresh MFA step-up required/,
    [MFA_ERROR.STEP_UP_EXPIRED]: /expired or invalid/i,
    [MFA_ERROR.ENROLLMENT_REQUIRED]: /MFA enrollment is required/,
  };
  expect(text).toMatch(patterns[code] ?? new RegExp(code));
}

describe('VehiclesController — legacy deregister HTTP security integration', () => {
  let app: INestApplication;
  let vehiclesService: { deregister: jest.Mock };
  let stepUpValidate: jest.Mock;
  let prisma: {
    userMfaFactor: { findFirst: jest.Mock };
    vehicle: {
      delete: jest.Mock;
      deleteMany: jest.Mock;
      update: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
  };

  const existingVehicleId = 'veh-existing-1';
  const missingVehicleId = 'veh-does-not-exist';
  const foreignVehicleId = 'veh-foreign-99';
  const routeBase = '/api/v1/admin/vehicles';

  const originalEnv = process.env;

  beforeAll(async () => {
    process.env = {
      ...originalEnv,
      IAM_MFA_MASTER_ADMIN_ENABLED: 'true',
      IAM_MFA_STEP_UP_ENFORCED: 'true',
      IAM_MFA_PRIVILEGED_ENROLLMENT_REQUIRED: 'false',
    };

    vehiclesService = { deregister: jest.fn() };
    stepUpValidate = jest.fn().mockResolvedValue(false);
    prisma = {
      userMfaFactor: {
        findFirst: jest.fn().mockResolvedValue({ id: 'factor-1' }),
      },
      vehicle: {
        delete: jest.fn(),
        deleteMany: jest.fn(),
        update: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [VehiclesController],
      providers: [
        RolesGuard,
        MasterAdminMfaGuard,
        { provide: VehiclesService, useValue: vehiclesService },
        {
          provide: IamMfaStepUpService,
          useValue: { validateGrant: stepUpValidate },
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
    process.env.IAM_MFA_PRIVILEGED_ENROLLMENT_REQUIRED = 'false';
    prisma.userMfaFactor.findFirst.mockResolvedValue({ id: 'factor-1' });
    stepUpValidate.mockResolvedValue(false);
  });

  function postDeregister(
    vehicleId: string,
    user: Record<string, unknown> | null,
    extraHeaders: Record<string, string> = {},
  ) {
    const req = request(app.getHttpServer()).post(`${routeBase}/${vehicleId}/deregister`);
    if (user !== null) req.set(...auth(user));
    for (const [key, value] of Object.entries(extraHeaders)) {
      req.set(key, value);
    }
    return req;
  }

  const masterWithMfa = {
    id: 'ma-1',
    platformRole: UserPlatformRole.MASTER_ADMIN,
    sessionClaims: buildMfaClaims(),
  };

  it('1 — anonymous caller denied (401)', async () => {
    await postDeregister(existingVehicleId, null).expect(401);
    expect(vehiclesService.deregister).not.toHaveBeenCalled();
  });

  it('2 — tenant employee denied (403)', async () => {
    await postDeregister(existingVehicleId, {
      id: 'u-worker',
      platformRole: 'USER',
      membershipRole: 'WORKER',
      organizationId: 'org-1',
    }).expect(403);
    expect(vehiclesService.deregister).not.toHaveBeenCalled();
  });

  it('3 — organization admin denied (403)', async () => {
    await postDeregister(existingVehicleId, {
      id: 'u-org-admin',
      platformRole: 'USER',
      membershipRole: 'ORG_ADMIN',
      organizationId: 'org-1',
    }).expect(403);
    expect(vehiclesService.deregister).not.toHaveBeenCalled();
  });

  it('4 — MASTER_ADMIN without required MFA denied (403)', async () => {
    const res = await postDeregister(existingVehicleId, {
      id: 'ma-no-mfa',
      platformRole: UserPlatformRole.MASTER_ADMIN,
      sessionClaims: buildPasswordOnlyClaims(),
    }).expect(403);
    forbiddenCode(res.body, MFA_ERROR.STEP_UP_REQUIRED);
    expect(vehiclesService.deregister).not.toHaveBeenCalled();
  });

  it('5 — MASTER_ADMIN with invalid/expired step-up token denied (403)', async () => {
    const res = await postDeregister(
      existingVehicleId,
      {
        id: 'ma-bad-token',
        platformRole: UserPlatformRole.MASTER_ADMIN,
        sessionClaims: buildPasswordOnlyClaims(),
      },
      { 'x-step-up-token': 'expired-token' },
    ).expect(403);
    expect(stepUpValidate).toHaveBeenCalled();
    forbiddenCode(res.body, MFA_ERROR.STEP_UP_EXPIRED);
    expect(vehiclesService.deregister).not.toHaveBeenCalled();
  });

  it('6 — MFA enrollment-required policy respected (403)', async () => {
    process.env.IAM_MFA_PRIVILEGED_ENROLLMENT_REQUIRED = 'true';
    prisma.userMfaFactor.findFirst.mockResolvedValue(null);
    const res = await postDeregister(existingVehicleId, {
      id: 'ma-unenrolled',
      platformRole: UserPlatformRole.MASTER_ADMIN,
      sessionClaims: buildMfaClaims(),
    }).expect(403);
    forbiddenCode(res.body, MFA_ERROR.ENROLLMENT_REQUIRED);
    expect(vehiclesService.deregister).not.toHaveBeenCalled();
  });

  it('7 — authorized MASTER_ADMIN with valid MFA receives HTTP 409 retirement contract', async () => {
    const res = await postDeregister(existingVehicleId, masterWithMfa).expect(409);
    expectLegacyRetirementContract(res.body);
    expect(vehiclesService.deregister).not.toHaveBeenCalled();
    expect(prisma.vehicle.delete).not.toHaveBeenCalled();
    expect(prisma.vehicle.deleteMany).not.toHaveBeenCalled();
    expect(prisma.vehicle.update).not.toHaveBeenCalled();
    expect(prisma.vehicle.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('8 — existing, missing and foreign vehicle ids share identical authorized retirement contract', async () => {
    const bodies: Record<string, unknown>[] = [];
    for (const id of [existingVehicleId, missingVehicleId, foreignVehicleId]) {
      const res = await postDeregister(id, masterWithMfa).expect(409);
      bodies.push(retirementPayload(res.body));
    }
    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[1]).toEqual(bodies[2]);
    expect(vehiclesService.deregister).not.toHaveBeenCalled();
  });

  it('9–11 — authorized route returns 409 only (never 2xx) and performs zero destructive writes', async () => {
    const res = await postDeregister(existingVehicleId, masterWithMfa).expect(409);
    expect(res.status).toBe(409);
    expect(res.status < 200 || res.status >= 300).toBe(true);
    expectLegacyRetirementContract(res.body);
    expect(vehiclesService.deregister).not.toHaveBeenCalled();
    expect(prisma.vehicle.delete).not.toHaveBeenCalled();
    expect(prisma.vehicle.deleteMany).not.toHaveBeenCalled();
    expect(prisma.vehicle.update).not.toHaveBeenCalled();
  });
});
