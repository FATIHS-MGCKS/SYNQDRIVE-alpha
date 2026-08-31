import { ReferenceCaptureRetentionService } from './reference-capture-retention.service';

describe('ReferenceCaptureRetentionService (RP-045)', () => {
  const config = {
    getRetentionDays: () => 180,
    getBatchSize: () => 250,
    getMaxPendingObservations: () => 5000,
    getPostgresStorageMultiplier: () => 2.5,
    isRetentionSchedulerEnabled: () => false,
  };
  const repo = {
    deleteOlderThan: jest.fn().mockResolvedValue({ count: 42 }),
  };
  const service = new ReferenceCaptureRetentionService(config as never, repo as never);

  it('documents retention policy with corrected logical volume arithmetic', () => {
    const policy = service.getRetentionPolicy(80);
    expect(policy.retentionDays).toBe(180);
    expect(policy.estimatedLogicalBytesPerHourBroadCapture).toBe(147_456_000);
    expect(policy.estimatedPostgresBytesPerHourBroadCapture).toBe(368_640_000);
    expect(policy.estimatedLogicalBytesPerObservation).toBe(512);
    expect(policy.estimatedPostgresBytesPerObservation).toBe(1280);
    expect(policy.justification).toContain('180');
    expect(policy.retentionPurgeMechanism).toContain('REFERENCE_CAPTURE_RETENTION_SCHEDULER_ENABLED');
    expect(policy.retentionIndexStrategy).toContain('created_at');
  });

  it('purges observations older than retention cutoff', async () => {
    const now = new Date('2026-08-31T00:00:00.000Z');
    const result = await service.purgeExpiredObservations(now);
    expect(result.deletedCount).toBe(42);
    expect(repo.deleteOlderThan).toHaveBeenCalled();
  });

  it('provides long-session stress estimates with logical and Postgres footprints (RP-010)', () => {
    const estimate = service.getStressEstimate(80);
    expect(estimate.observationsPerHour).toBe(288_000);
    expect(estimate.observationsPerMinute).toBe(4800);
    expect(estimate.estimatedLogicalBytesPerHour).toBe(147_456_000);
    expect(estimate.estimatedPostgresBytesPerHour).toBe(368_640_000);
    expect(estimate.batchSize).toBe(250);
    expect(estimate.backpressureStrategy).toContain('maxPendingObservations');
  });
});
