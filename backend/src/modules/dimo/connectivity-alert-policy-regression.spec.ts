/**
 * Connectivity alert policy regressions (L / FC-C-03).
 *
 * Registry and producer wiring are not implemented for device episodes yet.
 * These tests lock the TARGET policy from the audit alert-resolution matrix.
 */
import {
  NOTIFICATION_EVENT_REGISTRY,
  resolveEventSlug,
  NotificationEventRegistryError,
} from '@modules/notifications/registry/notification-event-registry';

type EpisodePhase = 'open' | 'recovered';

interface DeviceAlertPolicyInput {
  phase: EpisodePhase;
  priorNotifications: Array<'DEVICE_UNPLUGGED' | 'DEVICE_RECONNECTED'>;
  recoverySource: 'plug_webhook' | 'snapshot_obd' | 'duplicate_recovery';
}

interface DeviceAlertPolicyResult {
  activeAlerts: Array<'DEVICE_UNPLUGGED' | 'DEVICE_RECONNECTED'>;
  newNotifications: Array<'DEVICE_UNPLUGGED' | 'DEVICE_RECONNECTED'>;
}

/**
 * TARGET policy (Prompt 10) — not wired in production.
 */
export function evaluateDeviceAlertPolicy(
  input: DeviceAlertPolicyInput,
): DeviceAlertPolicyResult {
  if (input.phase === 'open') {
    if (input.priorNotifications.includes('DEVICE_UNPLUGGED')) {
      return { activeAlerts: ['DEVICE_UNPLUGGED'], newNotifications: [] };
    }
    return {
      activeAlerts: ['DEVICE_UNPLUGGED'],
      newNotifications: ['DEVICE_UNPLUGGED'],
    };
  }

  const hadUnplug = input.priorNotifications.includes('DEVICE_UNPLUGGED');
  const hadReconnect = input.priorNotifications.includes('DEVICE_RECONNECTED');

  if (!hadUnplug) {
    return { activeAlerts: [], newNotifications: [] };
  }

  if (hadReconnect || input.recoverySource === 'duplicate_recovery') {
    return { activeAlerts: [], newNotifications: [] };
  }

  return {
    activeAlerts: [],
    newNotifications: ['DEVICE_RECONNECTED'],
  };
}

describe('connectivity alert policy regressions (L)', () => {
  describe('registry wiring gap (CURRENT)', () => {
    it('DEVICE_UNPLUGGED slug is not registered', () => {
      expect(() => resolveEventSlug('device-unplugged')).toThrow(
        NotificationEventRegistryError,
      );
    });

    it('DEVICE_RECONNECTED slug is not registered', () => {
      expect(() => resolveEventSlug('device-reconnected')).toThrow(
        NotificationEventRegistryError,
      );
    });

    it('TELEMETRY_OFFLINE exists but device episode alerts do not', () => {
      const slugs = NOTIFICATION_EVENT_REGISTRY.map((d) => d.slug);
      expect(slugs).toContain('telemetry-offline');
      expect(slugs).not.toContain('device-unplugged');
      expect(slugs).not.toContain('device-reconnected');
    });
  });

  describe('TARGET alert lifecycle (policy spec)', () => {
    it('opens DEVICE_UNPLUGGED once on first unplug', () => {
      const result = evaluateDeviceAlertPolicy({
        phase: 'open',
        priorNotifications: [],
        recoverySource: 'snapshot_obd',
      });
      expect(result.newNotifications).toEqual(['DEVICE_UNPLUGGED']);
      expect(result.activeAlerts).toEqual(['DEVICE_UNPLUGGED']);
    });

    it('does not duplicate DEVICE_UNPLUGGED while episode stays open', () => {
      const result = evaluateDeviceAlertPolicy({
        phase: 'open',
        priorNotifications: ['DEVICE_UNPLUGGED'],
        recoverySource: 'snapshot_obd',
      });
      expect(result.newNotifications).toEqual([]);
    });

    it('resolves DEVICE_UNPLUGGED and emits one DEVICE_RECONNECTED on recovery', () => {
      const result = evaluateDeviceAlertPolicy({
        phase: 'recovered',
        priorNotifications: ['DEVICE_UNPLUGGED'],
        recoverySource: 'snapshot_obd',
      });
      expect(result.activeAlerts).toEqual([]);
      expect(result.newNotifications).toEqual(['DEVICE_RECONNECTED']);
    });

    it('does not emit duplicate DEVICE_RECONNECTED for identical recovery', () => {
      const result = evaluateDeviceAlertPolicy({
        phase: 'recovered',
        priorNotifications: ['DEVICE_UNPLUGGED', 'DEVICE_RECONNECTED'],
        recoverySource: 'duplicate_recovery',
      });
      expect(result.newNotifications).toEqual([]);
    });
  });

  describe('CURRENT production gap', () => {
    it('no producer path maps open episode → DEVICE_UNPLUGGED notification', () => {
      const registryTypes = NOTIFICATION_EVENT_REGISTRY.map((d) => d.eventType);
      expect(registryTypes).not.toContain('DEVICE_UNPLUGGED');
      expect(registryTypes).not.toContain('DEVICE_RECONNECTED');
    });
  });
});
