/**
 * Connectivity alert integration regressions (Prompt 15).
 */
import { Test } from '@nestjs/testing';
import { NotificationStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { NotificationCoreService } from '@modules/notifications/notification-core.service';
import { NotificationRepository } from '@modules/notifications/notification.repository';
import { ConnectivityAlertService } from './connectivity-alert.service';
import { ConnectivityAlertType } from './connectivity-alert.types';
import {
  NOTIFICATION_EVENT_REGISTRY,
  resolveEventSlug,
} from '@modules/notifications/registry/notification-event-registry';

describe('ConnectivityAlertService', () => {
  const ingestCandidate = jest.fn();
  const resolveNotificationByFingerprint = jest.fn();
  const findLatestByFingerprint = jest.fn();

  let service: ConnectivityAlertService;

  beforeEach(async () => {
    jest.clearAllMocks();
    ingestCandidate.mockResolvedValue({ enabled: true, operation: 'created' });
    resolveNotificationByFingerprint.mockResolvedValue({ status: NotificationStatus.RESOLVED });
    findLatestByFingerprint.mockResolvedValue(null);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ConnectivityAlertService,
        {
          provide: NotificationCoreService,
          useValue: {
            isEnabled: () => true,
            ingestCandidate,
            resolveNotificationByFingerprint,
          },
        },
        {
          provide: NotificationRepository,
          useValue: { findLatestByFingerprint },
        },
        {
          provide: PrismaService,
          useValue: {
            deviceConnectionEpisodeResolutionOutbox: {
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              updateMany: jest.fn(),
              update: jest.fn(),
            },
            deviceConnectionEpisode: { findFirst: jest.fn() },
            vehicle: { findFirst: jest.fn() },
          },
        },
      ],
    }).compile();

    service = moduleRef.get(ConnectivityAlertService);
  });

  describe('registry wiring', () => {
    it('registers device and telemetry connectivity alert types', () => {
      const types = NOTIFICATION_EVENT_REGISTRY.map((d) => d.eventType);
      expect(resolveEventSlug('device-unplugged')).toBe('DEVICE_UNPLUGGED');
      expect(resolveEventSlug('device-reconnected')).toBe('DEVICE_RECONNECTED');
      expect(types).toContain('TELEMETRY_SOFT_OFFLINE');
      expect(types).toContain('DATA_COVERAGE_INSUFFICIENT');
    });
  });

  it('opens DEVICE_UNPLUGGED once on episode open', async () => {
    await service.onDeviceUnplugged({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      provider: 'DIMO',
      episodeId: 'ep-1',
      stateVersion: 1,
      deviceBindingId: 'bind-1',
      observedAt: new Date('2026-07-18T12:00:00.000Z'),
      label: 'VW Golf',
      licensePlate: 'B-XY 1',
    });

    expect(ingestCandidate).toHaveBeenCalledTimes(1);
    expect(ingestCandidate.mock.calls[0][0].eventType).toBe(
      ConnectivityAlertType.DEVICE_UNPLUGGED,
    );
    expect(ingestCandidate.mock.calls[0][0].conditionCode).toContain('episode:ep-1');
  });

  it('does not duplicate DEVICE_UNPLUGGED while episode stays open', async () => {
    findLatestByFingerprint.mockResolvedValue({
      status: NotificationStatus.OPEN,
    });

    await service.onDeviceUnplugged({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      provider: 'DIMO',
      episodeId: 'ep-1',
      stateVersion: 1,
      deviceBindingId: 'bind-1',
      observedAt: new Date('2026-07-18T12:00:00.000Z'),
      label: 'VW Golf',
      licensePlate: null,
    });

    expect(ingestCandidate).not.toHaveBeenCalled();
  });

  it('resolves unplug and emits reconnect on recovery', async () => {
    findLatestByFingerprint
      .mockResolvedValueOnce({ status: NotificationStatus.OPEN })
      .mockResolvedValueOnce(null);

    await service.onEpisodeRecovered({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      provider: 'DIMO',
      episodeId: 'ep-1',
      stateVersion: 2,
      deviceBindingId: 'bind-1',
      recoverySource: 'snapshot_obd',
      resolutionMethod: 'SNAPSHOT_PLUG_SIGNAL',
      observedAt: new Date('2026-07-18T13:00:00.000Z'),
      label: 'VW Golf',
      licensePlate: null,
    });

    expect(resolveNotificationByFingerprint).toHaveBeenCalled();
    expect(ingestCandidate).toHaveBeenCalledTimes(1);
    expect(ingestCandidate.mock.calls[0][0].eventType).toBe(
      ConnectivityAlertType.DEVICE_RECONNECTED,
    );
  });

  it('does not emit duplicate reconnect on replay', async () => {
    findLatestByFingerprint
      .mockResolvedValueOnce({ status: NotificationStatus.RESOLVED })
      .mockResolvedValueOnce({ status: NotificationStatus.OPEN });

    await service.onEpisodeRecovered({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      provider: 'DIMO',
      episodeId: 'ep-1',
      stateVersion: 2,
      deviceBindingId: 'bind-1',
      recoverySource: 'duplicate_recovery',
      resolutionMethod: 'SNAPSHOT_PLUG_SIGNAL',
      observedAt: new Date('2026-07-18T13:00:00.000Z'),
      label: 'VW Golf',
      licensePlate: null,
    });

    expect(ingestCandidate).not.toHaveBeenCalled();
  });

  it('syncRuntimeAlerts opens telemetry offline independently from device unplug', async () => {
    await service.syncRuntimeAlerts({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      provider: 'DIMO',
      label: 'VW Golf',
      licensePlate: null,
      telemetryFreshness: 'offline',
      providerLinkState: 'ACTIVE',
      hasProviderLink: true,
      coverageState: 'GOOD',
      observedAt: new Date('2026-07-18T12:00:00.000Z'),
    });

    const eventTypes = ingestCandidate.mock.calls.map((c) => c[0].eventType);
    expect(eventTypes).toContain('TELEMETRY_OFFLINE');
    expect(eventTypes).not.toContain(ConnectivityAlertType.DEVICE_UNPLUGGED);
  });

  it('syncRuntimeAlerts resolves telemetry offline on fresh signal', async () => {
    await service.syncRuntimeAlerts({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      provider: 'DIMO',
      label: 'VW Golf',
      licensePlate: null,
      telemetryFreshness: 'live',
      providerLinkState: 'ACTIVE',
      hasProviderLink: true,
      coverageState: 'GOOD',
      observedAt: new Date('2026-07-18T12:00:00.000Z'),
    });

    expect(resolveNotificationByFingerprint).toHaveBeenCalled();
  });

  it('syncRuntimeAlerts emits coverage hint without device unplug', async () => {
    await service.syncRuntimeAlerts({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      provider: 'DIMO',
      label: 'VW Golf',
      licensePlate: null,
      telemetryFreshness: 'live',
      providerLinkState: 'ACTIVE',
      hasProviderLink: true,
      coverageState: 'PARTIAL',
      observedAt: new Date('2026-07-18T12:00:00.000Z'),
    });

    const eventTypes = ingestCandidate.mock.calls.map((c) => c[0].eventType);
    expect(eventTypes).toContain('DATA_COVERAGE_INSUFFICIENT');
    expect(eventTypes).not.toContain(ConnectivityAlertType.DEVICE_UNPLUGGED);
  });

  it('syncRuntimeAlerts resolves authorization after reauthorization', async () => {
    await service.syncRuntimeAlerts({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      provider: 'DIMO',
      label: 'VW Golf',
      licensePlate: null,
      telemetryFreshness: 'live',
      providerLinkState: 'ACTIVE',
      hasProviderLink: true,
      coverageState: 'GOOD',
      observedAt: new Date('2026-07-18T12:00:00.000Z'),
    });

    expect(resolveNotificationByFingerprint).toHaveBeenCalled();
  });

  it('processes resolution outbox and retries on failure', async () => {
    const prisma = {
      deviceConnectionEpisodeResolutionOutbox: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'out-1',
          status: 'PENDING',
          eventType: 'DEVICE_ALERT_RESOLVE_PREPARED',
          organizationId: 'org-1',
          vehicleId: 'veh-1',
          episodeId: 'ep-1',
          payload: { recoverySource: 'telemetry_resumed' },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      deviceConnectionEpisode: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'ep-1',
          stateVersion: 2,
          resolutionMethod: 'TELEMETRY_RESUMED',
          deviceBindingId: 'bind-1',
          provider: 'DIMO',
          vehicle: { licensePlate: 'B-1', make: 'VW', model: 'Golf' },
        }),
      },
      vehicle: { findFirst: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ConnectivityAlertService,
        {
          provide: NotificationCoreService,
          useValue: {
            isEnabled: () => true,
            ingestCandidate,
            resolveNotificationByFingerprint,
          },
        },
        {
          provide: NotificationRepository,
          useValue: { findLatestByFingerprint },
        },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    const outboxService = moduleRef.get(ConnectivityAlertService);
    findLatestByFingerprint
      .mockResolvedValueOnce({ status: NotificationStatus.OPEN })
      .mockResolvedValueOnce(null);

    const result = await outboxService.processResolutionOutboxRow('out-1');
    expect(result).toBe('completed');
    expect(prisma.deviceConnectionEpisodeResolutionOutbox.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'out-1' },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
  });
});
