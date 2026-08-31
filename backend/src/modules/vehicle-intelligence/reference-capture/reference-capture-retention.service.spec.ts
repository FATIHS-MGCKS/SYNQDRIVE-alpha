import { ReferenceCaptureRetentionService } from './reference-capture-retention.service';

describe('ReferenceCaptureRetentionService (RP-045)', () => {
  const config = {
    getRetentionDays: () => 180,
    getBatchSize: () => 250,
    getMaxPendingObservations: () => 5000,
  };
  const repo = {
    deleteOlderThan: jest.fn().mockResolvedValue({ count: 42 }),
  };
  const service = new ReferenceCaptureRetentionService(config as never, repo as never);

  it('documents retention policy with volume justification', () => {
    const policy = service.getRetentionPolicy(80);
    expect(policy.retentionDays).toBe(180);
    expect(policy.estimatedBytesPerHourBroadCapture).toBeGreaterThan(0);
    expect(policy.justification).toContain('180');
  });

  it('purges observations older than retention cutoff', async () => {
    const now = new Date('2026-08-31T00:00:00.000Z');
    const result = await service.purgeExpiredObservations(now);
    expect(result.deletedCount).toBe(42);
    expect(repo.deleteOlderThan).toHaveBeenCalled();
  });

  it('provides long-session stress estimates (RP-010)', () => {
    const estimate = service.getStressEstimate(80);
    expect(estimate.observationsPerHour).toBeGreaterThan(estimate.observationsPerMinute);
    expect(estimate.batchSize).toBe(250);
    expect(estimate.backpressureStrategy).toContain('maxPendingObservations');
  });
});
