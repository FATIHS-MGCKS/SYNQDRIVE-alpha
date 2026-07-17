import { DocumentIntakeActionRecoveryScheduler } from './document-intake-action-recovery.scheduler';
import { canEnqueueQueue } from '@shared/queue/queue-producer.util';

jest.mock('@shared/queue/queue-producer.util', () => ({
  canEnqueueQueue: jest.fn(() => true),
}));

describe('DocumentIntakeActionRecoveryScheduler', () => {
  const docConfig = {
    queueEnabled: true,
    actionRecoveryEnabled: true,
    staleApplyingThresholdMs: 600_000,
    actionRecoveryBatchSize: 5,
  };

  it('delegates to recovery service when enabled', async () => {
    const recoveryService = {
      recoverStuckApplyingCandidates: jest.fn().mockResolvedValue([
        { extractionId: 'ext-1', action: 'FINALIZE_APPLIED', dryRun: false, success: true, message: 'ok' },
      ]),
    };
    const scheduler = new DocumentIntakeActionRecoveryScheduler(
      recoveryService as any,
      docConfig as any,
    );

    await scheduler.recoverStaleActionApplies();

    expect(recoveryService.recoverStuckApplyingCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: false, limit: 5 }),
    );
  });

  it('skips when action recovery is disabled', async () => {
    const recoveryService = {
      recoverStuckApplyingCandidates: jest.fn(),
    };
    const scheduler = new DocumentIntakeActionRecoveryScheduler(recoveryService as any, {
      ...docConfig,
      actionRecoveryEnabled: false,
    } as any);

    await scheduler.recoverStaleActionApplies();
    expect(recoveryService.recoverStuckApplyingCandidates).not.toHaveBeenCalled();
  });
});
