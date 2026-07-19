/**
 * Consumer migration regressions — canonical runtime state across surfaces.
 */
import {
  assembleVehicleConnectivityRuntimeState,
  type ConnectivityRuntimeVehicleRow,
} from './vehicle-connectivity-runtime-batch.assembler';
import {
  buildFleetConnectivityRuntimeForInput,
  mapFleetConnectivityVehicleWithRuntime,
} from '../fleet-connectivity.util';
import {
  mapOverallStateToLegacyConnectionStatus,
  projectLegacyFleetConnectivityFields,
} from './vehicle-connectivity-runtime-legacy.projection';
import { mockWebhookConfiguration } from '@modules/dimo/device-connection-webhook-configuration/device-connection-webhook-configuration.test-helpers';
import { DeviceConnectionEpisodeStatus } from '@prisma/client';

const NOW = new Date('2026-07-18T12:00:00.000Z').getTime();

function minutesAgo(m: number): Date {
  return new Date(NOW - m * 60_000);
}

function hoursAgo(h: number): Date {
  return new Date(NOW - h * 3_600_000);
}

function baseRow(
  overrides: Partial<ConnectivityRuntimeVehicleRow> = {},
): ConnectivityRuntimeVehicleRow {
  return {
    id: 'v-consumer-1',
    organizationId: 'org-1',
    hardwareType: 'LTE_R1',
    fuelType: 'GASOLINE',
    dimoVehicleId: 'dimo-1',
    dimoVehicle: {
      connectionStatus: 'CONNECTED',
      tokenId: 42,
      lastSignal: minutesAgo(5),
    },
    latestState: {
      lastSeenAt: minutesAgo(5),
      providerFetchedAt: minutesAgo(5),
      sourceTimestamp: minutesAgo(5),
      providerSource: 'DIMO',
      providerBindingId: 'binding-1',
      rawPayloadJson: { obdIsPluggedIn: { value: true } },
      latitude: 52.5,
      longitude: 13.4,
      speedKmh: 0,
      odometerKm: 1000,
      fuelLevelRelative: 0.5,
      fuelLevelAbsolute: null,
      evSoc: null,
      obdDtcList: null,
      lastDtcPollAt: null,
    },
    dataSourceLinks: [
      {
        id: 'binding-1',
        sourceType: 'DIMO',
        sourceSubtype: null,
        isActive: true,
        provider: 'DIMO',
      },
    ],
    providerConsents: [
      {
        organizationId: 'org-1',
        provider: 'DIMO',
        status: 'ACTIVE',
        grantedAt: new Date('2026-01-01'),
        expiresAt: null,
        revokedAt: null,
      },
    ],
    deviceConnectionEpisodes: [],
    ...overrides,
  };
}

