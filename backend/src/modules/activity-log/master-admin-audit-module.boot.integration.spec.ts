import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { PrismaModule } from '@shared/database/prisma.module';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { MasterAdminAuditDeliveryService } from './master-admin-audit-delivery.service';
import { MasterAdminAuditOutboxProcessorService } from './master-admin-audit-outbox.processor';
import { MasterAdminAuditOutboxRepository } from './master-admin-audit-outbox.repository';
import { MasterAdminAuditOutboxSchedulerService } from './master-admin-audit-outbox.scheduler.service';

describe('Master admin audit — runtime module registration', () => {
  it('ActivityLogModule registers the platform audit scheduler provider', () => {
    const source = readFileSync(join(__dirname, 'activity-log.module.ts'), 'utf8');
    expect(source).toContain('MasterAdminAuditOutboxSchedulerService');
  });

  it('resolves scheduler with processor and leader guard', async () => {
    const pollSpy = jest.fn().mockResolvedValue(undefined);
    const processor = { processDue: pollSpy };
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule],
      providers: [
        MasterAdminAuditOutboxRepository,
        { provide: MasterAdminAuditOutboxProcessorService, useValue: processor },
        MasterAdminAuditDeliveryService,
        MasterAdminAuditOutboxSchedulerService,
        {
          provide: SchedulerLeaderGuardService,
          useValue: { shouldRun: () => true },
        },
      ],
    })
      .overrideProvider(MasterAdminAuditOutboxProcessorService)
      .useValue(processor)
      .compile();

    expect(moduleRef.get(MasterAdminAuditDeliveryService)).toBeDefined();
    expect(moduleRef.get(MasterAdminAuditOutboxRepository)).toBeDefined();
    await moduleRef.get(MasterAdminAuditOutboxSchedulerService).pollPendingOutbox();
    expect(pollSpy).toHaveBeenCalled();
  });
});