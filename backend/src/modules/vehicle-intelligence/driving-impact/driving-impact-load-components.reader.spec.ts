import { readTripDrivingImpactLoadComponents } from './driving-impact-load-components.reader';
import { DRIVING_IMPACT_LOAD_COMPONENTS_VERSION } from './driving-impact-load-components';

describe('driving-impact-load-components.reader', () => {
  const sample = {
    version: DRIVING_IMPACT_LOAD_COMPONENTS_VERSION,
    longitudinalLoad: {
      level: 'moderate',
      score: 42,
      evidenceStrength: 'HIGH',
      sourceQuality: 'PROVIDER_CLASSIFIED',
      assessability: 'ASSESSABLE',
      reasons: [],
    },
    brakingLoad: {
      level: 'high',
      score: 55,
      evidenceStrength: 'HIGH',
      sourceQuality: 'PROVIDER_CLASSIFIED',
      assessability: 'ASSESSABLE',
      reasons: [],
    },
    stopGoLoad: {
      level: 'moderate',
      score: 38,
      evidenceStrength: 'HIGH',
      sourceQuality: 'PROVIDER_CLASSIFIED',
      assessability: 'ASSESSABLE',
      reasons: [],
    },
    speedLoad: {
      level: 'low',
      score: 28,
      evidenceStrength: 'HIGH',
      sourceQuality: 'PROVIDER_CLASSIFIED',
      assessability: 'ASSESSABLE',
      reasons: [],
    },
    thermalLoad: {
      level: 'moderate',
      score: 48,
      evidenceStrength: 'HIGH',
      sourceQuality: 'PROVIDER_CLASSIFIED',
      assessability: 'ASSESSABLE',
      reasons: [],
    },
    engineLoad: {
      level: 'moderate',
      score: 48,
      evidenceStrength: 'HIGH',
      sourceQuality: 'MEASURED',
      assessability: 'ASSESSABLE',
      reasons: ['ICE_ENGINE_SIGNALS_PRESENT'],
    },
    tireLoad: {
      level: 'moderate',
      score: 44,
      evidenceStrength: 'HIGH',
      sourceQuality: 'PROVIDER_CLASSIFIED',
      assessability: 'ASSESSABLE',
      reasons: ['COMPOSITE_RENORMALIZED'],
    },
    dataQuality: {
      level: 'low',
      score: 92,
      evidenceStrength: 'HIGH',
      sourceQuality: 'MEASURED',
      assessability: 'ASSESSABLE',
      reasons: [],
    },
    vehicleLoad: {
      level: 'moderate',
      score: 41,
      coverage: 1,
      essentialComponentsAssessed: 4,
      essentialComponentsTotal: 4,
      evidenceStrength: 'HIGH',
      assessability: 'ASSESSABLE',
      reasons: [],
    },
  };

  it('reads from loadComponentsJson column', () => {
    const result = readTripDrivingImpactLoadComponents({
      loadComponentsJson: sample,
      sourceSummaryJson: null,
    });
    expect(result?.vehicleLoad.score).toBe(41);
  });

  it('falls back to sourceSummaryJson.loadComponents for legacy rows', () => {
    const result = readTripDrivingImpactLoadComponents({
      loadComponentsJson: null,
      sourceSummaryJson: { loadComponents: sample },
    });
    expect(result?.longitudinalLoad.score).toBe(42);
  });

  it('returns null when no structured components exist', () => {
    expect(
      readTripDrivingImpactLoadComponents({
        loadComponentsJson: null,
        sourceSummaryJson: { hardAccelCount: 3 },
      }),
    ).toBeNull();
  });
});
