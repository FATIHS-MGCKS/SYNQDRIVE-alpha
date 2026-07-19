import { DeviceConnectionEpisodeStatus, DimoDeviceConnectionEventType } from '@prisma/client';
import { loadConnectivityRecoveryConfig } from '@config/connectivity-recovery.config';
import { DeviceConnectionEpisodeReconciliationApplyService } from '../device-connection-episode-reconciliation/device-connection-episode-reconciliation-apply.service';
import { DeviceConnectionEpisodeResolutionOutboxProcessorService } from '../device-connection-episode-resolution/device-connection-episode-resolution-outbox-processor.service';
import { DeviceConnectionEpisodeResolutionService } from '../device-connection-episode-resolution/device-connection-episode-resolution.service';
import { DeviceConnectionWebhookService } from '../device-connection-webhook.service';
import { ConnectivityRecoveryPolicyService } from './connectivity-recovery.policy';

describe('connectivity recovery policy', () => {
  it('defaults episode recovery on and reconciliation apply off', () => {
    const config = loadConnectivityRecoveryConfig({
      CONNECTIVITY_EPISODE_RECOVERY_ENABLED: undefined,
      CONNECTIVITY_RECONCILIATION_APPLY_ENABLED: undefined,
    } as NodeJS.ProcessEnv);
    expect(config.episodeRecoveryEnabled).toBe(true);
    expect(config.reconciliationApplyEnabled).toBe(false);
  });

  it('parses explicit env toggles', () => {
    const config = loadConnectivityRecoveryConfig({
      CONNECTIVITY_EPISODE_RECOVERY_ENABLED: 'false',
      CONNECTIVITY_RECONCILIATION_APPLY_ENABLED: '1',
    } as NodeJS.ProcessEnv);
    expect(config.episodeRecoveryEnabled).toBe(false);
    expect(config.reconciliationApplyEnabled).toBe(true);
  });

  it('blocks reconciliation apply when flag is off', () => {
    const policy = new ConnectivityRecoveryPolicyService({
      episodeRecoveryEnabled: true,
      reconciliationApplyEnabled: false,
    });
    expect(() => policy.assertReconciliationApplyEnabled()).toThrow(
      /CONNECTIVITY_RECONCILIATION_APPLY_ENABLED/,
    );
  });
});

