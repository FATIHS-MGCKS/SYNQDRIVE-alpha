import {
  evaluateStationGeofenceCapability,
  isStationGeofenceConfigured,
  resolveStationGeofenceRuntimeFlagsFromEnv,
  StationGeofenceCapabilityStatus,
} from './station-geofence-capability.policy';
import { getStationGeofenceCapabilityContractMetadata } from './station-geofence-capability.contract';

describe('station-geofence-capability.policy', () => {
  const configuredInput = {
    latitude: 51.335411,
    longitude: 9.506002,
    radiusMeters: 150,
  };

  describe('contract metadata', () => {
    it('documents no current writes and shadow follow-up plan', () => {
      const metadata = getStationGeofenceCapabilityContractMetadata();
      expect(metadata.writesCurrentStationId).toBe(false);
      expect(metadata.publishesConfirmedArrival).toBe(false);
      expect(metadata.defaultStatus).toBe(StationGeofenceCapabilityStatus.CONFIGURED_ONLY);
      expect(metadata.shadowPlan.writesCurrentStationId).toBe(false);
      expect(metadata.shadowPlan.rolloutFlag).toBe('STATION_GEOFENCE_SHADOW_VALIDATION');
    });
  });

  describe('isStationGeofenceConfigured', () => {
    it('returns false when coordinates are missing', () => {
      expect(
        isStationGeofenceConfigured({
          latitude: null,
          longitude: null,
          radiusMeters: 150,
        }),
      ).toBe(false);
    });

    it('returns false when radius is missing', () => {
      expect(
        isStationGeofenceConfigured({
          latitude: 51.3,
          longitude: 9.5,
          radiusMeters: null,
        }),
      ).toBe(false);
    });

    it('returns true when coordinates and radius are present', () => {
      expect(isStationGeofenceConfigured(configuredInput)).toBe(true);
    });
  });

  describe('evaluateStationGeofenceCapability', () => {
    it('returns NOT_CONFIGURED when geofence prerequisites are missing', () => {
      const result = evaluateStationGeofenceCapability(
        { latitude: null, longitude: null, radiusMeters: 150 },
        {},
      );

      expect(result.status).toBe(StationGeofenceCapabilityStatus.NOT_CONFIGURED);
      expect(result.geofenceConfigured).toBe(false);
      expect(result.automationActive).toBe(false);
      expect(result.writesCurrentStationId).toBe(false);
      expect(result.publishesConfirmedArrival).toBe(false);
      expect(result.allowsAutomaticLocationDetectionClaim).toBe(false);
      expect(result.uiHint).toContain('nicht vollständig konfiguriert');
    });

    it('returns CONFIGURED_ONLY for configured stations without rollout flags', () => {
      const result = evaluateStationGeofenceCapability(configuredInput, {});

      expect(result.status).toBe(StationGeofenceCapabilityStatus.CONFIGURED_ONLY);
      expect(result.geofenceConfigured).toBe(true);
      expect(result.automationActive).toBe(false);
      expect(result.writesCurrentStationId).toBe(false);
      expect(result.publishesConfirmedArrival).toBe(false);
      expect(result.allowsAutomaticLocationDetectionClaim).toBe(false);
      expect(result.uiHint).toContain('keine automatische Standorterkennung aktiv');
      expect(result.reasons.some((item) => item.code === 'STATION_GEOFENCE_NO_ACTIVE_WRITER')).toBe(
        true,
      );
    });

    it('returns SHADOW_VALIDATION when shadow rollout flag is enabled', () => {
      const result = evaluateStationGeofenceCapability(configuredInput, {
        shadowValidationEnabled: true,
      });

      expect(result.status).toBe(StationGeofenceCapabilityStatus.SHADOW_VALIDATION);
      expect(result.automationActive).toBe(true);
      expect(result.writesCurrentStationId).toBe(false);
      expect(result.publishesConfirmedArrival).toBe(false);
      expect(result.allowsAutomaticLocationDetectionClaim).toBe(false);
    });

    it('returns PRODUCTION_ACTIVE when production writer flag is enabled', () => {
      const result = evaluateStationGeofenceCapability(configuredInput, {
        productionWriterEnabled: true,
      });

      expect(result.status).toBe(StationGeofenceCapabilityStatus.PRODUCTION_ACTIVE);
      expect(result.automationActive).toBe(true);
      expect(result.writesCurrentStationId).toBe(true);
      expect(result.publishesConfirmedArrival).toBe(false);
      expect(result.allowsAutomaticLocationDetectionClaim).toBe(true);
    });

    it('prefers PRODUCTION_ACTIVE over SHADOW_VALIDATION when both flags are set', () => {
      const result = evaluateStationGeofenceCapability(configuredInput, {
        shadowValidationEnabled: true,
        productionWriterEnabled: true,
      });

      expect(result.status).toBe(StationGeofenceCapabilityStatus.PRODUCTION_ACTIVE);
    });

    it('returns DEGRADED when automation flags are enabled and degraded flag is set', () => {
      const result = evaluateStationGeofenceCapability(configuredInput, {
        shadowValidationEnabled: true,
        degraded: true,
        degradedReason: 'Telemetry feed unavailable',
      });

      expect(result.status).toBe(StationGeofenceCapabilityStatus.DEGRADED);
      expect(result.writesCurrentStationId).toBe(false);
      expect(result.allowsAutomaticLocationDetectionClaim).toBe(false);
      expect(result.reasons.some((item) => item.message.includes('Telemetry feed unavailable'))).toBe(
        true,
      );
    });

    it('never publishes confirmed arrival for any status', () => {
      const statuses = [
        evaluateStationGeofenceCapability(
          { latitude: null, longitude: null, radiusMeters: null },
          {},
        ),
        evaluateStationGeofenceCapability(configuredInput, {}),
        evaluateStationGeofenceCapability(configuredInput, { shadowValidationEnabled: true }),
        evaluateStationGeofenceCapability(configuredInput, { productionWriterEnabled: true }),
      ];

      for (const result of statuses) {
        expect(result.publishesConfirmedArrival).toBe(false);
      }
    });
  });

  describe('resolveStationGeofenceRuntimeFlagsFromEnv', () => {
    it('parses rollout flags from environment variables', () => {
      const flags = resolveStationGeofenceRuntimeFlagsFromEnv({
        STATION_GEOFENCE_SHADOW_VALIDATION: 'true',
        STATION_GEOFENCE_PRODUCTION_WRITER: '1',
        STATION_GEOFENCE_DEGRADED: 'yes',
        STATION_GEOFENCE_DEGRADED_REASON: 'gps lag',
      });

      expect(flags).toEqual({
        shadowValidationEnabled: true,
        productionWriterEnabled: true,
        degraded: true,
        degradedReason: 'gps lag',
      });
    });
  });
});
