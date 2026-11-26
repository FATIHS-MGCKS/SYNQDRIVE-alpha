import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { PrismaClient, UserPlatformRole } from '@prisma/client';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { PrismaService } from '@shared/database/prisma.service';
import { IamMfaStepUpService } from '@modules/iam-mfa/iam-mfa-step-up.service';
import { Reflector } from '@nestjs/core';
import { ProductsController } from '../products.controller';
import { ProductsService } from '../products.service';
import { MasterAdminAuditService } from '@modules/activity-log/master-admin-audit.service';
import { AuditService } from '@modules/activity-log/audit.service';
import { createMasterAdminAuthGuard } from '@shared/auth/testing/master-admin-mfa-http.integration.harness';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';

export type ProductCatalogV2HttpHarness = {
  app: INestApplication;
  prisma: PrismaClient;
  products: ProductsService;
  validateGrant: jest.Mock;
};

export async function createProductCatalogV2HttpHarness(
  prisma: PrismaClient,
): Promise<ProductCatalogV2HttpHarness> {
  const audit = new AuditService(prisma as never);
  const masterAdminAudit = new MasterAdminAuditService(audit);
  const products = new ProductsService(prisma as never, masterAdminAudit);
  const validateGrant = jest.fn(
    async (_userId: string, token: string, _action: typeof STEP_UP_ACTION.MASTER_ORGANIZATION) =>
      token === 'valid-step-up-token',
  );

  const moduleRef = await Test.createTestingModule({
    controllers: [ProductsController],
    providers: [
      Reflector,
      MasterAdminMfaGuard,
      { provide: ProductsService, useValue: products },
      { provide: PrismaService, useValue: prisma },
      { provide: IamMfaStepUpService, useValue: { validateGrant } },
      { provide: APP_GUARD, useValue: createMasterAdminAuthGuard() },
    ],
  })
    .overrideGuard(RolesGuard)
    .useValue({
      canActivate: (ctx: {
        switchToHttp: () => { getRequest: () => { user?: { platformRole?: UserPlatformRole } } };
      }) => ctx.switchToHttp().getRequest().user?.platformRole === UserPlatformRole.MASTER_ADMIN,
    })
    .compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();

  return {
    app,
    prisma,
    products,
    validateGrant,
  };
}

export const MASTER_BEARER = 'Bearer master-acceptance-v2';
export const MEMBER_BEARER = 'Bearer member-non-admin';
export const VALID_STEP_UP = 'valid-step-up-token';