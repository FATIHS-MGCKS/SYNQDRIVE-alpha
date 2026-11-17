import { Test } from '@nestjs/testing';
import { CoreAppM2mModule } from './core-app-m2m.module';
import { CoreAppServiceRegistryService } from './core-app-service-registry.service';
import { CoreAppM2mTokenExchangeService } from './core-app-m2m-token-exchange.service';
import { PrismaService } from '@shared/database/prisma.service';

describe('CoreAppM2mModule — DI bootstrap', () => {
  it('resolves registry and token exchange services', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CoreAppM2mModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ coreAppServiceClient: { findUnique: jest.fn() } })
      .compile();

    const registry = moduleRef.get(CoreAppServiceRegistryService);
    expect(registry).toBeInstanceOf(CoreAppServiceRegistryService);
    expect(moduleRef.get(CoreAppM2mTokenExchangeService)).toBeInstanceOf(
      CoreAppM2mTokenExchangeService,
    );
    await moduleRef.close();
  });
});