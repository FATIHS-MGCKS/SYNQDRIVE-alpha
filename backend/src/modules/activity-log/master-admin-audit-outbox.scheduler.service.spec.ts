import { MasterAdminAuditOutboxSchedulerService } from './master-admin-audit-outbox.scheduler.service';
import { MasterAdminAuditOutboxProcessorService } from './master-admin-audit-outbox.processor';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';

describe('MasterAdminAuditOutboxSchedulerService', () => {
  const processor = { processDue: jest.fn().mockResolvedValue(undefined) };
  const leaderGuard = { shouldRun: jest.fn().mockReturnValue(true) };
  let scheduler: MasterAdminAuditOutboxSchedulerService;

  beforeEach(() => {
    jest.clearAllMocks();
    scheduler = new MasterAdminAuditOutboxSchedulerService(
      processor as unknown as MasterAdminAuditOutboxProcessorService,
      leaderGuard as unknown as SchedulerLeaderGuardService,
    );
  });

  it('invokes processor when scheduler leader permits', async () => {
    await scheduler.pollPendingOutbox();
    expect(leaderGuard.shouldRun).toHaveBeenCalledWith('master_admin_audit_outbox');
    expect(processor.processDue).toHaveBeenCalled();
  });

  it('skips when not leader', async () => {
    leaderGuard.shouldRun.mockReturnValue(false);
    await scheduler.pollPendingOutbox();
    expect(processor.processDue).not.toHaveBeenCalled();
  });
});