import { Test } from '@nestjs/testing';
import { PrismaService } from '@shared/database/prisma.service';
import { RedisService } from '@shared/redis/redis.service';
import { BatteryHvH4A3ReconciliationModule } from './battery-hv-h4-a3-reconciliation.module';
import { M3_3HvH4A3ReconciliationService } from './m3-3-hv-h4-a3-reconciliation.service';

describe('BatteryHvH4A3ReconciliationModule', () => {
  it('compiles with PrismaService and RedisService overrides', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [BatteryHvH4A3ReconciliationModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(RedisService)
      .useValue({ get: jest.fn(), set: jest.fn(), del: jest.fn() })
      .compile();

    expect(moduleRef.get(M3_3HvH4A3ReconciliationService)).toBeDefined();
  });
});
