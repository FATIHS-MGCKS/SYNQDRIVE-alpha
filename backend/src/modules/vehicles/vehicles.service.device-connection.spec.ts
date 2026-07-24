import { NotFoundException } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { makeGpsPositionAccessStub } from './operational/vehicle-operational-state-v2.test-helpers';
import { mockConnectivityRuntime } from './connectivity/connectivity-runtime.test-fixture';

describe('VehiclesService.getDeviceConnection security (Prompt 16/36)', () => {
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const vehicleDetailAudit = { record: jest.fn() };
  const deviceConnectionQuery = {
    getVehicleSummary: jest.fn(),
  };
  const connectivityRuntimeProjection = {
    projectForVehicle: jest.fn(),
  };

  function makeService(prisma = {
    vehicle: { findFirst: jest.fn().mockResolvedValue({ id: 'veh-1' }) },
  }): VehiclesService {
    const stub = (): Record<string, unknown> => ({});
    return new (VehiclesService as unknown as { new (...args: unknown[]): VehiclesService })(
      prisma,
      stub(),
      stub(),
      stub(),
      stub(),
      stub(),
      stub(),
      stub(),
      stub(),
      makeGpsPositionAccessStub(),
      deviceConnectionQuery,
      connectivityRuntimeProjection,
      stub(),
      stub(),
      { cacheKey: () => 'k', invalidate: jest.fn() },
      audit,
      vehicleDetailAudit,
      undefined,
      undefined,
      undefined,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    deviceConnectionQuery.getVehicleSummary.mockResolvedValue({
      lteR1Capable: true,
      dimoLinked: true,
      lastDeviceUnpluggedAt: null,
      lastDevicePluggedInAt: null,
      currentDeviceConnectionStatus: 'plugged',
      openUnpluggedEpisode: false,
      openUnpluggedSince: null,
      openUnpluggedDurationMs: null,
      severity: 'info',
      rentalRelevant: false,
      activeBookingId: null,
      webhookConfigured: 'active',
      webhookConfiguration: {
        unplugTriggerState: {
          state: 'CONFIGURED',
          reasonCode: null,
          triggerId: 'secret-trigger',
          eventType: 'OBD_DEVICE_UNPLUGGED',
          active: true,
          callbackUrl: 'https://app.synqdrive.eu/webhooks/dimo?token=secret',
          failureCount: 0,
        },
        plugTriggerState: {
          state: 'NOT_APPLICABLE',
          reasonCode: null,
          triggerId: null,
          eventType: 'OBD_DEVICE_PLUGGED_IN',
          active: false,
          callbackUrl: null,
          failureCount: null,
        },
        recoveryPolicy: 'UNPLUG_WEBHOOK_PLUG_SNAPSHOT',
        lastSuccessfulDeliveryAt: null,
        lastDeliveryErrorAt: null,
        configSyncedAt: null,
        configSource: 'REGISTRY_CACHE',
      },
      lastWebhookReceivedAt: null,
      unpluggedCount24h: 0,
      unpluggedCount7d: 0,
      pluggedCount24h: 0,
      pluggedCount7d: 0,
      recentEvents: [],
      rawEvents: [{ secret: true }],
    });
    connectivityRuntimeProjection.projectForVehicle.mockResolvedValue(
      mockConnectivityRuntime({ vehicleId: 'veh-1', organizationId: 'org-1' }),
    );
  });

  it('denies foreign organization vehicles', async () => {
    const service = makeService({
      vehicle: { findFirst: jest.fn().mockResolvedValue(null) },
    });

    await expect(
      service.getDeviceConnection('org-1', 'veh-foreign', {
        actorUserId: 'user-1',
        organizationId: 'org-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(deviceConnectionQuery.getVehicleSummary).not.toHaveBeenCalled();
  });

  it('records audit log and sanitizes provider internals from response', async () => {
    const service = makeService();
    const result = await service.getDeviceConnection('org-1', 'veh-1', {
      actorUserId: 'user-1',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
    });

    expect(vehicleDetailAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        auditAction: 'DEVICE_CONNECTION_READ',
        actorUserId: 'user-1',
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        outcome: 'allowed',
      }),
    );
    expect(result.webhookConfiguration.unplugTriggerState).not.toHaveProperty('callbackUrl');
    expect(result.webhookConfiguration.unplugTriggerState).not.toHaveProperty('triggerId');
    expect(result.webhookConfiguration.unplugTriggerState.callbackConfigured).toBe(true);
    expect((result as { rawEvents?: unknown }).rawEvents).toBeUndefined();
  });
});
