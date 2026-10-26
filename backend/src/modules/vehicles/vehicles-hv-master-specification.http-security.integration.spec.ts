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
import { IamMfaStepUpService } from '@modules/iam-mfa/iam-mfa-step-up.service';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PrismaService } from '@shared/database/prisma.service';
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

describe('VehiclesController — HV master specification HTTP security', () => {
  let app: INestApplication;
  let vehiclesService: {
    upsertHvMasterSpecificationForAdmin: jest.Mock;
  };

  const vehicleId = 'veh-hv-spec-1';
  const route = `/api/v1/admin/vehicles/${vehicleId}/hv-master-specification`;

  beforeAll(async () => {
    process.env.IAM_MFA_MASTER_ADMIN_ENABLED = 'false';

    vehiclesService = {
      upsertHvMasterSpecificationForAdmin: jest.fn().mockResolvedValue({
        version: 1,
        provenance: 'ESTIMATED',
        chemistry: 'LFP',
      }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [VehiclesController],
      providers: [
        RolesGuard,
        MasterAdminMfaGuard,
        { provide: VehiclesService, useValue: vehiclesService },
        { provide: VehiclesOperationalService, useValue: {} },
        { provide: VehicleCleaningTaskService, useValue: {} },
        { provide: VehicleExteriorImagesService, useValue: {} },
        {
          provide: PrismaService,
          useValue: { userMfaFactor: { findFirst: jest.fn().mockResolvedValue(null) } },
        },
        {
          provide: IamMfaStepUpService,
          useValue: { validateGrant: jest.fn().mockResolvedValue(false) },
        },
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
    await app?.close();
  });

  beforeEach(() => {
    vehiclesService.upsertHvMasterSpecificationForAdmin.mockClear();
  });

  it('denies organization admin for PATCH hv-master-specification', async () => {
    const res = await request(app.getHttpServer())
      .patch(route)
      .set(...auth({ id: 'u-1', platformRole: UserPlatformRole.USER }))
      .send({ chemistry: 'LFP' });
    expect(res.status).toBe(403);
    expect(vehiclesService.upsertHvMasterSpecificationForAdmin).not.toHaveBeenCalled();
  });

  it('allows MASTER_ADMIN for PATCH hv-master-specification', async () => {
    const res = await request(app.getHttpServer())
      .patch(route)
      .set(...auth({ id: 'ma-1', platformRole: UserPlatformRole.MASTER_ADMIN }))
      .send({ chemistry: 'LFP', provenance: 'ESTIMATED' });
    expect(res.status).toBe(200);
    expect(vehiclesService.upsertHvMasterSpecificationForAdmin).toHaveBeenCalledWith(
      vehicleId,
      expect.objectContaining({ chemistry: 'LFP' }),
    );
  });
});
