import {
  assessDrivingImpactComputationQuality,
  buildPersistedDrivingImpactOutcome,
  mapComputationQualityToTripStatus,
} from './driving-impact-outcome.util';

describe('driving-impact-outcome.util', () => {
  describe('assessDrivingImpactComputationQuality', () => {
    it('returns COMPLETE when usage split and braking detail are present', () => {
      expect(
        assessDrivingImpactComputationQuality({
          distanceKm: 50,
          citySharePct: 30,
          highwaySharePct: 60,
          countryRoadSharePct: 10,
          brakingEventRowCount: 2,
          useTelemetryDrivingEvents: false,
        }),
      ).toBe('COMPLETE');
    });

    it('returns PARTIAL when usage split is missing', () => {
      expect(
        assessDrivingImpactComputationQuality({
          distanceKm: 50,
          citySharePct: null,
          highwaySharePct: null,
          countryRoadSharePct: null,
          brakingEventRowCount: 3,
          useTelemetryDrivingEvents: false,
        }),
      ).toBe('PARTIAL');
    });

    it('returns PARTIAL when braking event detail is missing', () => {
      expect(
        assessDrivingImpactComputationQuality({
          distanceKm: 50,
          citySharePct: 20,
          highwaySharePct: 70,
          countryRoadSharePct: 10,
          brakingEventRowCount: 0,
          useTelemetryDrivingEvents: true,
        }),
      ).toBe('PARTIAL');
    });
  });

  describe('mapComputationQualityToTripStatus', () => {
    it('maps COMPLETE to READY and PARTIAL to PARTIAL', () => {
      expect(mapComputationQualityToTripStatus('COMPLETE')).toBe('READY');
      expect(mapComputationQualityToTripStatus('PARTIAL')).toBe('PARTIAL');
    });
  });

  describe('buildPersistedDrivingImpactOutcome', () => {
    it('includes modelVersion and calculatedAt', () => {
      const at = new Date('2026-07-16T12:00:00.000Z');
      const outcome = buildPersistedDrivingImpactOutcome({
        quality: 'COMPLETE',
        calculatedAt: at,
      });
      expect(outcome.drivingImpactStatus).toBe('READY');
      expect(outcome.stageState).toBe('done');
      expect(outcome.calculatedAt).toBe(at);
      expect(outcome.modelVersion).toMatch(/^v/);
    });
  });
});
