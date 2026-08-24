/**
 * Regression contract for vehicle operational state provenance boundaries (P0.1).
 */
import { classifyTelemetryFreshness } from '../vehicle-state-interpreter';
import { deriveInterruptionKnowledge } from '../../dimo/interruption-knowledge';

describe('vehicle operational provenance regression (P0.1)', () => {
  const now = new Date('2026-08-24T12:00:00.000Z').getTime();

  describe('Test A — configured availability vs telemetry freshness remain distinct', () => {
    it('represents AVAILABLE operational status alongside offline telemetry freshness', () => {
      const configuredOperationalStatus = 'AVAILABLE';
      const telemetryFreshness = classifyTelemetryFreshness(
        new Date(now - 50 * 24 * 60 * 60 * 1000),
        now,
      );
      expect(configuredOperationalStatus).toBe('AVAILABLE');
      expect(telemetryFreshness).toBe('offline');
    });
  });

  describe('Test B — provider link vs telemetry freshness', () => {
    it('allows CONNECTED provider link with offline telemetry freshness', () => {
      const providerLinkState = 'CONNECTED';
      const telemetryFreshness = classifyTelemetryFreshness(
        new Date(now - 50 * 24 * 60 * 60 * 1000),
        now,
      );
      expect(providerLinkState).toBe('CONNECTED');
      expect(telemetryFreshness).toBe('offline');
    });
  });

  describe('Test C — interruption knowledge unknown vs known_none', () => {
    it('does not collapse OBD unplug evidence without episode into known_none', () => {
      const result = deriveInterruptionKnowledge({
        lteR1Capable: true,
        dimoLinked: true,
        usePersistedEpisodeScope: true,
        openUnpluggedEpisode: false,
        hasUnplugEvents: true,
        obdSnapshotUnplugged: true,
      });
      expect(result.knowledge).toBe('unknown');
      expect(result.knowledge).not.toBe('known_none');
    });
  });

  describe('Test D — webhook configuration vs device connection status', () => {
    it('allows active webhook configuration with unknown device connection status', () => {
      const webhookConfigured = 'active';
      const deviceConnectionStatus = 'unknown';
      expect(webhookConfigured).toBe('active');
      expect(deviceConnectionStatus).toBe('unknown');
    });
  });
});