describe('connectivity consumer migration', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(NOW));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('cross-surface snapshot', () => {
    it('standby runtime maps to standby legacy connection status', () => {
      const runtime = assembleVehicleConnectivityRuntimeState(
        baseRow({
          dimoVehicle: {
            connectionStatus: 'CONNECTED',
            tokenId: 42,
            lastSignal: hoursAgo(3),
          },
          latestState: {
            ...baseRow().latestState!,
            lastSeenAt: hoursAgo(3),
            sourceTimestamp: hoursAgo(3),
            providerFetchedAt: hoursAgo(3),
          },
        }),
        null,
        NOW,
      );
      expect(runtime.overallState).toBe('STANDBY');
      const legacy = projectLegacyFleetConnectivityFields(runtime);
      expect(legacy.telemetryFreshness).toBe('standby');
      expect(legacy.connectionStatus).toBe('standby');
    });

    it('soft-offline does not block as hard offline legacy status', () => {
      const runtime = assembleVehicleConnectivityRuntimeState(
        baseRow({
          dimoVehicle: {
            connectionStatus: 'CONNECTED',
            tokenId: 42,
            lastSignal: hoursAgo(30),
          },
          latestState: {
            ...baseRow().latestState!,
            lastSeenAt: hoursAgo(30),
            sourceTimestamp: hoursAgo(30),
            providerFetchedAt: hoursAgo(30),
          },
        }),
        null,
        NOW,
      );
      expect(runtime.overallState).toBe('SOFT_OFFLINE');
      expect(runtime.attentionState).toBe('WATCH');
      const legacy = projectLegacyFleetConnectivityFields(runtime);
      expect(legacy.connectionStatus).toBe('signal_delayed');
    });
  });

  describe('incident state — no parallel live + unplugged', () => {
    it('DEVICE_UNPLUGGED with live telemetry never maps legacy online', () => {
      const runtime = assembleVehicleConnectivityRuntimeState(
        baseRow({
          deviceConnectionEpisodes: [
            {
              id: 'ep-1',
              deviceBindingId: 'binding-1',
              openedAt: hoursAgo(2),
              status: DeviceConnectionEpisodeStatus.OPEN,
              resolutionMethod: null,
              resolutionEvidenceAt: null,
              resolvedAt: null,
            },
          ],
          latestState: {
            ...baseRow().latestState!,
            rawPayloadJson: { obdIsPluggedIn: { value: false } },
          },
        }),
        null,
        NOW,
      );

      expect(runtime.overallState).toBe('DEVICE_UNPLUGGED');
      expect(runtime.telemetryState).toBe('live');
      const legacy = projectLegacyFleetConnectivityFields(runtime);
      expect(legacy.connectionStatus).not.toBe('online');
      expect(legacy.online).toBe(false);
    });

    it('fleet connectivity DTO exposes same runtime overallState', () => {
      const input = {
        id: 'v-consumer-1',
        vin: 'VIN',
        licensePlate: 'B-1',
        make: 'VW',
        model: 'Golf',
        year: 2022,
        fuelType: 'GASOLINE',
        hardwareType: 'LTE_R1',
        homeStation: { name: 'Berlin' },
        dimoVehicle: {
          tokenId: 1,
          lastSignal: minutesAgo(5),
          syncedAt: minutesAgo(5),
          createdAt: new Date('2026-01-01'),
          rawJson: { aftermarketDevice: { serial: 'SN' } },
        },
        latestState: {
          lastSeenAt: minutesAgo(5),
          sourceTimestamp: minutesAgo(5),
          providerFetchedAt: minutesAgo(5),
          latitude: 52.5,
          longitude: 13.4,
          speedKmh: 0,
          odometerKm: 1000,
          fuelLevelRelative: 0.5,
          fuelLevelAbsolute: null,
          evSoc: null,
          obdDtcList: null,
          lastDtcPollAt: null,
          rawPayloadJson: { obdIsPluggedIn: { value: true } },
          providerSource: 'DIMO',
        },
      };

      const webhookTrigger = mockWebhookConfiguration();
      const deviceConnection = {
        lastDeviceUnpluggedAt: hoursAgo(2).toISOString(),
        lastDevicePluggedInAt: null,
        currentDeviceConnectionStatus: 'unplugged' as const,
        openUnpluggedEpisode: true,
        openUnpluggedSince: hoursAgo(2).toISOString(),
        openUnpluggedDurationMs: 2 * 3_600_000,
        severity: 'critical' as const,
        rentalRelevant: false,
        duringActiveBooking: false,
        eventSource: 'dimo_webhook' as const,
        unplugTriggerState: webhookTrigger.unplugTriggerState,
        plugTriggerState: webhookTrigger.plugTriggerState,
        recoveryPolicy: webhookTrigger.recoveryPolicy,
        lastSuccessfulDeliveryAt: webhookTrigger.lastSuccessfulDeliveryAt,
        lastDeliveryErrorAt: webhookTrigger.lastDeliveryErrorAt,
      };

      const mapped = mapFleetConnectivityVehicleWithRuntime(
        input,
        NOW,
        deviceConnection,
      );

      expect(mapped.connectivityRuntime.overallState).toBe('DEVICE_UNPLUGGED');
      expect(mapped.connectionStatus).not.toBe('online');
      expect(mapped.connectivityRuntime.telemetryState).toBe('live');
    });
  });

  describe('authorization and OEM', () => {
    it('no provider link → NO_ACTIVE_DATA_SOURCE / not_connected', () => {
      const runtime = assembleVehicleConnectivityRuntimeState(
        baseRow({
          dimoVehicleId: null,
          dimoVehicle: null,
          dataSourceLinks: [],
        }),
        null,
        NOW,
      );
      expect(runtime.overallState).toBe('NO_ACTIVE_DATA_SOURCE');
      expect(
        mapOverallStateToLegacyConnectionStatus(
          runtime.overallState,
          runtime.telemetryState,
          runtime.providerLinkState,
        ),
      ).toBe('not_connected');
    });

    it('OEM vehicle uses NOT_APPLICABLE physical device state', () => {
      const runtime = assembleVehicleConnectivityRuntimeState(
        baseRow({
          hardwareType: 'OEM',
          deviceConnectionEpisodes: [],
        }),
        null,
        NOW,
      );
      expect(runtime.physicalDeviceState).toBe('NOT_APPLICABLE');
    });
  });

  describe('coverage partial and unknown', () => {
    it('partial coverage is WATCH, not hard block', () => {
      const runtime = assembleVehicleConnectivityRuntimeState(
        baseRow({
          latestState: {
            lastSeenAt: minutesAgo(5),
            providerFetchedAt: minutesAgo(5),
            sourceTimestamp: minutesAgo(5),
            providerSource: 'DIMO',
            providerBindingId: 'binding-1',
            rawPayloadJson: {},
            latitude: null,
            longitude: null,
            speedKmh: null,
            odometerKm: null,
            fuelLevelRelative: null,
            fuelLevelAbsolute: null,
            evSoc: null,
            obdDtcList: null,
            lastDtcPollAt: null,
          },
        }),
        null,
        NOW,
      );
      expect(runtime.dataCoverageState).toBe('INSUFFICIENT');
      expect(runtime.overallState).not.toBe('OFFLINE');
    });

    it('unknown telemetry is not treated as good', () => {
      const runtime = assembleVehicleConnectivityRuntimeState(
        baseRow({
          dimoVehicle: {
            connectionStatus: 'CONNECTED',
            tokenId: 42,
            lastSignal: null,
          },
          latestState: null,
        }),
        null,
        NOW,
      );
      expect(runtime.telemetryState).toBe('no_signal');
      expect(runtime.overallState).not.toBe('TELEMETRY_ACTIVE');
      expect(runtime.dataCoverageState).not.toBe('GOOD');
    });
  });

  describe('no frontend self-calculation contract', () => {
    it('connectivityRuntime carries all required consumer dimensions', () => {
      const runtime = buildFleetConnectivityRuntimeForInput(
        {
          id: 'v-1',
          vin: 'VIN',
          licensePlate: 'B-1',
          make: 'VW',
          model: 'Golf',
          year: 2022,
          dimoVehicle: {
            tokenId: 1,
            lastSignal: minutesAgo(5),
            syncedAt: minutesAgo(5),
            createdAt: new Date('2026-01-01'),
            rawJson: {},
          },
          latestState: {
            lastSeenAt: minutesAgo(5),
            sourceTimestamp: minutesAgo(5),
            providerFetchedAt: minutesAgo(5),
            latitude: 52.5,
            longitude: 13.4,
            speedKmh: 0,
            odometerKm: 1000,
            fuelLevelRelative: 0.5,
            fuelLevelAbsolute: null,
            evSoc: null,
            obdDtcList: null,
            lastDtcPollAt: null,
            rawPayloadJson: {},
            providerSource: 'DIMO',
          },
        },
        NOW,
      );

      const required = [
        'overallState',
        'providerLinkState',
        'telemetryState',
        'physicalDeviceState',
        'dataCoverageState',
        'attentionState',
        'reasonCodes',
        'recommendedAction',
      ] as const;

      for (const key of required) {
        expect(runtime[key]).toBeDefined();
      }
    });
  });
});
