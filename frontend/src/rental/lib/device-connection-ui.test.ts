import { describe, expect, it } from 'vitest';
import {
  DEVICE_CONNECTION_LABELS,
  deviceConnectionEventLabel,
  fleetDeviceUnpluggedViaWebhook,
  shouldShowVehicleDeviceConnection,
  summarizeFleetDeviceConnection,
} from './device-connection-ui';

describe('device-connection-ui', () => {
  it('uses German unplug/plug labels', () => {
    expect(deviceConnectionEventLabel('OBD_DEVICE_UNPLUGGED')).toBe(
      DEVICE_CONNECTION_LABELS.deviceUnplugged,
    );
    expect(deviceConnectionEventLabel('OBD_DEVICE_PLUGGED_IN')).toBe(
      DEVICE_CONNECTION_LABELS.devicePluggedIn,
    );
  });

  it('shows vehicle card for LTE_R1 or when events exist', () => {
    expect(
      shouldShowVehicleDeviceConnection({
        lteR1Capable: true,
        recentEvents: [],
      } as never),
    ).toBe(true);
    expect(
      shouldShowVehicleDeviceConnection({
        lteR1Capable: false,
        recentEvents: [{ id: 'e1' }],
      } as never),
    ).toBe(true);
    expect(
      shouldShowVehicleDeviceConnection({
        lteR1Capable: false,
        recentEvents: [],
      } as never),
    ).toBe(false);
  });

  it('distinguishes webhook unplug from snapshot-only fleet rows', () => {
    expect(
      fleetDeviceUnpluggedViaWebhook({
        eventSource: 'dimo_webhook',
        currentDeviceConnectionStatus: 'unplugged',
      } as never),
    ).toBe(true);
    expect(
      fleetDeviceUnpluggedViaWebhook({
        eventSource: 'none',
        currentDeviceConnectionStatus: 'unplugged',
      } as never),
    ).toBe(false);
  });

  it('summarizes open webhook episode as telematics interruption', () => {
    expect(
      summarizeFleetDeviceConnection({
        eventSource: 'dimo_webhook',
        openUnpluggedEpisode: true,
        currentDeviceConnectionStatus: 'unplugged',
      } as never),
    ).toBe(DEVICE_CONNECTION_LABELS.telematicsInterruption);
  });
});
