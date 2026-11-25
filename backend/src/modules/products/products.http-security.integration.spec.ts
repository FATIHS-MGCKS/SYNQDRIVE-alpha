import { ConflictException } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  OrganizationProductVehicleAccessMode,
  ProductSlug,
  UserPlatformRole,
} from '@prisma/client';
import * as request from 'supertest';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { PrismaService } from '@shared/database/prisma.service';
import { IamMfaStepUpService } from '@modules/iam-mfa/iam-mfa-step-up.service';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

const ORG = '11111111-1111-1111-1111-111111111111';
const MASTER = 'master-admin-1';

describe('ProductsController — HTTP security (vehicle access admin)', () => {
  const products = {
    assignProductForMasterAdmin: jest.fn(),
    updateVehicleAccessMode: jest.fn(),
    updateProductMetadataForMasterAdmin: jest.fn(),
    findOrgProducts: jest.fn(),
    removeProduct: jest.fn(),
  };

  const authGuard = {
    canActivate: (ctx: { switchToHttp: () => { getRequest: () => Record<string, unknown> } }) => {
      const req = ctx.switchToHttp().getRequest() as {
        headers?: { authorization?: string };
        user?: { id: string; platformRole: UserPlatformRole };
      };
      if (String(req.headers?.authorization ?? '').startsWith('Bearer master-')) {
        req.user = { id: MASTER, platformRole: UserPlatformRole.MASTER_ADMIN };
        return true;
      }
      return false;
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    products.assignProductForMasterAdmin.mockResolvedValue({ id: 'op-1' });
  });

  it('allows assign without explicit vehicleAccessMode (Alpha default policy)', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [
        { provide: ProductsService, useValue: products },
        { provide: APP_GUARD, useValue: authGuard },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({
        canActivate: (ctx: {
          switchToHttp: () => { getRequest: () => { user?: { platformRole?: string } } };
        }) => ctx.switchToHttp().getRequest().user?.platformRole === UserPlatformRole.MASTER_ADMIN,
      })
      .overrideGuard(MasterAdminMfaGuard)
      .useValue({ canActivate: () => true })
      .compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer())
      .post('/admin/products/assign')
      .set('Authorization', 'Bearer master-x')
      .send({ orgId: ORG, productSlug: ProductSlug.RENTAL })
      .expect(201);

    expect(products.assignProductForMasterAdmin).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: ORG,
        productSlug: ProductSlug.RENTAL,
        vehicleAccessMode: undefined,
      }),
    );

    await app.close();
  });

  it('returns 401 without JWT on assign', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [
        { provide: ProductsService, useValue: products },
        { provide: APP_GUARD, useValue: authGuard },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => false })
      .overrideGuard(MasterAdminMfaGuard)
      .useValue({ canActivate: () => true })
      .compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer())
      .post('/admin/products/assign')
      .send({ orgId: ORG, productSlug: ProductSlug.RENTAL })
      .expect(403);

    await app.close();
  });

  it('propagates ConflictException from catalog metadata patch', async () => {
    products.updateProductMetadataForMasterAdmin.mockRejectedValue(
      new ConflictException('Product metadata changed concurrently'),
    );

    const moduleRef = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [
        { provide: ProductsService, useValue: products },
        { provide: APP_GUARD, useValue: authGuard },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({
        canActivate: (ctx: {
          switchToHttp: () => { getRequest: () => { user?: { platformRole?: string } } };
        }) => ctx.switchToHttp().getRequest().user?.platformRole === UserPlatformRole.MASTER_ADMIN,
      })
      .overrideGuard(MasterAdminMfaGuard)
      .useValue({ canActivate: () => true })
      .compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer())
      .patch(`/admin/products/${ProductSlug.RENTAL}`)
      .set('Authorization', 'Bearer master-x')
      .send({
        name: 'SYNQDRIVE Rental',
        description: 'Desc',
        ifCurrentName: 'Rental',
        ifCurrentDescription: null,
      })
      .expect(409);

    await app.close();
  });

  it('propagates ConflictException from vehicle-access-mode patch', async () => {
    products.updateVehicleAccessMode.mockRejectedValue(
      new ConflictException('Vehicle access mode expectation mismatch'),
    );

    const moduleRef = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [
        { provide: ProductsService, useValue: products },
        { provide: APP_GUARD, useValue: authGuard },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({
        canActivate: (ctx: {
          switchToHttp: () => { getRequest: () => { user?: { platformRole?: string } } };
        }) => ctx.switchToHttp().getRequest().user?.platformRole === UserPlatformRole.MASTER_ADMIN,
      })
      .overrideGuard(MasterAdminMfaGuard)
      .useValue({ canActivate: () => true })
      .compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer())
      .patch(`/admin/products/org/${ORG}/${ProductSlug.RENTAL}/vehicle-access-mode`)
      .set('Authorization', 'Bearer master-x')
      .send({
        vehicleAccessMode: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
        ifCurrentVehicleAccessMode: OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
      })
      .expect(409);

    await app.close();
  });

  it('real MasterAdminMfaGuard denies assign POST without step-up when enforced', async () => {
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      IAM_MFA_MASTER_ADMIN_ENABLED: 'true',
      IAM_MFA_STEP_UP_ENFORCED: 'true',
    };

    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(STEP_UP_ACTION.MASTER_ORGANIZATION) };
    const prisma = {
      userMfaFactor: { findFirst: jest.fn().mockResolvedValue({ id: 'mfa-1' }) },
    };
    const stepUp = { validateGrant: jest.fn().mockResolvedValue(false) };
    const guard = new MasterAdminMfaGuard(
      reflector as never,
      prisma as unknown as PrismaService,
      stepUp as unknown as IamMfaStepUpService,
    );

    const ctx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          user: { id: MASTER, platformRole: UserPlatformRole.MASTER_ADMIN },
          headers: {},
        }),
      }),
    };

    await expect(guard.canActivate(ctx as never)).rejects.toMatchObject({
      response: { code: 'STEP_UP_REQUIRED' },
    });

    process.env = originalEnv;
  });
});