describe('connectivity recovery kill switch behavior', () => {
  it('still persists webhook events when episode recovery is disabled', async () => {
    const prisma = {
      dimoDeviceConnectionEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({
          id: 'evt-1',
          createdAt: new Date('2026-07-10T10:00:00.000Z'),
          updatedAt: new Date('2026-07-10T10:00:00.000Z'),
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const episodeService = {
      openFromUnplugEvent: jest.fn(),
      resolveFromExplicitPlugEvent: jest.fn(),
    };
    const recoveryPolicy = {
      isEpisodeRecoveryEnabled: jest.fn().mockReturnValue(false),
    };
    const service = new DeviceConnectionWebhookService(
      prisma as never,
      episodeService as never,
      recoveryPolicy as never,
    );

    const result = await service.processValidatedWebhookEvent({
      vehicle: { id: 'veh-1', organizationId: 'org-1' },
      tokenId: 42,
      pluggedIn: false,
      observedAt: new Date('2026-07-10T10:00:00.000Z'),
      rawPayload: { test: true },
    });

    expect(result.outcome).toBe('created');
    expect(prisma.dimoDeviceConnectionEvent.upsert).toHaveBeenCalled();
    expect(episodeService.openFromUnplugEvent).not.toHaveBeenCalled();
  });

  it('rejects snapshot resolution when episode recovery is disabled', async () => {
    const recoveryPolicy = {
      isEpisodeRecoveryEnabled: jest.fn().mockReturnValue(false),
    };
    const service = new DeviceConnectionEpisodeResolutionService(
      { $transaction: jest.fn() } as never,
      { enqueuePreparedEvents: jest.fn() } as never,
      undefined,
      recoveryPolicy as never,
    );

    const result = await service.tryResolveFromSnapshotPlugSignal({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      provider: 'DIMO',
      hardwareType: 'LTE_R1',
      obdIsPluggedIn: true,
      providerObservedAt: new Date('2026-07-08T17:22:00.000Z'),
      receivedAt: new Date('2026-07-08T17:22:05.000Z'),
      snapshotSource: 'dimo',
      providerBindingId: 'bind-1',
      providerDeviceIdHash: null,
      snapshotReferenceId: 'snap-1',
      sourceSubtype: null,
    });

    expect(result.outcome).toBe('rejected');
    if (result.outcome === 'rejected') {
      expect(result.reason).toBe('recovery_disabled');
    }
  });

  it('skips outbox processing when episode recovery is disabled', async () => {
    const outboxRepo = {
      findById: jest.fn(),
      claimForProcessing: jest.fn(),
      markCompleted: jest.fn(),
    };
    const recoveryPolicy = {
      isEpisodeRecoveryEnabled: jest.fn().mockReturnValue(false),
    };
    const processor = new DeviceConnectionEpisodeResolutionOutboxProcessorService(
      { pollBatchSize: 10, maxAttempts: 5, baseBackoffMs: 1000, processingStaleMs: 1000 },
      outboxRepo as never,
      {} as never,
      {} as never,
      recoveryPolicy as never,
    );

    const outcome = await processor.processOutboxId('out-1');
    expect(outcome).toBe('skipped');
    expect(outboxRepo.claimForProcessing).not.toHaveBeenCalled();
  });

  it('rejects reconciliation apply when apply flag is disabled', async () => {
    const recoveryPolicy = {
      isEpisodeRecoveryEnabled: jest.fn().mockReturnValue(true),
      isReconciliationApplyEnabled: jest.fn().mockReturnValue(false),
      assertReconciliationApplyEnabled: jest.fn().mockImplementation(() => {
        throw new Error('disabled');
      }),
    };
    const service = new DeviceConnectionEpisodeReconciliationApplyService(
      {} as never,
      {} as never,
      {} as never,
      undefined,
      recoveryPolicy as never,
    );

    await expect(
      service.runApply({
        organizationId: 'org-1',
        evidencePackages: [],
        apply: true,
        batchSize: 1,
        operator: 'ops',
        reason: 'test',
      }),
    ).rejects.toThrow('disabled');
  });

  it('allows resolution again when episode recovery is re-enabled', async () => {
    let enabled = false;
    const recoveryPolicy = {
      isEpisodeRecoveryEnabled: jest.fn(() => enabled),
    };
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = new DeviceConnectionEpisodeResolutionService(
      { deviceConnectionEpisode: { findFirst } } as never,
      { enqueuePreparedEvents: jest.fn() } as never,
      undefined,
      recoveryPolicy as never,
    );

    const input = {
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      provider: 'DIMO',
      hardwareType: 'LTE_R1',
      obdIsPluggedIn: true,
      providerObservedAt: new Date('2026-07-08T17:22:00.000Z'),
      receivedAt: new Date('2026-07-08T17:22:05.000Z'),
      snapshotSource: 'dimo',
      providerBindingId: 'bind-1',
      providerDeviceIdHash: null,
      snapshotReferenceId: 'snap-1',
      sourceSubtype: null,
    };

    const blocked = await service.tryResolveFromSnapshotPlugSignal(input);
    expect(blocked).toEqual({ outcome: 'rejected', reason: 'recovery_disabled' });
    expect(findFirst).not.toHaveBeenCalled();

    enabled = true;
    const allowed = await service.tryResolveFromSnapshotPlugSignal({
      ...input,
      snapshotReferenceId: 'snap-2',
    });
    expect(allowed.outcome).toBe('no_open_episode');
    expect(findFirst).toHaveBeenCalled();
  });
});
