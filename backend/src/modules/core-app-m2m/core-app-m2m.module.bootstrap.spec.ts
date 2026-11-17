import { Test } from '@nestjs/testing';
import { CoreAppM2mModule } from './core-app-m2m.module';
import { CoreAppServiceRegistryService } from './core-app-service-registry.service';
import { PrismaService } from '@shared/database/prisma.service';

describe('CoreAppM2mModule — DI bootstrap', () => {
  it('resolves registry service without HTTP controllers', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CoreAppM2mModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ coreAppServiceClient: { findUnique: jest.fn() } })
      .compile();

    const registry = moduleRef.get(CoreAppServiceRegistryService);
    expect(registry).toBeInstanceOf(CoreAppServiceRegistryService);
    await moduleRef.close();
  });
});