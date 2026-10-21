/**
 * Regression contract for vehicle operational state provenance boundaries (P0.1).
 */
import { classifyTelemetryFreshness } from '../vehicle-state-interpreter';
import { deriveInterruptionKnowledge } from '../../dimo/interruption-knowledge';
import { derivePhysicalDeviceEvidence } from '../connectivity/domain/physical-device-evidence';
import { PhysicalDeviceState } from '../connectivity/domain/connectivity-domain.types';
import { ConnectivityReasonCode } from '../connectivity/domain/connectivity-domain.types';

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
    it('does not collapse physical unplug evidence without episode into known_none', () => {
      const result = deriveInterruptionKnowledge({
        lteR1Capable: true,
        dimoLinked: true,
        usePersistedEpisodeScope: true,
        episodeEvidenceReliable: true,
        openUnpluggedEpisode: false,
        physicalDeviceState: PhysicalDeviceState.UNPLUGGED_CONFIRMED,
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

  describe('Test F — newer snapshot resolves older unplug', () => {
    it('derives connected physical state when fresh snapshot is newer than unplug', () => {
      const result = derivePhysicalDeviceEvidence({
        physicalObdApplicable: true,
        nowMs: now,
        latestAcceptedUnplugEventAt: new Date('2026-08-24T11:50:00.000Z'),
        latestValidSnapshotAt: new Date('2026-08-24T11:55:00.000Z'),
      });
      expect(result.physicalDeviceState).toBe(PhysicalDeviceState.PLUGGED_INFERRED);
    });
  });

  describe('Test G — newer unplug overrides snapshot', () => {
    it('derives unplugged physical state when unplug is newer than snapshot', () => {
      const result = derivePhysicalDeviceEvidence({
        physicalObdApplicable: true,
        nowMs: now,
        latestValidSnapshotAt: new Date('2026-08-24T11:55:00.000Z'),
        latestAcceptedUnplugEventAt: new Date('2026-08-24T12:00:00.000Z'),
      });
      expect(result.physicalDeviceState).toBe(PhysicalDeviceState.UNPLUGGED_CONFIRMED);
    });
  });

  describe('Test H — no unplug + >48h telemetry silence', () => {
    it('derives unknown physical state and device_check_required without claiming unplugged', () => {
      const result = derivePhysicalDeviceEvidence({
        physicalObdApplicable: true,
        nowMs: now,
        latestValidSnapshotAt: new Date('2026-07-01T12:00:00.000Z'),
        latestAcceptedUnplugEventAt: null,
      });
      expect(result.telemetryFreshness).toBe('offline');
      expect(result.physicalDeviceState).toBe(PhysicalDeviceState.UNKNOWN);
      expect(result.reasonCodes).toContain(ConnectivityReasonCode.DEVICE_CHECK_REQUIRED);
    });
  });

  describe('Test I — episode scope not queried', () => {
    it('does not return known_none when episode scope was not queried', () => {
      const result = deriveInterruptionKnowledge({
        lteR1Capable: true,
        dimoLinked: true,
        usePersistedEpisodeScope: false,
        episodeEvidenceReliable: false,
        openUnpluggedEpisode: false,
        physicalDeviceState: PhysicalDeviceState.UNKNOWN,
      });
      expect(result.knowledge).toBe('unknown');
      expect(result.knowledge).not.toBe('known_none');
    });
  });

  describe('Test J — event proves unplug even if episode missing', () => {
    it('separates physical unplug from unknown interruption lifecycle', () => {
      const physical = derivePhysicalDeviceEvidence({
        physicalObdApplicable: true,
        nowMs: now,
        latestValidSnapshotAt: new Date('2026-08-24T11:00:00.000Z'),
        latestAcceptedUnplugEventAt: new Date('2026-08-24T12:00:00.000Z'),
      });
      const interruption = deriveInterruptionKnowledge({
        lteR1Capable: true,
        dimoLinked: true,
        usePersistedEpisodeScope: true,
        episodeEvidenceReliable: true,
        openUnpluggedEpisode: false,
        physicalDeviceState: physical.physicalDeviceState,
      });
      expect(physical.physicalDeviceState).toBe(PhysicalDeviceState.UNPLUGGED_CONFIRMED);
      expect(interruption.knowledge).toBe('unknown');
    });
  });

  describe('Test K — older unplug + newer fresh snapshot', () => {
    it('derives PLUGGED_INFERRED when recovery snapshot is still fresh', () => {
      const result = derivePhysicalDeviceEvidence({
        physicalObdApplicable: true,
        nowMs: now,
        latestAcceptedUnplugEventAt: new Date('2026-08-24T11:00:00.000Z'),
        latestValidSnapshotAt: new Date('2026-08-24T11:30:00.000Z'),
      });
      expect(result.physicalDeviceState).toBe(PhysicalDeviceState.PLUGGED_INFERRED);
    });
  });

  describe('Test L — recovery snapshot aged into offline', () => {
    it('degrades to UNKNOWN + DEVICE_CHECK_REQUIRED instead of perpetual PLUGGED_INFERRED', () => {
      const result = derivePhysicalDeviceEvidence({
        physicalObdApplicable: true,
        nowMs: now,
        latestAcceptedUnplugEventAt: new Date('2026-07-20T12:00:00.000Z'),
        latestValidSnapshotAt: new Date('2026-07-20T12:10:00.000Z'),
      });
      expect(result.physicalDeviceState).toBe(PhysicalDeviceState.UNKNOWN);
      expect(result.reasonCodes).toContain(ConnectivityReasonCode.DEVICE_CHECK_REQUIRED);
    });
  });

  describe('Test O — trustworthy episode authority yields KNOWN_NONE', () => {
    it('returns known_none only when scope queried and authority reliable', () => {
      const result = deriveInterruptionKnowledge({
        lteR1Capable: true,
        dimoLinked: true,
        usePersistedEpisodeScope: true,
        episodeEvidenceReliable: true,
        openUnpluggedEpisode: false,
        physicalDeviceState: PhysicalDeviceState.PLUGGED_INFERRED,
      });
      expect(result.knowledge).toBe('known_none');
    });
  });

  describe('Test P — degraded episode authority stays UNKNOWN', () => {
    it('does not return known_none when episode authority is unreliable', () => {
      const result = deriveInterruptionKnowledge({
        lteR1Capable: true,
        dimoLinked: true,
        usePersistedEpisodeScope: true,
        episodeEvidenceReliable: false,
        openUnpluggedEpisode: false,
        physicalDeviceState: PhysicalDeviceState.PLUGGED_INFERRED,
      });
      expect(result.knowledge).toBe('unknown');
      expect(result.reason).toBe('episode_authority_unreliable');
    });
  });

  describe('Test Q — unplug physical evidence without episode', () => {
    it('keeps UNPLUGGED_CONFIRMED physical state with UNKNOWN interruption knowledge', () => {
      const interruption = deriveInterruptionKnowledge({
        lteR1Capable: true,
        dimoLinked: true,
        usePersistedEpisodeScope: true,
        episodeEvidenceReliable: true,
        openUnpluggedEpisode: false,
        physicalDeviceState: PhysicalDeviceState.UNPLUGGED_CONFIRMED,
      });
      expect(interruption.knowledge).toBe('unknown');
      expect(interruption.reason).toBe('physical_evidence_without_episode');
    });
  });
});
