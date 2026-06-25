import {
  deriveVehicleCapabilityProfile,
  getVehicleCapabilities,
  usesNativeTelemetryEvents,
} from './vehicle-capabilities';

describe('vehicle-capabilities', () => {
  describe('getVehicleCapabilities (regression — must not change LTE_R1 routing)', () => {
    it('keeps LTE_R1 on native telemetry events, abuse via HF, no HF driving events', () => {
      const caps = getVehicleCapabilities('LTE_R1');
      expect(caps.drivingEventsSource).toBe('TELEMETRY_EVENTS');
      expect(caps.useHfDrivingEvents).toBe(false);
      expect(caps.abuseSource).toBe('HF');
      expect(caps.nativeEventCapable).toBe(true);
      expect(usesNativeTelemetryEvents('LTE_R1')).toBe(true);
    });

    it('keeps SMART5/UNKNOWN on HF-derived driving events', () => {
      for (const hw of ['SMART5', 'UNKNOWN'] as const) {
        const caps = getVehicleCapabilities(hw);
        expect(caps.drivingEventsSource).toBe('HF_DERIVED');
        expect(caps.useHfDrivingEvents).toBe(true);
        expect(caps.nativeEventCapable).toBe(false);
        expect(usesNativeTelemetryEvents(hw)).toBe(false);
      }
    });
  });

  describe('deriveVehicleCapabilityProfile', () => {
    it('marks LTE_R1 ICE as native-capable with engine signals available', () => {
      const profile = deriveVehicleCapabilityProfile({
        hardwareType: 'LTE_R1',
        fuelType: 'GASOLINE',
        hasHfWaypoints: true,
      });
      expect(profile.nativeEventCapable).toBe(true);
      expect(profile.engineSignalsAvailable).toBe(true);
      expect(profile.snapshotOnly).toBe(false);
      expect(profile.profileLabel).toContain('LTE R1');
    });

    it('marks battery-electric vehicles as having no engine signals (engine detectors impossible)', () => {
      for (const fuel of ['ELECTRIC', 'electric', 'BEV', 'Battery Electric']) {
        const profile = deriveVehicleCapabilityProfile({
          hardwareType: 'UNKNOWN',
          fuelType: fuel,
          hasHfWaypoints: true,
        });
        expect(profile.engineSignalsAvailable).toBe(false);
      }
    });

    it('flags snapshot-only when no HF waypoints are observed', () => {
      const profile = deriveVehicleCapabilityProfile({
        hardwareType: 'UNKNOWN',
        fuelType: 'ELECTRIC',
        hasHfWaypoints: false,
      });
      expect(profile.snapshotOnly).toBe(true);
    });

    it('does not pre-emptively disable engine detectors when fuel type is unknown', () => {
      const profile = deriveVehicleCapabilityProfile({
        hardwareType: 'UNKNOWN',
        fuelType: null,
        hasHfWaypoints: true,
      });
      expect(profile.engineSignalsAvailable).toBe(true);
    });
  });
});
