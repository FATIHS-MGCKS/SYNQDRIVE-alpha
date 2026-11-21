import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserPlatformRole, OrganizationStatus, BusinessType } from '@prisma/client';
import * as request from 'supertest';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { OrganizationsOperationalService } from './organizations-operational.service';
import { PaymentsAccessService } from '@modules/payments/payments-access.service';
import { PrismaService } from '@shared/database/prisma.service';
import { AuditService } from '@modules/activity-log/audit.service';
import { OrganizationRoleService } from '@modules/users/organization-role.service';
import { VehiclesService } from '@modules/vehicles/vehicles.service';
import { ModuleRef } from '@nestjs/core';
import { buildValidationFailedResponse } from '@shared/validation/validation-error.util';
import { DEFAULT_ORGANIZATION_ROLE_TEMPLATES } from '@modules/users/defaults/organization-role.defaults';

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

describe('Organizations — atomic onboarding HTTP security', () => {
  let app: INestApplication;

  const orgId = 'org-onboard-1';
  const adminId = 'admin-1';

  const makeTx = () => ({
    $executeRaw: jest.fn(),
    organization: {
      create: jest.fn().mockResolvedValue({
        id: orgId,
        companyName: 'Atomic GmbH',
        status: OrganizationStatus.PENDING,
      }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: adminId,
        email: 'admin@atomic.test',
        name: 'Atomic Admin',
      }),
    },
    organizationMembership: {
      create: jest.fn().mockResolvedValue({ id: 'm-1' }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  });

  const prisma = {
    organization: {
      create: jest.fn().mockResolvedValue({
        id: orgId,
        companyName: 'Solo',
        status: OrganizationStatus.PENDING,
      }),
      findUnique: jest.fn(),
    },
    organizationRole: {
      count: jest.fn().mockResolvedValue(DEFAULT_ORGANIZATION_ROLE_TEMPLATES.length),
    },
    $transaction: jest.fn(),
  };

  const ensureDefaultRoles = jest.fn().mockResolvedValue(undefined);
  const assertOrganizationSystemRolesProvisioned = jest.fn().mockResolvedValue(undefined);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OrganizationsController],
      providers: [
        OrganizationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: OrganizationsOperationalService, useValue: {} },
        { provide: PaymentsAccessService, useValue: { setPaymentsEnabled: jest.fn() } },
        { provide: AuditService, useValue: { record: jest.fn() } },
        {
          provide: OrganizationRoleService,
          useValue: { ensureDefaultRoles, assertOrganizationSystemRolesProvisioned },
        },
        { provide: VehiclesService, useValue: { aggregateDerivedFleetStatusCounts: jest.fn() } },
        { provide: ModuleRef, useValue: { get: jest.fn() } },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          const req = ctx.switchToHttp().getRequest();
          return req.user?.platformRole === UserPlatformRole.MASTER_ADMIN;
        },
      })
      .overrideGuard(MasterAdminMfaGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
        exceptionFactory: (errors) =>
          new BadRequestException(buildValidationFailedResponse(errors)),
      }),
    );
    app.use(
      (
        req: { headers: Record<string, string | undefined>; user?: unknown },
        _res: unknown,
        next: () => void,
      ) => {
        const raw = req.headers['x-test-user'];
        if (raw) {
          try {
            req.user = JSON.parse(raw);
          } catch {
            /* ignore */
          }
        }
        next();
      },
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.organizationRole.count.mockResolvedValue(DEFAULT_ORGANIZATION_ROLE_TEMPLATES.length);
    prisma.$transaction.mockImplementation(async (fn: (tx: ReturnType<typeof makeTx>) => unknown) =>
      fn(makeTx()),
    );
  });

  const master = { id: 'ma-1', platformRole: UserPlatformRole.MASTER_ADMIN };

  it('atomic wizard payload with initialAdmin uses one POST', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/organizations')
      .set(...auth(master))
      .send({
        companyName: 'Atomic GmbH',
        businessType: BusinessType.RENTAL,
        status: OrganizationStatus.PENDING,
        initialAdmin: {
          name: 'Atomic Admin',
          email: 'admin@atomic.test',
          password: 'Str0ng!Passw0rd1',
        },
      });

    expect(res.status).toBe(201);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.organization.create).not.toHaveBeenCalled();
    expect(ensureDefaultRoles).toHaveBeenCalledWith(orgId, adminId, expect.anything());
    expect(assertOrganizationSystemRolesProvisioned).toHaveBeenCalledWith(
      orgId,
      expect.anything(),
    );
    expect(res.body.initialAdmin?.email).toBe('admin@atomic.test');
  });

  it('org-only create still succeeds without initialAdmin', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/organizations')
      .set(...auth(master))
      .send({
        companyName: 'Solo GmbH',
        businessType: BusinessType.FLEET,
        status: OrganizationStatus.PENDING,
      });

    expect(res.status).toBe(201);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(ensureDefaultRoles).toHaveBeenCalledWith(orgId, undefined, expect.anything());
    expect(assertOrganizationSystemRolesProvisioned).toHaveBeenCalledWith(
      orgId,
      expect.anything(),
    );
  });

  it('tenant cannot POST create organization', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/organizations')
      .set(...auth({ id: 'u-1', platformRole: 'USER', organizationId: 'org-x' }))
      .send({ companyName: 'Blocked' });

    expect(res.status).toBe(403);
    expect(prisma.organization.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});