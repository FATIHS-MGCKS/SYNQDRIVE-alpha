import { Test } from '@nestjs/testing';
import { MasterAdminAuditService } from '@modules/activity-log/master-admin-audit.service';
import { PrismaService } from '@shared/database/prisma.service';
import { PrismaModule } from '@shared/database/prisma.module';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { ProductsModule } from './products.module';
import { EntitlementsQueryService } from './entitlements/entitlements-query.service';
import { CoreEntitlementsReadController } from './entitlements/core-entitlements-read.controller';
import { ProductVehicleAccessService } from './product-vehicle-access/product-vehicle-access.service';
import { VehicleProductGrantService } from './vehicle-product-grants/vehicle-product-grant.service';

describe('ProductsModule — entitlements DI bootstrap', () => {
  it('resolves entitlements read controller and query service', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, ProductsModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        organization: { findUnique: jest.fn() },
        organizationProduct: { findMany: jest.fn(), findFirst: jest.fn() },
        vehicle: { findFirst: jest.fn() },
        vehicleProductGrant: {
          findUnique: jest.fn(),
          findFirst: jest.fn(),
          findMany: jest.fn(),
          create: jest.fn(),
          updateMany: jest.fn(),
        },
        $transaction: jest.fn(),
      })
      .overrideProvider(MasterAdminAuditService)
      .useValue({ record: jest.fn() })
      .overrideGuard(MasterAdminMfaGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    expect(moduleRef.get(EntitlementsQueryService)).toBeInstanceOf(EntitlementsQueryService);
    expect(moduleRef.get(CoreEntitlementsReadController)).toBeInstanceOf(CoreEntitlementsReadController);
    expect(moduleRef.get(ProductVehicleAccessService)).toBeInstanceOf(ProductVehicleAccessService);
    expect(moduleRef.get(VehicleProductGrantService)).toBeInstanceOf(VehicleProductGrantService);
  });
});