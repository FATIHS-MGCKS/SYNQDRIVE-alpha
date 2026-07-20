import {
  DeviceConnectionEpisodeResolutionMethod,
  DeviceConnectionEpisodeResolutionOutboxEventType,
  DeviceConnectionEpisodeResolutionOutboxStatus,
  DeviceConnectionEpisodeStatus,
} from '@prisma/client';
import deviceConnectionEpisodeResolutionOutboxConfig from '@config/device-connection-episode-resolution-outbox.config';
import { ConnectivityAlertService } from '../connectivity-alert/connectivity-alert.service';
import { DeviceConnectionEpisodeResolutionOutboxProcessorService } from './device-connection-episode-resolution-outbox-processor.service';
import { DeviceConnectionEpisodeResolutionOutboxRepository } from './device-connection-episode-resolution-outbox.repository';
import { VehicleConnectivityRuntimeProjectionService } from './vehicle-connectivity-runtime-projection.service';

const config = deviceConnectionEpisodeResolutionOutboxConfig();

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'out-1',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    episodeId: 'ep-1',
    eventType: DeviceConnectionEpisodeResolutionOutboxEventType.CONNECTIVITY_RUNTIME_RECALCULATE,
    idempotencyKey: 'episode:ep-1:runtime:snap-1',
    payload: {
      vehicleId: 'veh-1',
      episodeId: 'ep-1',
      resolutionSnapshotId: 'snap-1',
      resolutionEvidenceAt: '2026-07-08T17:22:00.000Z',
    },
    status: DeviceConnectionEpisodeResolutionOutboxStatus.PENDING,
    processingAttempts: 0,
    lastErrorCode: null,
    lastErrorAt: null,
    nextRetryAt: null,
    deadLetteredAt: null,
    createdAt: new Date('2026-07-08T17:22:05.000Z'),
    updatedAt: new Date('2026-07-08T17:22:05.000Z'),
    processedAt: null,
    ...overrides,
  };
}

function resolvedEpisode() {
  return {
    id: 'ep-1',
    status: DeviceConnectionEpisodeStatus.RESOLVED,
    stateVersion: 2,
    resolutionMethod: DeviceConnectionEpisodeResolutionMethod.SNAPSHOT_PLUG_SIGNAL,
    resolutionEvidenceAt: new Date('2026-07-08T17:22:00.000Z'),
    deviceBindingId: 'bind-1',
    provider: 'DIMO',
    vehicle: { licensePlate: 'B-1', make: 'VW', model: 'Golf' },
  };
}

function buildProcessor(deps: {
  outboxRepo?: Partial<DeviceConnectionEpisodeResolutionOutboxRepository>;
  runtimeProjection?: Partial<VehicleConnectivityRuntimeProjectionService>;
  connectivityAlerts?: Partial<ConnectivityAlertService>;
}) {
  const outboxRepo = {
    findById: jest.fn(),
    claimForProcessing: jest.fn(),
    markCompleted: jest.fn(),
    markFailed: jest.fn(),
    markRetryableFailed: jest.fn(),
    markDeadLetter: jest.fn(),
    findClaimableBatch: jest.fn(),
    loadEpisodeForOutbox: jest.fn(),
    loadBindingState: jest.fn(),
    ...deps.outboxRepo,
  } as unknown as DeviceConnectionEpisodeResolutionOutboxRepository;

  const runtimeProjection = {
    projectForVehicle: jest.fn().mockResolvedValue({ overallState: 'TELEMETRY_ACTIVE' }),
    ...deps.runtimeProjection,
  } as unknown as VehicleConnectivityRuntimeProjectionService;

  const connectivityAlerts = {
    onEpisodeRecovered: jest.fn().mockResolvedValue(undefined),
    ...deps.connectivityAlerts,
  } as unknown as ConnectivityAlertService;

  const processor = new DeviceConnectionEpisodeResolutionOutboxProcessorService(
    config,
    outboxRepo,
    runtimeProjection,
    connectivityAlerts,
  );

  return { processor, outboxRepo, runtimeProjection, connectivityAlerts };
}

