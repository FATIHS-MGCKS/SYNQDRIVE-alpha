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

describe('Organizations admin mutation hardening (HTTP)', () => {
  let app: INestApplication;
  const orgId = 'org-a';
  const prisma = {
    organization: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    organizationRole: {
      count: jest.fn().mockResolvedValue(10),
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OrganizationsController],
      providers: [
        OrganizationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: OrganizationsOperationalService, useValue: {} },
        { provide: PaymentsAccessService, useValue: { setPaymentsEnabled: jest.fn() } },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: OrganizationRoleService, useValue: { ensureDefaultRoles: jest.fn() } },
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
      (req: { headers: Record<string, string | undefined>; user?: unknown }, _res: unknown, next: () => void) => {
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
    prisma.organization.create.mockResolvedValue({
      id: orgId,
      companyName: 'Test GmbH',
      status: OrganizationStatus.PENDING,
    });
    prisma.organization.update.mockResolvedValue({
      id: orgId,
      companyName: 'Updated',
      city: 'Berlin',
    });
  });

  const master = { id: 'ma-1', platformRole: UserPlatformRole.MASTER_ADMIN };

  const wizardPayload = {
    companyName: 'Neue Firma GmbH',
    shortCode: 'neufirma',
    businessType: BusinessType.RENTAL,
    email: 'contact@neue-firma.test',
    city: 'München',
    country: 'Deutschland',
    status: OrganizationStatus.PENDING,
  };

  it('POST create — wizard-compatible payload succeeds', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/organizations')
      .set(...auth(master))
      .send(wizardPayload);

    expect(res.status).toBe(201);
    expect(prisma.organization.create).toHaveBeenCalledTimes(1);
    const createArg = prisma.organization.create.mock.calls[0][0].data;
    expect(createArg.companyName).toBe(wizardPayload.companyName);
    expect(createArg.status).toBe(OrganizationStatus.PENDING);
  });

  it('POST create — empty companyName rejected', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/organizations')
      .set(...auth(master))
      .send({ companyName: '   ' });

    expect(res.status).toBe(400);
    expect(prisma.organization.create).not.toHaveBeenCalled();
  });

  it('PATCH profile — UI payload { companyName, city } succeeds', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/organizations/${orgId}`)
      .set(...auth(master))
      .send({ companyName: 'Updated GmbH', city: 'Berlin' });

    expect(res.status).toBe(200);
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: orgId },
      data: expect.objectContaining({ companyName: 'Updated GmbH', city: 'Berlin' }),
    });
  });

  it('PATCH — nextInvoiceNumber rejected (forbidNonWhitelisted)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/organizations/${orgId}`)
      .set(...auth(master))
      .send({ nextInvoiceNumber: 9999 });

    expect(res.status).toBe(400);
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });

  it('PATCH — paymentsEnabled bypass rejected', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/organizations/${orgId}`)
      .set(...auth(master))
      .send({ paymentsEnabled: true });

    expect(res.status).toBe(400);
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });

  it('PATCH — invalid status enum rejected', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/organizations/${orgId}`)
      .set(...auth(master))
      .send({ status: 'NOT_A_REAL_STATUS' });

    expect(res.status).toBe(400);
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });

  it('PATCH — valid status SUSPENDED allowed', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/organizations/${orgId}`)
      .set(...auth(master))
      .send({ status: OrganizationStatus.SUSPENDED });

    expect(res.status).toBe(200);
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: orgId },
      data: { status: OrganizationStatus.SUSPENDED },
    });
  });

  it('PATCH — paymentTermsDays integer accepted', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/organizations/${orgId}`)
      .set(...auth(master))
      .send({ paymentTermsDays: 14 });

    expect(res.status).toBe(200);
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: orgId },
      data: { paymentTermsDays: 14 },
    });
  });

  it('PATCH — paymentTermsDays decimal rejected (400)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/organizations/${orgId}`)
      .set(...auth(master))
      .send({ paymentTermsDays: 14.5 });

    expect(res.status).toBe(400);
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });

  it('PATCH — legalDocumentFourEyesEnabled rejected (not a generic PATCH surface)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/organizations/${orgId}`)
      .set(...auth(master))
      .send({ legalDocumentFourEyesEnabled: true });

    expect(res.status).toBe(400);
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });

  it('tenant PATCH denied (403)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/organizations/${orgId}`)
      .set(...auth({ id: 'u-1', platformRole: null, organizationId: orgId }))
      .send({ companyName: 'Hijack' });

    expect(res.status).toBe(403);
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });
});