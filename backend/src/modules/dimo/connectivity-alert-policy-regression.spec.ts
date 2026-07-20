/**
 * Connectivity alert policy regressions (L / FC-C-03).
 */
import {
  NOTIFICATION_EVENT_REGISTRY,
  resolveEventSlug,
} from '@modules/notifications/registry/notification-event-registry';
import {
  evaluateDeviceAlertPolicy,
} from './connectivity-alert/connectivity-alert.policy';
import { ConnectivityAlertType } from './connectivity-alert/connectivity-alert.types';

describe('connectivity alert policy regressions (L)', () => {
  describe('registry wiring', () => {
    it('DEVICE_UNPLUGGED and DEVICE_RECONNECTED are registered', () => {
      expect(resolveEventSlug('device-unplugged')).toBe('DEVICE_UNPLUGGED');
      expect(resolveEventSlug('device-reconnected')).toBe('DEVICE_RECONNECTED');
    });

    it('telemetry and coverage connectivity alerts are registered', () => {
      const slugs = NOTIFICATION_EVENT_REGISTRY.map((d) => d.slug);
      expect(slugs).toContain('telemetry-offline');
      expect(slugs).toContain('telemetry-soft-offline');
      expect(slugs).toContain('data-coverage-insufficient');
      expect(slugs).toContain('device-unplugged');
      expect(slugs).toContain('device-reconnected');
    });
  });

  describe('alert lifecycle (policy)', () => {
    it('opens DEVICE_UNPLUGGED once on first unplug', () => {
      const result = evaluateDeviceAlertPolicy({
        phase: 'open',
        priorNotifications: [],
        recoverySource: 'snapshot_obd',
      });
      expect(result.newNotifications).toEqual([ConnectivityAlertType.DEVICE_UNPLUGGED]);
      expect(result.activeAlerts).toEqual([ConnectivityAlertType.DEVICE_UNPLUGGED]);
    });

    it('does not duplicate DEVICE_UNPLUGGED while episode stays open', () => {
      const result = evaluateDeviceAlertPolicy({
        phase: 'open',
        priorNotifications: [ConnectivityAlertType.DEVICE_UNPLUGGED],
        recoverySource: 'snapshot_obd',
      });
      expect(result.newNotifications).toEqual([]);
    });

    it('resolves DEVICE_UNPLUGGED and emits one DEVICE_RECONNECTED on recovery', () => {
      const result = evaluateDeviceAlertPolicy({
        phase: 'recovered',
        priorNotifications: [ConnectivityAlertType.DEVICE_UNPLUGGED],
        recoverySource: 'snapshot_obd',
      });
      expect(result.activeAlerts).toEqual([]);
      expect(result.newNotifications).toEqual([ConnectivityAlertType.DEVICE_RECONNECTED]);
      expect(result.resolveUnplug).toBe(true);
    });

    it('does not emit duplicate DEVICE_RECONNECTED for identical recovery', () => {
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
  });
});