describe('DeviceConnectionEpisodeResolutionOutboxProcessorService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('processes CONNECTIVITY_RUNTIME_RECALCULATE after episode commit from committed state', async () => {
    const row = baseRow();
    const { processor, outboxRepo, runtimeProjection } = buildProcessor({
      outboxRepo: {
        findById: jest.fn().mockResolvedValue(row),
        claimForProcessing: jest.fn().mockResolvedValue({ ...row, processingAttempts: 1 }),
        loadEpisodeForOutbox: jest.fn().mockResolvedValue(resolvedEpisode()),
        loadBindingState: jest.fn().mockResolvedValue({ id: 'bind-1', isActive: true }),
      },
    });

    const outcome = await processor.processOutboxId('out-1');

    expect(outcome).toBe('completed');
    expect(runtimeProjection.projectForVehicle).toHaveBeenCalledWith('org-1', 'veh-1');
    expect(outboxRepo.markCompleted).toHaveBeenCalledWith('out-1');
  });

  it('processes snapshot recovery alert with resolutionEvidenceAt', async () => {
    const row = baseRow({
      eventType: DeviceConnectionEpisodeResolutionOutboxEventType.DEVICE_ALERT_RESOLVE_PREPARED,
      payload: {
        recoverySource: 'snapshot_obd',
        resolutionSnapshotId: 'snap-1',
      },
    });
    const evidenceAt = new Date('2026-07-08T17:22:00.000Z');
    const { processor, outboxRepo, connectivityAlerts } = buildProcessor({
      outboxRepo: {
        findById: jest.fn().mockResolvedValue(row),
        claimForProcessing: jest.fn().mockResolvedValue({ ...row, processingAttempts: 1 }),
        loadEpisodeForOutbox: jest.fn().mockResolvedValue({
          ...resolvedEpisode(),
          resolutionEvidenceAt: evidenceAt,
        }),
      },
    });

    await processor.processOutboxId('out-1');

    expect(connectivityAlerts.onEpisodeRecovered).toHaveBeenCalledWith(
      expect.objectContaining({
        recoverySource: 'snapshot_obd',
        observedAt: evidenceAt,
      }),
    );
  });

  it('processes telemetry recovery alert with resolutionEvidenceAt', async () => {
    const row = baseRow({
      eventType: DeviceConnectionEpisodeResolutionOutboxEventType.DEVICE_ALERT_RESOLVE_PREPARED,
      payload: { recoverySource: 'telemetry_resumed' },
    });
    const evidenceAt = new Date('2026-07-08T17:23:30.000Z');
    const { processor, connectivityAlerts } = buildProcessor({
      outboxRepo: {
        findById: jest.fn().mockResolvedValue(row),
        claimForProcessing: jest.fn().mockResolvedValue({ ...row, processingAttempts: 1 }),
        loadEpisodeForOutbox: jest.fn().mockResolvedValue({
          ...resolvedEpisode(),
          resolutionMethod: DeviceConnectionEpisodeResolutionMethod.TELEMETRY_RESUMED,
          resolutionEvidenceAt: evidenceAt,
        }),
      },
    });

    await processor.processOutboxId('out-1');

    expect(connectivityAlerts.onEpisodeRecovered).toHaveBeenCalledWith(
      expect.objectContaining({
        recoverySource: 'telemetry_resumed',
        observedAt: evidenceAt,
      }),
    );
  });

  it('schedules retry on processor failure with backoff', async () => {
    const row = baseRow();
    const { processor, outboxRepo } = buildProcessor({
      outboxRepo: {
        findById: jest.fn().mockResolvedValue(row),
        claimForProcessing: jest.fn().mockResolvedValue({ ...row, processingAttempts: 2 }),
        loadEpisodeForOutbox: jest.fn().mockResolvedValue(resolvedEpisode()),
        loadBindingState: jest.fn().mockResolvedValue(null),
      },
      runtimeProjection: {
        projectForVehicle: jest.fn().mockRejectedValue(new Error('projection failed')),
      },
    });

    const outcome = await processor.processOutboxId('out-1');

    expect(outcome).toBe('retry_scheduled');
    expect(outboxRepo.markRetryableFailed).toHaveBeenCalledWith(
      'out-1',
      expect.objectContaining({
        errorCode: 'Error',
        nextRetryAt: expect.any(Date),
      }),
    );
    expect(outboxRepo.markCompleted).not.toHaveBeenCalled();
  });

  it('dead-letters after max attempts', async () => {
    const row = baseRow({ processingAttempts: config.maxAttempts });
    const { processor, outboxRepo } = buildProcessor({
      outboxRepo: {
        findById: jest.fn().mockResolvedValue(row),
        claimForProcessing: jest
          .fn()
          .mockResolvedValue({ ...row, processingAttempts: config.maxAttempts + 1 }),
        loadEpisodeForOutbox: jest.fn().mockResolvedValue(resolvedEpisode()),
      },
      runtimeProjection: {
        projectForVehicle: jest.fn().mockRejectedValue(new Error('projection failed')),
      },
    });

    const outcome = await processor.processOutboxId('out-1');

    expect(outcome).toBe('dead_letter');
    expect(outboxRepo.markDeadLetter).toHaveBeenCalled();
    expect(outboxRepo.markCompleted).not.toHaveBeenCalled();
  });

  it('does not complete unknown event types', async () => {
    const row = baseRow({ eventType: 'UNKNOWN_TYPE' as DeviceConnectionEpisodeResolutionOutboxEventType });
    const { processor, outboxRepo } = buildProcessor({
      outboxRepo: {
        findById: jest.fn().mockResolvedValue(row),
        claimForProcessing: jest.fn().mockResolvedValue({ ...row, processingAttempts: 1 }),
      },
    });

    const outcome = await processor.processOutboxId('out-1');

    expect(outcome).toBe('permanently_failed');
    expect(outboxRepo.markFailed).toHaveBeenCalledWith(
      'out-1',
      expect.objectContaining({ errorCode: 'unknown_event_type' }),
    );
    expect(outboxRepo.markCompleted).not.toHaveBeenCalled();
  });

  it('skips duplicate processing when already completed', async () => {
    const row = baseRow({ status: DeviceConnectionEpisodeResolutionOutboxStatus.COMPLETED });
    const { processor, outboxRepo } = buildProcessor({
      outboxRepo: {
        findById: jest.fn().mockResolvedValue(row),
      },
    });

    const outcome = await processor.processOutboxId('out-1');

    expect(outcome).toBe('skipped');
    expect(outboxRepo.claimForProcessing).not.toHaveBeenCalled();
  });

  it('skips parallel worker when claim fails', async () => {
    const row = baseRow();
    const { processor, outboxRepo } = buildProcessor({
      outboxRepo: {
        findById: jest.fn().mockResolvedValue(row),
        claimForProcessing: jest.fn().mockResolvedValue(null),
      },
    });

    const outcome = await processor.processOutboxId('out-1');

    expect(outcome).toBe('skipped');
    expect(outboxRepo.markCompleted).not.toHaveBeenCalled();
  });

  it('processes pending batch for snapshot recovery path', async () => {
    const { processor, outboxRepo } = buildProcessor({
      outboxRepo: {
        findClaimableBatch: jest.fn().mockResolvedValue([{ id: 'out-1' }, { id: 'out-2' }]),
        findById: jest
          .fn()
          .mockResolvedValueOnce(baseRow({ id: 'out-1' }))
          .mockResolvedValueOnce(
            baseRow({
              id: 'out-2',
              eventType: DeviceConnectionEpisodeResolutionOutboxEventType.DEVICE_ALERT_RESOLVE_PREPARED,
            }),
          ),
        claimForProcessing: jest
          .fn()
          .mockResolvedValueOnce({ ...baseRow({ id: 'out-1' }), processingAttempts: 1 })
          .mockResolvedValueOnce({
            ...baseRow({
              id: 'out-2',
              eventType: DeviceConnectionEpisodeResolutionOutboxEventType.DEVICE_ALERT_RESOLVE_PREPARED,
            }),
            processingAttempts: 1,
          }),
        loadEpisodeForOutbox: jest.fn().mockResolvedValue(resolvedEpisode()),
        loadBindingState: jest.fn().mockResolvedValue({ id: 'bind-1' }),
      },
    });

    const completed = await processor.processPendingBatch(10);

    expect(completed).toBe(2);
    expect(outboxRepo.markCompleted).toHaveBeenCalledTimes(2);
  });
});
