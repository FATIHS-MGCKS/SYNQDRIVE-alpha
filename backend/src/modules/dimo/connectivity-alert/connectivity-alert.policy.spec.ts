import {
  evaluateDeviceAlertPolicy,
  shouldOpenTelemetryOfflineAlert,
  shouldOpenTelemetrySoftOfflineAlert,
  shouldResolveTelemetryAlerts,
} from './connectivity-alert.policy';
import { buildConnectivityAlertDedupeKey } from './connectivity-alert.dedupe';
import { ConnectivityAlertType } from './connectivity-alert.types';

describe('connectivity-alert.policy', () => {
  it('opens DEVICE_UNPLUGGED once per episode', () => {
    const first = evaluateDeviceAlertPolicy({
      phase: 'open',
      priorNotifications: [],
      recoverySource: 'snapshot_obd',
    });
    expect(first.newNotifications).toEqual([ConnectivityAlertType.DEVICE_UNPLUGGED]);

    const duplicate = evaluateDeviceAlertPolicy({
      phase: 'open',
      priorNotifications: [ConnectivityAlertType.DEVICE_UNPLUGGED],
      recoverySource: 'snapshot_obd',
    });
    expect(duplicate.newNotifications).toEqual([]);
  });

  it('resolves unplug and emits one reconnect on recovery', () => {
    const result = evaluateDeviceAlertPolicy({
      phase: 'recovered',
      priorNotifications: [ConnectivityAlertType.DEVICE_UNPLUGGED],
      recoverySource: 'telemetry_resumed',
    });
    expect(result.resolveUnplug).toBe(true);
    expect(result.newNotifications).toEqual([ConnectivityAlertType.DEVICE_RECONNECTED]);
  });

  it('does not duplicate reconnect on replay', () => {
    const result = evaluateDeviceAlertPolicy({
      phase: 'recovered',
      priorNotifications: [
        ConnectivityAlertType.DEVICE_UNPLUGGED,
        ConnectivityAlertType.DEVICE_RECONNECTED,
      ],
      recoverySource: 'duplicate_recovery',
    });
    expect(result.newNotifications).toEqual([]);
  });

  it('telemetry standby does not open offline alerts', () => {
    expect(shouldResolveTelemetryAlerts('standby')).toBe(true);
    expect(shouldOpenTelemetryOfflineAlert('standby')).toBe(false);
    expect(shouldOpenTelemetrySoftOfflineAlert('standby')).toBe(false);
  });

  it('telemetry offline is independent from standby', () => {
    expect(shouldOpenTelemetryOfflineAlert('offline')).toBe(true);
    expect(shouldOpenTelemetrySoftOfflineAlert('signal_delayed')).toBe(true);
  });
});

describe('connectivity-alert.dedupe', () => {
  it('builds stable dedupe key with episode and binding', () => {
    const key = buildConnectivityAlertDedupeKey({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      provider: 'DIMO',
      deviceBindingId: 'bind-1',
      episodeId: 'ep-1',
      alertType: ConnectivityAlertType.DEVICE_UNPLUGGED,
      stateVersion: 2,
    });
    expect(key).toBe('org-1:veh-1:DIMO:bind-1:ep-1:DEVICE_UNPLUGGED:2');
  });
});
