import { Test } from '@nestjs/testing';
import { PrismaService } from '@shared/database/prisma.service';
import { PrismaModule } from '@shared/database/prisma.module';
import { ProductsModule } from './products.module';
import { EntitlementsQueryService } from './entitlements/entitlements-query.service';
import { CoreEntitlementsReadController } from './entitlements/core-entitlements-read.controller';

describe('ProductsModule — entitlements DI bootstrap', () => {
  it('resolves entitlements read controller and query service', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, ProductsModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        organization: { findUnique: jest.fn() },
        organizationProduct: { findMany: jest.fn(), findFirst: jest.fn() },
      })
      .compile();

    expect(moduleRef.get(EntitlementsQueryService)).toBeInstanceOf(EntitlementsQueryService);
    expect(moduleRef.get(CoreEntitlementsReadController)).toBeInstanceOf(CoreEntitlementsReadController);
  });
});