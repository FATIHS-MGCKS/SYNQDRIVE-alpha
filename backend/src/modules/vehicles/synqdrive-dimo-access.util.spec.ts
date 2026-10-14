import {
  deriveIntegrationConnectivity,
  deriveMirrorIntegrationConnectivity,
  isSynqDriveDimoDataAccessBlocked,
} from './synqdrive-dimo-access.util';
import { buildVehicleAttention } from './vehicle-attention.util';

describe('synqdrive-dimo-access.util (VO5C D1)', () => {
  describe('deriveMirrorIntegrationConnectivity', () => {
    it('reflects last observed DIMO mirror status only', () => {
      expect(deriveMirrorIntegrationConnectivity('d1', 'CONNECTED', false)).toBe('connected');
      expect(deriveMirrorIntegrationConnectivity('d1', 'DISCONNECTED', false)).toBe(
        'disconnected',
      );
      expect(deriveMirrorIntegrationConnectivity(null, 'CONNECTED', false)).toBe('none');
    });
  });

  describe('deriveIntegrationConnectivity — effective SynqDrive access', () => {
    it('ACTIVE fleet: mirror CONNECTED stays connected', () => {
      expect(
        deriveIntegrationConnectivity('d1', 'CONNECTED', false, {
          registryLifecycle: 'ACTIVE',
        }),
      ).toBe('connected');
    });

    it('OFFBOARDED with stale mirror CONNECTED is not shown as connected', () => {
      expect(
        deriveIntegrationConnectivity('d1', 'CONNECTED', false, {
          registryLifecycle: 'OFFBOARDED',
        }),
      ).toBe('disconnected');
      expect(deriveMirrorIntegrationConnectivity('d1', 'CONNECTED', false)).toBe('connected');
    });

    it('ARCHIVED mirrors OFFBOARDED effective access', () => {
      expect(
        deriveIntegrationConnectivity('d1', 'CONNECTED', false, {
          registryLifecycle: 'ARCHIVED',
        }),
      ).toBe('disconnected');
    });

    it('REVOKED consent on ACTIVE registry surfaces auth error', () => {
      expect(
        deriveIntegrationConnectivity('d1', 'CONNECTED', false, {
          registryLifecycle: 'ACTIVE',
          synqDriveDimoAccessRevoked: true,
        }),
      ).toBe('error');
    });

    it('does not rewrite mirror to DISCONNECTED in storage — only effective read model', () => {
      const mirror = 'CONNECTED';
      expect(
        deriveIntegrationConnectivity('d1', mirror, false, {
          registryLifecycle: 'OFFBOARDED',
        }),
      ).not.toBe('connected');
      expect(mirror).toBe('CONNECTED');
    });
  });

  describe('isSynqDriveDimoDataAccessBlocked', () => {
    it('blocks OFFBOARDED, ARCHIVED, and explicit revoke', () => {
      expect(isSynqDriveDimoDataAccessBlocked({ registryLifecycle: 'OFFBOARDED' })).toBe(true);
      expect(isSynqDriveDimoDataAccessBlocked({ registryLifecycle: 'ARCHIVED' })).toBe(true);
      expect(
        isSynqDriveDimoDataAccessBlocked({
          registryLifecycle: 'ACTIVE',
          synqDriveDimoAccessRevoked: true,
        }),
      ).toBe(true);
      expect(isSynqDriveDimoDataAccessBlocked({ registryLifecycle: 'ACTIVE' })).toBe(false);
    });
  });

  describe('attention suppression for inactive SynqDrive access', () => {
    const base = {
      vehicleId: 'v1',
      dimoVehicleId: 'd1',
      registrationState: 'registered' as const,
      ownership: 'assigned' as const,
      integrationConnectivity: 'disconnected' as const,
      telemetryFreshness: 'no_signal' as const,
      telemetryAgeMs: 8 * 24 * 60 * 60 * 1000,
      platformDimoDegraded: false,
      lastPollStatus: 'FAILURE' as const,
      lastPollAt: new Date().toISOString(),
      mappingConflict: false,
    };

    it('suppresses DIMO/pipeline noise when data access inactive', () => {
      const attention = buildVehicleAttention({
        ...base,
        synqDriveDimoDataAccessActive: false,
      });
      const codes = attention.reasons.map((r) => r.code);
      expect(codes).not.toContain('DIMO_DISCONNECTED');
      expect(codes).not.toContain('INGESTION_ERROR');
      expect(codes).not.toContain('PIPELINE_STALE');
      expect(codes).not.toContain('TELEMETRY_NO_SIGNAL');
    });

    it('still surfaces ingestion errors for ACTIVE access', () => {
      const attention = buildVehicleAttention({
        ...base,
        integrationConnectivity: 'connected',
        synqDriveDimoDataAccessActive: true,
      });
      expect(attention.reasons.some((r) => r.code === 'INGESTION_ERROR')).toBe(true);
    });
  });
});
