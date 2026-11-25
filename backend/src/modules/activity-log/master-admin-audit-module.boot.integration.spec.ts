import { Test } from '@nestjs/testing';
import { PrismaModule } from '@shared/database/prisma.module';
import { MasterAdminAuditDeliveryService } from './master-admin-audit-delivery.service';
import { MasterAdminAuditOutboxProcessorService } from './master-admin-audit-outbox.processor';
import { MasterAdminAuditOutboxRepository } from './master-admin-audit-outbox.repository';

describe('Master admin audit — Nest DI boot', () => {
  it('resolves platform outbox delivery stack', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule],
      providers: [
        MasterAdminAuditOutboxRepository,
        MasterAdminAuditOutboxProcessorService,
        MasterAdminAuditDeliveryService,
      ],
    }).compile();

    expect(moduleRef.get(MasterAdminAuditDeliveryService)).toBeDefined();
    expect(moduleRef.get(MasterAdminAuditOutboxProcessorService)).toBeDefined();
    expect(moduleRef.get(MasterAdminAuditOutboxRepository)).toBeDefined();
  });
});