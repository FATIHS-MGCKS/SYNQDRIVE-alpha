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
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { OrganizationsOperationalService } from './organizations-operational.service';
import { PaymentsAccessService } from '@modules/payments/payments-access.service';
import {
  ORGANIZATION_HARD_DELETE_DISABLED_CODE,
  ORGANIZATION_OFFBOARDING_ACTION,
} from './organization-delete-safety.errors';
import { PrismaService } from '@shared/database/prisma.service';
import { AuditService } from '@modules/activity-log/audit.service';
import { OrganizationRoleService } from '@modules/users/organization-role.service';
import { VehiclesService } from '@modules/vehicles/vehicles.service';
import { ModuleRef } from '@nestjs/core';

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

describe('Organizations DELETE — P1 hard-delete safety (HTTP)', () => {
  let app: INestApplication;
  const prismaDelete = jest.fn();
  const orgId = 'org-a';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OrganizationsController],
      providers: [
        OrganizationsService,
        {
          provide: PrismaService,
          useValue: {
            organization: { delete: prismaDelete, findUnique: jest.fn() },
          },
        },
        { provide: OrganizationsOperationalService, useValue: {} },
        { provide: PaymentsAccessService, useValue: {} },
        { provide: AuditService, useValue: { record: jest.fn() } },
        {
          provide: OrganizationRoleService,
          useValue: {
            ensureDefaultRoles: jest.fn().mockResolvedValue(undefined),
            assertOrganizationSystemRolesProvisioned: jest.fn().mockResolvedValue(undefined),
          },
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
      .overrideProvider(APP_GUARD)
      .useClass(TestAuthGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use((req: { headers: Record<string, string | undefined>; user?: unknown }, _res: unknown, next: () => void) => {
      const raw = req.headers['x-test-user'];
      if (raw) {
        try {
          req.user = JSON.parse(raw);
        } catch {
          /* ignore */
        }
      }
      next();
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    prismaDelete.mockClear();
  });

  it('MASTER_ADMIN DELETE is denied with structured 409', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/admin/organizations/${orgId}`)
      .set(...auth({ id: 'ma-1', platformRole: UserPlatformRole.MASTER_ADMIN }))
      .send({ reason: 'test offboard' });

    expect(res.status).toBe(409);
    const payload = conflictPayload(res.body as Record<string, unknown>);
    expect(payload.code).toBe(ORGANIZATION_HARD_DELETE_DISABLED_CODE);
    expect(payload.action).toBe(ORGANIZATION_OFFBOARDING_ACTION);
    expect(prismaDelete).not.toHaveBeenCalled();
  });

  it('tenant user DELETE is denied before service layer (403)', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/admin/organizations/${orgId}`)
      .set(...auth({ id: 'u-1', platformRole: null, organizationId: orgId }))
      .send({ reason: 'attempt' });

    expect(res.status).toBe(403);
    expect(prismaDelete).not.toHaveBeenCalled();
  });
});